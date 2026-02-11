import logging
from enum import Enum
from functools import lru_cache
from typing import Optional

from dotenv import load_dotenv
from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv(override=False)


logger = logging.getLogger(__name__)


class EnvironmentOption(str, Enum):
    DEV = "dev"
    STAGING = "staging"
    PROD = "prod"


class LLMProvider(str, Enum):
    OPENAI = "openai"
    HUGGINGFACE = "huggingface"


class Config(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    ENV: EnvironmentOption = EnvironmentOption.PROD
    API: str = "/api"
    API_V1_STR: str = "/api/v1"
    API_STR: str = "/api"
    MCP_STR: str = "/mcp"
    MCP_SERVER_URL: str = "http://127.0.0.1:8000/mcp"
    PROJECT_NAME: str = "Kurious FastAPI Template"
    DEBUG: Optional[bool] = None

    # CORS
    CORS_ORIGINS_STR: Optional[str] = ""
    BACKEND_CORS_ORIGINS: Optional[list[str]] = (
        [origin.strip() for origin in CORS_ORIGINS_STR.split(",")]
        if CORS_ORIGINS_STR
        else ["*"]
    )

    # Database
    DATABASE_URL: Optional[str] = None
    DB_USER: str
    DB_HOST: str
    DB_PORT: int
    DB_NAME: str
    DB_PASSWORD: SecretStr
    DB_SSL: Optional[str] = None
    DB_FORCE_ROLL_BACK: bool = False

    @model_validator(mode="after")
    def set_debug_default(self):
        if self.DEBUG is None:
            self.DEBUG = self.ENV == EnvironmentOption.DEV
        return self

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        from urllib.parse import quote_plus

        if self.DATABASE_URL:
            return self.DATABASE_URL

        db_password = quote_plus(self.DB_PASSWORD.get_secret_value())
        return (
            f"postgresql+asyncpg://{quote_plus(self.DB_USER)}:{db_password}@"
            f"{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    @property
    def SQLALCHEMY_CONNECT_ARGS(self) -> dict[str, object]:
        args: dict[str, object] = {"statement_cache_size": 0}

        if self.DB_SSL:
            ssl_mode = self.DB_SSL.strip().lower()
            if ssl_mode in {"disable", "false", "0", "no"}:
                args["ssl"] = False
            else:
                # asyncpg accepts bool/SSLContext; map common modes to enabled TLS.
                args["ssl"] = True

        return args

    # LLM Configs
    LLM_PROVIDER: LLMProvider = LLMProvider.OPENAI
    MODEL_NAME: Optional[str] = None

    OPENAI_API_KEY: Optional[SecretStr] = None
    HUGGINGFACE_API_TOKEN: Optional[SecretStr] = None

    # Clerk Authentication
    CLERK_JWKS_URL: str
    CLERK_SECRET_KEY: Optional[SecretStr] = None
    CLERK_WEBHOOK_SECRET: Optional[SecretStr] = None
    CLERK_ISSUER: Optional[str] = None
    CLERK_AUDIENCE: Optional[str] = None
    CLERK_AUTHORIZED_PARTIES: Optional[str] = None

    @property
    def CLERK_WEBHOOK_SECRET_VALUE(self) -> Optional[str]:
        if not self.CLERK_WEBHOOK_SECRET:
            return None
        return self.CLERK_WEBHOOK_SECRET.get_secret_value()

    @property
    def CLERK_AUDIENCES(self) -> list[str]:
        if not self.CLERK_AUDIENCE:
            return []
        return [aud.strip() for aud in self.CLERK_AUDIENCE.split(",") if aud.strip()]

    @property
    def CLERK_AUTHORIZED_PARTY_LIST(self) -> list[str]:
        if not self.CLERK_AUTHORIZED_PARTIES:
            return []
        return [
            party.strip()
            for party in self.CLERK_AUTHORIZED_PARTIES.split(",")
            if party.strip()
        ]

    # find query
    PAGE: int = 1
    PAGE_SIZE: int = 10
    ORDERING: str = "-id"


@lru_cache()
def get_config() -> Config:
    return Config()


config = get_config()
