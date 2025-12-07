import secrets
from typing import Optional, List
from pydantic import PostgresDsn, computed_field, Field, AliasChoices, field_validator
from pydantic_settings import BaseSettings


# Known insecure default values that must be changed in production
_INSECURE_SECRET_KEYS = {
    "your-secret-key-change-this-in-production-min-32-chars",
    "changeme",
    "secret",
    "development-secret",
}
_INSECURE_LICENSE_KEYS = {
    "churnvision-enterprise-secret-2024",
    "dev-license-key",
}
_INSECURE_DB_PASSWORDS = {
    "postgres",
    "password",
    "changeme",
}


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

    # Database connection pooling
    DB_POOL_SIZE: int = Field(default=20, description="Number of persistent DB connections")
    DB_MAX_OVERFLOW: int = Field(default=40, description="Max additional connections under load")

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
    # Default (local): Qwen 2.5 3B Instruct via Ollama - fast inference for Docker
    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434"
    OLLAMA_MODEL: str = "qwen2.5:3b-instruct"
    DEFAULT_LLM_PROVIDER: str = "ollama"  # 'openai', 'azure', 'ollama', 'mistral', 'ibm' - default to local

    # OpenAI (GPT-5.1) - highest intelligence and speed
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-5.1"

    # Azure OpenAI (GPT-5.1) - enterprise-grade with Azure compliance
    AZURE_OPENAI_API_KEY: Optional[str] = None
    AZURE_OPENAI_ENDPOINT: Optional[str] = None
    AZURE_OPENAI_MODEL: str = "gpt-5.1"
    AZURE_OPENAI_API_VERSION: str = "2024-02-15-preview"

    # Qwen3-Max (Alibaba Cloud) - excellent cost/performance
    QWEN_API_KEY: Optional[str] = None
    QWEN_MODEL: str = "qwen3-max"
    QWEN_BASE_URL: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"

    # Mistral Large 3 (European) - very high intelligence, open-weight
    MISTRAL_API_KEY: Optional[str] = None
    MISTRAL_MODEL: str = "mistral-large-latest"
    MISTRAL_BASE_URL: str = "https://api.mistral.ai/v1"

    # IBM Granite 3.0 - top-tier trust, safety & RAG faithfulness
    IBM_API_KEY: Optional[str] = None
    IBM_MODEL: str = "granite-3.0-8b-instruct"
    IBM_BASE_URL: str = "https://us-south.ml.cloud.ibm.com/ml/v1/text/generation"

    CHATBOT_MAX_HISTORY: int = 10  # Maximum number of previous messages to include in context
    CHATBOT_SYSTEM_PROMPT: str = "You are a helpful AI assistant for ChurnVision Enterprise, an employee churn prediction platform. You help users understand their workforce data, analyze employee turnover patterns, and make data-driven HR decisions."
    LLM_REQUEST_TIMEOUT: int = 120  # seconds - increased for detailed responses

    # RAG (Retrieval-Augmented Generation) Settings
    RAG_ENABLED: bool = True
    RAG_STORAGE_PATH: str = Field(
        default="./churnvision_data/rag",
        validation_alias=AliasChoices("RAG_STORAGE_PATH", "CHURNVISION_RAG_PATH"),
    )
    RAG_UPLOAD_PATH: str = Field(
        default="./churnvision_data/uploads/rag",
        validation_alias=AliasChoices("RAG_UPLOAD_PATH", "CHURNVISION_RAG_UPLOADS"),
    )
    RAG_CHUNK_SIZE: int = 500  # Characters per chunk
    RAG_CHUNK_OVERLAP: int = 50  # Overlap between chunks
    RAG_EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    RAG_COLLECTION_NAME: str = "churnvision_docs"
    RAG_TOP_K: int = 5  # Number of chunks to retrieve
    RAG_SIMILARITY_THRESHOLD: float = 0.7  # Minimum similarity score
    RAG_MAX_DOCUMENT_SIZE_MB: int = 50  # Maximum document size in MB

    @computed_field
    @property
    def COOKIE_SECURE(self) -> bool:
        """Only set secure cookies in production."""
        return self.ENVIRONMENT.lower() == "production"

    def model_post_init(self, __context):
        """
        Validate configuration on startup. In production, fail hard if insecure defaults are detected.
        This prevents accidental deployment with development credentials.
        """
        is_prod = self.ENVIRONMENT.lower() == "production"
        errors = []

        # Validate SECRET_KEY
        if self.SECRET_KEY in _INSECURE_SECRET_KEYS or len(self.SECRET_KEY) < 32:
            if is_prod:
                errors.append(
                    "SECRET_KEY is insecure. Generate a new key with: "
                    f"python -c \"import secrets; print(secrets.token_urlsafe(32))\""
                )

        # Validate LICENSE_SECRET_KEY
        if self.LICENSE_SECRET_KEY in _INSECURE_LICENSE_KEYS:
            if is_prod:
                errors.append(
                    "LICENSE_SECRET_KEY is using a default value. "
                    "Set a unique LICENSE_SECRET_KEY in your environment."
                )

        # Validate database credentials
        if self.POSTGRES_PASSWORD in _INSECURE_DB_PASSWORDS:
            if is_prod:
                errors.append(
                    "POSTGRES_PASSWORD is insecure. "
                    "Set a strong password in your environment."
                )

        # Validate LICENSE_KEY
        if self.LICENSE_KEY in _INSECURE_LICENSE_KEYS:
            if is_prod:
                errors.append(
                    "LICENSE_KEY must be provided via environment or license file in production."
                )

        # In production, DEBUG must be disabled
        if is_prod and self.DEBUG:
            errors.append("DEBUG must be False in production.")

        # Fail hard with all errors at once for easier debugging
        if errors:
            error_msg = "Production configuration errors:\n" + "\n".join(f"  - {e}" for e in errors)
            raise ValueError(error_msg)

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, value):
        if isinstance(value, str):
            return [v.strip() for v in value.split(",") if v.strip()]
        return value

    class Config:
        env_file = ".env"

settings = Settings()
