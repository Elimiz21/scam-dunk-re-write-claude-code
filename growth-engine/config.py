from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str

    # Discovery APIs
    serper_api_key: str = ""
    perplexity_api_key: str = ""

    # Drafting
    openai_api_key: str = ""

    # X (Twitter) API v2
    x_api_key: str = ""
    x_api_secret: str = ""
    x_access_token: str = ""
    x_access_token_secret: str = ""

    # Growth engine API key
    growth_engine_api_key: str = ""

    # Schedule overrides
    discovery_interval_hours: int = 4
    monitoring_interval_hours: int = 12

    class Config:
        env_file = ".env"


settings = Settings()
