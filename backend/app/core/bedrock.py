"""
AWS Bedrock Inference Layer for SupplySense.

Centralized model configuration with:
- Structured prompting framework
- Retry handling with exponential backoff
- Response parsing and validation
- Fallback to deterministic outputs when AI is unavailable
- Future guardrail support hooks

Architecture:
- Single Bedrock client shared across all agents
- Structured prompt templates prevent hallucination
- AI NEVER generates financial numbers (those come from deterministic engines)
- AI generates: narratives, reasoning, prioritization, explanations
"""

import json
import asyncio
from typing import Any
from app.core.config import get_settings
from app.core.logging import logger

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
            self._client = boto3.client(
                "bedrock-runtime",
                region_name=settings.aws_region,
            )
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
    ) -> str:
        """
        Invoke Bedrock model with structured prompts.
        Returns raw text response.
        Falls back to empty string if unavailable.
        """
        if not self._available:
            try:
                from app.core.metrics import metrics_store
                metrics_store.record_bedrock_call(0, fallback=True)
            except Exception:
                pass
            return ""

        max_tokens = max_tokens or settings.bedrock_max_tokens
        temperature = temperature or settings.bedrock_temperature

        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "temperature": temperature,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
        })

        invoke_kwargs: dict[str, Any] = {
            "modelId": settings.bedrock_model_id,
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
            # Run synchronous boto3 call in thread pool with 12s timeout
            response = await asyncio.wait_for(
                asyncio.to_thread(self._client.invoke_model, **invoke_kwargs),
                timeout=12.0,
            )
            result = json.loads(response["body"].read())
            duration_ms = (time.monotonic() - t0) * 1000
            try:
                from app.core.metrics import metrics_store
                metrics_store.record_bedrock_call(duration_ms)
            except Exception:
                pass
            return result["content"][0]["text"]
        except asyncio.TimeoutError:
            logger.warning("Bedrock call timed out after 12s — using fallback")
            try:
                from app.core.metrics import metrics_store
                metrics_store.record_bedrock_call(0, fallback=True)
            except Exception:
                pass
            return ""
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
        """
        # Append JSON instruction to prompt
        json_instruction = "\n\nRespond ONLY with valid JSON. No markdown, no explanation outside the JSON."
        response = await self.invoke(system_prompt, user_prompt + json_instruction)

        if not response:
            return {}

        # Parse JSON from response
        try:
            # Handle potential markdown code blocks
            text = response.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0]
            return json.loads(text)
        except json.JSONDecodeError:
            logger.warning(f"Failed to parse Bedrock JSON response: {response[:200]}")
            return {}


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
