from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator
from urllib.parse import urlsplit

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    ENVIRONMENT: str = "production"
    DATABASE_URL: str
    JWT_SECRET: str
    CORS_ORIGINS: str

    @model_validator(mode="after")
    def validate_security(self):
        if len(self.JWT_SECRET) < 32 or any(x in self.JWT_SECRET.lower() for x in ("change-me", "replace", "example")):
            raise ValueError("JWT_SECRET must be a generated secret of at least 32 characters")
        if self.ENVIRONMENT not in {"production", "test"}:
            raise ValueError("Invalid ENVIRONMENT")
        if self.ENVIRONMENT == "production" and not self.DATABASE_URL.startswith("postgresql"):
            raise ValueError("Production requires PostgreSQL")
        if "*" in self.CORS_ORIGINS:
            raise ValueError("Explicit CORS origins required")
        origins = [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
        for origin in origins:
            parsed = urlsplit(origin)
            if not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
                raise ValueError("CORS_ORIGINS must contain origins without paths or credentials")
            if parsed.scheme not in {"http", "https"}:
                raise ValueError("Invalid origin scheme")
            if self.ENVIRONMENT == "production" and (parsed.scheme != "https" or parsed.hostname in {"localhost", "127.0.0.1", "::1"}):
                raise ValueError("Production requires HTTPS domain origins")
        return self

settings = Settings()
