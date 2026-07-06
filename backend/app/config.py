from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    """App runtime connection -- MUST be a non-superuser role (steel_recon_app,
    created by migration 0003), since PostgreSQL superusers and table owners
    bypass Row-Level Security entirely. Verified live during Foundation setup:
    RLS silently no-ops for a superuser connection."""

    migration_database_url: str
    """Connection Alembic runs migrations as -- needs owner/superuser privileges
    (CREATE ROLE, GRANT, DDL) that the restricted app role deliberately lacks."""

    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 480


settings = Settings()
