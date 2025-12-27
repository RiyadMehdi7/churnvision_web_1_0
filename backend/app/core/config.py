import os
import secrets
from typing import Optional, List
from urllib.parse import urlsplit

from pydantic import PostgresDsn, computed_field, Field, AliasChoices, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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

_INSECURE_ALLOWED_ORIGINS_DEFAULTS = {
    "http://localhost:3000",
    "http://localhost:4001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:4001",
}


def _extract_password_from_database_url(database_url: str | None) -> str | None:
    if not database_url:
        return None
    try:
        parts = urlsplit(database_url)
        return parts.password
    except Exception:
        return None


class Settings(BaseSettings):
    # Allow comma-separated env vars for list fields like ALLOWED_ORIGINS
    model_config = SettingsConfigDict(env_file=".env", env_parse_delimiter=",")
    PROJECT_NAME: str = "ChurnVision Enterprise"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # CORS
    # NOTE: Pydantic Settings treats list fields as "complex" env values (expects JSON).
    # We accept either a JSON array or a comma-separated string by allowing `str` here
    # and normalizing via the field validator below.
    ALLOWED_ORIGINS: List[str] | str = Field(
        default_factory=lambda: ["http://localhost:3000", "http://localhost:4001"],
        validation_alias=AliasChoices("ALLOWED_ORIGINS", "BACKEND_CORS_ORIGINS"),
    )

    # Database settings
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_SERVER: str = Field(
        default="db",
        validation_alias=AliasChoices("POSTGRES_SERVER", "POSTGRES_HOST", "POSTGRES_HOSTNAME"),
    )
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "churnvision"

    # Database connection pooling
    DB_POOL_SIZE: int = Field(default=20, description="Number of persistent DB connections")
    DB_MAX_OVERFLOW: int = Field(default=40, description="Max additional connections under load")

    # Full DB URL (preferred in CI/containers). If not provided, we build it from POSTGRES_*.
    DATABASE_URL: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("DATABASE_URL", "SQLALCHEMY_DATABASE_URI"),
    )

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

    # License verification (production hardening)
    LICENSE_SIGNING_ALG: str = "HS256"  # Use RS256 in production with a public key
    LICENSE_PUBLIC_KEY: Optional[str] = None
    LICENSE_PUBLIC_KEY_PATH: Optional[str] = None
    LICENSE_REQUIRE_HARDWARE: bool = True
    LICENSE_REQUIRE_INSTALLATION_ID: bool = True
    LICENSE_STATE_PATH: str = "/app/churnvision_data/license_state.json"
    LICENSE_MAX_CLOCK_SKEW_SECONDS: int = 300
    LICENSE_CACHE_TTL_SECONDS: int = 60
    INSTALLATION_ID_PATH: str = "/app/churnvision_data/installation.id"

    # Integrity verification
    INTEGRITY_MANIFEST_PATH: str = "/etc/churnvision/integrity.json"
    INTEGRITY_SIGNATURE_PATH: str = "/etc/churnvision/integrity.sig"
    INTEGRITY_PUBLIC_KEY: Optional[str] = None
    INTEGRITY_PUBLIC_KEY_PATH: Optional[str] = None
    INTEGRITY_REQUIRE_SIGNED: bool = True

    # Rate limiting / lockout
    LOGIN_MAX_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15
    LOGIN_ATTEMPT_WINDOW_MINUTES: int = 15

    # Redis configuration (for caching and rate limiting)
    # Use rediss:// for TLS connections (e.g., rediss://redis:6379/0)
    REDIS_URL: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("REDIS_URL", "CACHE_REDIS_URL"),
    )
    # Optional: Path to CA certificate for Redis TLS verification
    REDIS_TLS_CA_CERT: Optional[str] = None

    # Field-level encryption key (for sensitive data like salaries)
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    ENCRYPTION_KEY: Optional[str] = None

    # Model/artifact storage
    MODELS_DIR: str = Field(default="models", validation_alias=AliasChoices("MODELS_DIR", "CHURNVISION_MODELS_DIR"))
    ARTIFACT_ENCRYPTION_REQUIRED: bool = False

    # Chatbot / LLM settings
    # Default (local): Gemma 3 4B via Ollama - best instruction following
    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434"
    OLLAMA_MODEL: str = "gemma3:4b"
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
    LLM_REQUEST_TIMEOUT: int = 300  # seconds - 5min for dev (Gemma 3 slow in Docker, fast on prod with GPU)

    # PII Masking for Cloud LLM Providers (GDPR/Privacy Compliance)
    # When enabled, employee names, IDs, salaries are masked before sending to cloud LLMs
    # and unmasked in the response. Local providers (Ollama) are never masked.
    PII_MASKING_ENABLED: bool = True  # Default: ON for privacy compliance
    PII_MASK_DEPARTMENTS: bool = False  # Also mask department names
    PII_MASK_POSITIONS: bool = False  # Also mask job titles

    # Action execution feature flag (email/meeting/task integrations)
    ACTION_EXECUTION_ENABLED: bool = False

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
        # Fill DATABASE_URL if it wasn't provided explicitly
        if not self.DATABASE_URL:
            self.DATABASE_URL = (
                f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
                f"@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )

        is_prod = self.ENVIRONMENT.lower() == "production"
        errors = []
        db_url_password = _extract_password_from_database_url(self.DATABASE_URL)

        # Validate SECRET_KEY
        if self.SECRET_KEY in _INSECURE_SECRET_KEYS or len(self.SECRET_KEY) < 32:
            if is_prod:
                errors.append(
                    "SECRET_KEY is insecure. Generate a new key with: "
                    f"python -c \"import secrets; print(secrets.token_urlsafe(32))\""
                )

        # Validate LICENSE_SECRET_KEY
        signing_alg = (self.LICENSE_SIGNING_ALG or "HS256").upper()
        if signing_alg == "HS256":
            if self.LICENSE_SECRET_KEY in _INSECURE_LICENSE_KEYS:
                if is_prod:
                    errors.append(
                        "LICENSE_SECRET_KEY is using a default value. "
                        "Set a unique LICENSE_SECRET_KEY in your environment."
                    )
        elif signing_alg == "RS256":
            if is_prod and not (self.LICENSE_PUBLIC_KEY or self.LICENSE_PUBLIC_KEY_PATH):
                errors.append(
                    "LICENSE_PUBLIC_KEY or LICENSE_PUBLIC_KEY_PATH is required for RS256 license validation."
                )
            if self.LICENSE_PUBLIC_KEY_PATH and not os.path.exists(self.LICENSE_PUBLIC_KEY_PATH):
                errors.append("LICENSE_PUBLIC_KEY_PATH does not exist.")
        else:
            errors.append("LICENSE_SIGNING_ALG must be HS256 or RS256.")

        # Validate database credentials
        if is_prod:
            # Only require POSTGRES_PASSWORD to be strong if we're relying on POSTGRES_* to build DATABASE_URL
            # (in CI/prod we often set DATABASE_URL directly and do not provide POSTGRES_PASSWORD).
            relying_on_components = not bool(self.DATABASE_URL) or db_url_password is None
            if relying_on_components and self.POSTGRES_PASSWORD in _INSECURE_DB_PASSWORDS:
                errors.append(
                    "POSTGRES_PASSWORD is insecure. "
                    "Set a strong password in your environment (or provide DATABASE_URL with a strong password)."
                )
            if db_url_password and db_url_password in _INSECURE_DB_PASSWORDS:
                errors.append("DATABASE_URL contains an insecure password.")

        # Validate LICENSE_KEY
        if self.LICENSE_KEY in _INSECURE_LICENSE_KEYS:
            if is_prod:
                errors.append(
                    "LICENSE_KEY must be provided via environment or license file in production."
                )

        # Require asymmetric license validation in production to prevent key reuse
        if is_prod and signing_alg != "RS256":
            errors.append("LICENSE_SIGNING_ALG must be RS256 in production.")

        # Require encryption key for PII in production
        if is_prod and not self.ENCRYPTION_KEY:
            errors.append(
                "ENCRYPTION_KEY is required in production. "
                "Generate with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )

        # Require explicit ALLOWED_ORIGINS in production (avoid accidental localhost defaults)
        if is_prod and (not self.ALLOWED_ORIGINS or set(self.ALLOWED_ORIGINS).issubset(_INSECURE_ALLOWED_ORIGINS_DEFAULTS)):
            errors.append(
                "ALLOWED_ORIGINS must be set to your domain(s) in production (not localhost defaults)."
            )

        # Integrity enforcement (signed manifest required in production)
        if is_prod and self.INTEGRITY_REQUIRE_SIGNED:
            if not (self.INTEGRITY_PUBLIC_KEY or self.INTEGRITY_PUBLIC_KEY_PATH):
                errors.append("INTEGRITY_PUBLIC_KEY or INTEGRITY_PUBLIC_KEY_PATH is required in production.")
            if self.INTEGRITY_PUBLIC_KEY_PATH and not os.path.exists(self.INTEGRITY_PUBLIC_KEY_PATH):
                errors.append("INTEGRITY_PUBLIC_KEY_PATH does not exist.")
            if self.INTEGRITY_MANIFEST_PATH and not os.path.exists(self.INTEGRITY_MANIFEST_PATH):
                errors.append("INTEGRITY_MANIFEST_PATH does not exist.")
            if self.INTEGRITY_SIGNATURE_PATH and not os.path.exists(self.INTEGRITY_SIGNATURE_PATH):
                errors.append("INTEGRITY_SIGNATURE_PATH does not exist.")

        # Require encrypted artifacts in production
        if is_prod and not self.ARTIFACT_ENCRYPTION_REQUIRED:
            errors.append("ARTIFACT_ENCRYPTION_REQUIRED must be true in production.")

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

settings = Settings()
