"""Shared httpx client factory with proxy support."""
import httpx
from .app_settings import app_settings_service


def get_proxy_url() -> str | None:
    """Build proxy URL from app settings if proxy is enabled."""
    settings = app_settings_service.get()
    proxy = settings.get("proxy", {})
    if not proxy.get("enabled"):
        return None
    host = proxy.get("host", "")
    port = proxy.get("port")
    if not host:
        return None
    proxy_type = proxy.get("type", "http")
    url = f"{proxy_type}://{host}"
    if port:
        url += f":{port}"
    return url


def create_client(**kwargs) -> httpx.AsyncClient:
    """Create an httpx.AsyncClient with optional proxy from app settings."""
    kwargs.setdefault("trust_env", False)
    proxy_url = get_proxy_url()
    if proxy_url:
        kwargs["proxy"] = proxy_url
    return httpx.AsyncClient(**kwargs)
