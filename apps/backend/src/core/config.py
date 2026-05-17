"""Core configuration module."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppConfig(BaseSettings):
    """Application configuration."""

    model_config = SettingsConfigDict(
        env_prefix="BILITOOLS_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # App settings
    debug: bool = False
    log_level: str = "INFO"

    # Paths
    data_dir: str = "./data"
    cookies_dir: str = "./data/cookies"
    cache_dir: str = "./data/cache"
    project_root: str = "../.."
    config_dir: str = "../../config"
    legacy_config_dir: str = "../../src/config"
    executable_dir: str = "../../execute"
    legacy_executable_dir: str = "../../client/execute"

    # Bilibili API
    bilibili_api_base: str = "https://api.bilibili.com"
    bilibili_web_base: str = "https://www.bilibili.com"

    # Network
    timeout: int = 30
    max_retries: int = 3

    # IPC
    ipc_host: str = "127.0.0.1"
    ipc_port: int = 3847


config = AppConfig()
