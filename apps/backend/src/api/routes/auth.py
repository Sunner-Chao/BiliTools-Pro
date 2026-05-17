"""Authentication routes."""
from typing import Dict, Any

from ..ipc_server import IPCServer
from src.services.bilibili import bilibili_service


async def register(ipc: IPCServer) -> None:
    """Register auth routes."""

    async def login_by_qr() -> Dict[str, Any]:
        return await bilibili_service.generate_qr_login()

    async def check_qr_status(qr_key: str) -> Dict[str, Any]:
        return await bilibili_service.check_qr_status(qr_key)

    async def login_by_cookie(cookie: str) -> Dict[str, Any]:
        return await bilibili_service.login_by_cookie(cookie)

    async def get_auth_status() -> Dict[str, Any]:
        logged_in = await bilibili_service.is_logged_in()
        user = await bilibili_service.get_user_info() if logged_in else None
        if user and not user.get("isLogin", True):
            logged_in = False
            user = None
        return {"isAuthenticated": logged_in, "user": user}

    async def logout() -> Dict[str, Any]:
        await bilibili_service.logout()
        return {"success": True}

    ipc.register_handler("auth:loginByQR", login_by_qr)
    ipc.register_handler("auth:checkQRStatus", check_qr_status)
    ipc.register_handler("auth:loginByCookie", login_by_cookie)
    ipc.register_handler("auth:getStatus", get_auth_status)
    ipc.register_handler("auth:logout", logout)
