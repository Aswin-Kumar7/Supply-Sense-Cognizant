"""
AWS Bedrock Inference Layer for SupplySense.
"""
from __future__ import annotations

import json
import asyncio
from typing import Any, TypeVar
from app.core.config import get_settings
from app.core.logging import logger

T = TypeVar("T")

settings = get_settings()

# Attempt to import boto3 - graceful fallback if not available
try:
    import boto3
    BEDROCK_AVAILABLE = True
except ImportError:
    BEDROCK_AVAILABLE = False
    logger.warning("boto3 not available - AI features will use fallback mode")


class BedrockInference:
    """
    Centralized Bedrock inference client.
    Handles model invocation, retries, and structured output parsing.
    """

    def __init__(self):
        self._client = None
        self._available = False
        self._init_client()

    def _init_client(self):
        """Initialize Bedrock client. Fails gracefully."""
        if not BEDROCK_AVAILABLE:
            return
        try:
            import urllib3
            from botocore.config import Config
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            client_kwargs = {
                "region_name": settings.aws_region,
                "verify": False,
                # Hard network timeout so boto3 threads don't linger after asyncio cancels
                "config": Config(
                    read_timeout=12,
                    connect_timeout=5,
                    retries={"max_attempts": 0},
                ),
            }
            if settings.aws_access_key_id:
                client_kwargs["aws_access_key_id"] = settings.aws_access_key_id
            if settings.aws_secret_access_key:
                client_kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
            self._client = boto3.client("bedrock-runtime", **client_kwargs)
            self._available = True
            logger.info(f"Bedrock client initialized: {settings.bedrock_model_id}")
        except Exception as e:
            logger.warning(f"Bedrock client init failed: {e}. Using fallback mode.")
            self._available = False

    @property
    def is_available(self) -> bool:
        return self._available

    async def invoke(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int | None = None,
        temperature: float | None = None,
        model_id: str | None = None,
    ) -> str:
        """
        Invoke Bedrock model with structured prompts.
        Returns raw text response.
        Falls back to empty string if unavailable.

        model_id overrides the default model for this single call — used for
        model routing (e.g. a stronger planning model for plan design) while the
        cheap default model keeps handling high-frequency narration.
        """
        if not self._available:
            try:
                from app.core.metrics import metrics_store
                metrics_store.record_bedrock_call(0, fallback=True)
            except Exception:
                pass
            return ""

        max_tokens = max_tokens or settings.bedrock_max_tokens
        temperature = temperature if temperature is not None else settings.bedrock_temperature

        model_id = model_id or settings.bedrock_model_id
        is_nova = "nova" in model_id or model_id.startswith("amazon.")

        if is_nova:
            # Amazon Nova uses the Converse-style body format
            body = json.dumps({
                "messages": [{"role": "user", "content": [{"text": user_prompt}]}],
                "system": [{"text": system_prompt}],
                "inferenceConfig": {"maxTokens": max_tokens, "temperature": temperature},
            })
        else:
            # Anthropic Claude on Bedrock
            body = json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": max_tokens,
                "temperature": temperature,
                "system": system_prompt,
                "messages": [{"role": "user", "content": user_prompt}],
            })

        invoke_kwargs: dict[str, Any] = {
            "modelId": model_id,
            "body": body,
            "contentType": "application/json",
            "accept": "application/json",
        }
        # Attach guardrail when configured — blocks hallucinated suppliers,
        # rupee figures that don't match engine outputs, and low-confidence certainty claims.
        if settings.bedrock_guardrail_id:
            invoke_kwargs["guardrailIdentifier"] = settings.bedrock_guardrail_id
            invoke_kwargs["guardrailVersion"] = settings.bedrock_guardrail_version

        import time
        t0 = time.monotonic()
        try:
            # Run synchronous boto3 call in thread pool — boto3 read_timeout=12s enforces the hard limit
            response = await asyncio.to_thread(self._client.invoke_model, **invoke_kwargs)
            result = json.loads(response["body"].read())
            duration_ms = (time.monotonic() - t0) * 1000
            try:
                from app.core.metrics import metrics_store
                metrics_store.record_bedrock_call(duration_ms)
            except Exception:
                pass
            # Parse response based on model family
            if is_nova:
                return result["output"]["message"]["content"][0]["text"]
            return result["content"][0]["text"]
        except Exception as e:
            logger.error(f"Bedrock invocation failed: {e}")
            try:
                from app.core.metrics import metrics_store
                metrics_store.record_bedrock_call(0, fallback=True)
            except Exception:
                pass
            return ""

    async def invoke_structured(
        self,
        system_prompt: str,
        user_prompt: str,
        output_schema: dict | None = None,
    ) -> dict:
        """
        Invoke Bedrock and parse JSON response.
        Falls back to empty dict if parsing fails.

        Prefer invoke_typed() for new call sites — it validates the response
        against a Pydantic model and rejects unexpected or out-of-range fields.
        """
        json_instruction = "\n\nRespond ONLY with valid JSON. No markdown, no explanation outside the JSON."
        response = await self.invoke(system_prompt, user_prompt + json_instruction)

        if not response:
            return {}

        try:
            text = response.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0]
            return json.loads(text)
        except json.JSONDecodeError:
            logger.warning(f"Failed to parse Bedrock JSON response: {response[:200]}")
            return {}

    async def invoke_typed(
        self,
        system_prompt: str,
        user_prompt: str,
        response_model: type[T],
        repair_attempts: int = 1,
        model_id: str | None = None,
        max_tokens: int | None = None,
        temperature: float | None = None,
    ) -> T | None:
        """
        Invoke Bedrock and validate the response against a Pydantic model.

        Differences from invoke_structured():
        - Validates schema using model_validate() with extra="forbid".
        - Rejects unexpected fields (prevents AI from sneaking in authoritative
          values like risk_score or supplier_id).
        - Allows one repair attempt: the model is shown its validation errors
          and asked to correct them.
        - Returns None on final failure — callers must use their deterministic
          fallback. Never returns a partially-valid dict.

        Use for ALL new AI call sites. invoke_structured() is kept only for
        legacy compatibility.
        """
        from pydantic import ValidationError

        _JSON_INSTRUCTION = (
            "\n\nRespond ONLY with valid JSON matching the required schema. "
            "No markdown code fences, no explanation outside the JSON object."
        )

        response_text = await self.invoke(
            system_prompt, user_prompt + _JSON_INSTRUCTION,
            max_tokens=max_tokens, temperature=temperature, model_id=model_id,
        )

        if not response_text:
            return None

        current_text = response_text
        for attempt in range(repair_attempts + 1):
            raw = current_text.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                logger.warning(
                    f"invoke_typed: JSON parse failed (attempt {attempt + 1}/"
                    f"{repair_attempts + 1}) model={response_model.__name__}: {raw[:200]}"
                )
                if attempt < repair_attempts:
                    repair = (
                        f"Your previous response was not valid JSON. "
                        f"Produce ONLY a JSON object with no surrounding text. "
                        f"Previous (broken) response: {raw[:400]}"
                    )
                    current_text = await self.invoke(
                        system_prompt, repair + _JSON_INSTRUCTION,
                        max_tokens=max_tokens, temperature=temperature, model_id=model_id,
                    )
                    continue
                return None

            try:
                return response_model.model_validate(data)
            except ValidationError as exc:
                errors = exc.errors()
                logger.warning(
                    f"invoke_typed: schema validation failed (attempt {attempt + 1}/"
                    f"{repair_attempts + 1}) model={response_model.__name__} "
                    f"errors={errors[:3]}"
                )
                if attempt < repair_attempts:
                    repair = (
                        f"Your previous JSON failed schema validation with these errors: "
                        f"{errors[:3]}. "
                        f"Produce ONLY a corrected JSON object."
                    )
                    current_text = await self.invoke(
                        system_prompt, repair + _JSON_INSTRUCTION,
                        max_tokens=max_tokens, temperature=temperature, model_id=model_id,
                    )
                    continue
                return None

        return None


# Singleton instance
bedrock = BedrockInference()


async def validate_with_guardrail(text_fields: dict) -> tuple[dict, bool]:
    """
    Validate text fields against the configured Bedrock Guardrail.

    Uses the ApplyGuardrail API to check each text field for content policy
    violations. If any field is blocked, it is replaced with an empty string.

    Args:
        text_fields: Dict of field_name -> text_value to validate.

    Returns:
        Tuple of (validated_fields, was_blocked) where was_blocked is True
        if any field was intervened upon by the guardrail.
    """
    # Pass through if guardrail is not configured
    if not settings.bedrock_guardrail_id:
        return (text_fields, False)

    # Pass through if Bedrock client is not available
    if not bedrock._client:
        return (text_fields, False)

    was_blocked = False
    validated_fields = dict(text_fields)

    for field_name, field_value in text_fields.items():
        # Skip empty/None values
        if not field_value:
            continue

        try:
            response = await asyncio.to_thread(
                bedrock._client.apply_guardrail,
                guardrailIdentifier=settings.bedrock_guardrail_id,
                guardrailVersion=settings.bedrock_guardrail_version,
                source="OUTPUT",
                content=[{"text": {"text": field_value}}],
            )

            action = response.get("action", "")
            if action == "GUARDRAIL_INTERVENED":
                was_blocked = True
                validated_fields[field_name] = ""
                logger.warning(
                    f"Guardrail blocked field '{field_name}': "
                    f"action={action}"
                )
        except Exception as e:
            # On error, allow the field through (fail-open)
            logger.error(
                f"Guardrail validation failed for field '{field_name}': {e}"
            )

    return (validated_fields, was_blocked)
