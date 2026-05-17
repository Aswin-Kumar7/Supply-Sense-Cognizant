"""
Centralized application configuration.
Uses pydantic-settings for type-safe environment variable parsing.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Application
    app_name: str = "SupplySense"
    app_version: str = "0.5.0"
    environment: str = "development"

    # Database — must be set via DATABASE_URL env var or .env file; no default to prevent
    # accidental connections to production. Raises ValidationError at startup if missing.
    database_url: str
    # SSL settings for Aurora/RDS — set DB_SSL_MODE=require and DB_SSL_CERT_PATH=./global-bundle.pem
    db_ssl_mode: str = ""          # e.g. "require", "verify-full", or "" to disable
    db_ssl_cert_path: str = ""     # path to AWS global-bundle.pem

    # AWS Bedrock
    aws_region: str = "us-east-1"
    bedrock_model_id: str = "anthropic.claude-3-haiku-20240307-v1:0"
    bedrock_max_tokens: int = 2048
    bedrock_temperature: float = 0.3
    # Guardrail ID — optional. When set, attached to every Bedrock invocation.
    # Blocks: hallucinated supplier names, rupee figures not matching engine outputs,
    #         false certainty claims when confidence is low.
    bedrock_guardrail_id: str | None = None
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
