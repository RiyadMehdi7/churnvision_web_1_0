from typing import Optional, List
from pydantic import PostgresDsn, computed_field, Field, AliasChoices, field_validator
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "ChurnVision Enterprise"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # CORS
    ALLOWED_ORIGINS: List[str] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://localhost:4001"],
        validation_alias=AliasChoices("ALLOWED_ORIGINS", "BACKEND_CORS_ORIGINS"),
    )

    # Database settings
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_SERVER: str = "db"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "churnvision"

    @computed_field
    @property
    def DATABASE_URL(self) -> str:
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    SQLALCHEMY_ECHO: bool = False

    # Security settings
    SECRET_KEY: str = Field(
        default="your-secret-key-change-this-in-production-min-32-chars",
        validation_alias=AliasChoices("JWT_SECRET_KEY", "SECRET_KEY"),
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # License signing
    LICENSE_SECRET_KEY: str = Field(
        default="churnvision-enterprise-secret-2024",
        validation_alias=AliasChoices("LICENSE_SECRET_KEY", "LICENSE_SIGNING_KEY"),
    )

    # Password policy
    MIN_PASSWORD_LENGTH: int = 8
    REQUIRE_SPECIAL_CHARS: bool = True

    LICENSE_KEY: str = "dev-license-key"

    # Rate limiting / lockout
    LOGIN_MAX_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15
    LOGIN_ATTEMPT_WINDOW_MINUTES: int = 15

    # Model/artifact storage
    MODELS_DIR: str = Field(default="models", validation_alias=AliasChoices("MODELS_DIR", "CHURNVISION_MODELS_DIR"))

    # Chatbot / LLM settings
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-5.1"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen3:4b"
    DEFAULT_LLM_PROVIDER: str = "openai"  # 'openai' or 'ollama'
    CHATBOT_MAX_HISTORY: int = 10  # Maximum number of previous messages to include in context
    CHATBOT_SYSTEM_PROMPT: str = "You are a helpful AI assistant for ChurnVision Enterprise, a customer churn prediction platform. You help users understand their data, analyze churn patterns, and make data-driven decisions."
    LLM_REQUEST_TIMEOUT: int = 30  # seconds

    @computed_field
    @property
    def COOKIE_SECURE(self) -> bool:
        """Only set secure cookies in production."""
        return self.ENVIRONMENT.lower() == "production"

    def model_post_init(self, __context):
        if self.ENVIRONMENT == "production" and self.SECRET_KEY.startswith("your-secret-key-change-this"):
            raise ValueError("SECRET_KEY must be set in production.")

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, value):
        if isinstance(value, str):
            return [v.strip() for v in value.split(",") if v.strip()]
        return value

    class Config:
        env_file = ".env"

settings = Settings()
