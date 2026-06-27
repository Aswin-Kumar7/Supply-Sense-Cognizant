"""
Centralized application configuration.
Uses pydantic-settings for type-safe environment variable parsing.
"""

from typing import Optional
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Application
    app_name: str = "SupplySense"
    app_version: str = "0.5.0"
    environment: str = "development"

    # Database — must be set in .env (no hardcoded default)
    database_url: str

    # AWS Bedrock
    aws_region: str = "us-east-1"
    bedrock_model_id: str = "anthropic.claude-haiku-4-5-20251001-v1:0"
    bedrock_max_tokens: int = 2048
    bedrock_temperature: float = 0.3
    # Guardrail ID — optional. When set, attached to every Bedrock invocation.
    # Blocks: hallucinated supplier names, rupee figures not matching engine outputs,
    #         false certainty claims when confidence is low.
    bedrock_guardrail_id: Optional[str] = None
    bedrock_guardrail_version: str = "DRAFT"

    # Server
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    backend_reload: bool = True
    log_level: str = "INFO"

    # CORS
    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
