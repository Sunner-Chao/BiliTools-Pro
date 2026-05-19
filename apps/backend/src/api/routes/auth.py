"""Authentication routes."""
import re
from typing import Dict, Any

from ..ipc_server import IPCServer
from src.core.response import ErrorCode, fail, ok
from src.services.bilibili import bilibili_service


_COOKIE_PATTERN = re.compile(r"SESSDATA=.+?")


async def register(ipc: IPCServer) -> None:
    """Register auth routes."""

    async def login_by_qr() -> Dict[str, Any]:
        return await bilibili_service.generate_qr_login()

    async def check_qr_status(qr_key: str) -> Dict[str, Any]:
        return await bilibili_service.check_qr_status(qr_key)

    async def login_by_cookie(cookie: str) -> Dict[str, Any]:
        # Validate cookie format before hitting upstream
        if not cookie or not cookie.strip():
            return fail("请输入 Cookie", ErrorCode.VALIDATION_ERROR, error_field="cookie")
        if "SESSDATA" not in cookie:
            return fail("Cookie 中缺少 SESSDATA 字段", ErrorCode.VALIDATION_ERROR, error_field="cookie")
        return await bilibili_service.login_by_cookie(cookie)

    async def get_auth_status() -> Dict[str, Any]:
        logged_in = await bilibili_service.is_logged_in()
        user = await bilibili_service.get_user_info() if logged_in else None
        if user and not user.get("isLogin", True):
            logged_in = False
            user = None
        if not logged_in:
            return fail("未登录", ErrorCode.UNAUTHORIZED)
        return ok({"isAuthenticated": True, "user": user})

    async def logout() -> Dict[str, Any]:
        await bilibili_service.logout()
        return ok({"loggedOut": True})

    ipc.register_handler("auth:loginByQR", login_by_qr)
    ipc.register_handler("auth:checkQRStatus", check_qr_status)
    ipc.register_handler("auth:loginByCookie", login_by_cookie)
    ipc.register_handler("auth:getStatus", get_auth_status)
    ipc.register_handler("auth:logout", logout)
