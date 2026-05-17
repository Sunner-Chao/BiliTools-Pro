"""Bilibili service for authentication and API interactions."""
import asyncio
import json
import qrcode
import io
import base64
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
import httpx
from .http_client import create_client

from ..core.config import config
from ..core.logging import get_logger
from .game_config import PRO_ROOT
from .app_settings import app_settings_service

logger = get_logger("bilibili")


class BilibiliService:
    """Service for Bilibili authentication and API calls."""

    def __init__(self) -> None:
        self._cookies: dict[str, Any] = {}
        self._cached_user: dict[str, Any] | None = None
        self._headers: dict[str, str] = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.bilibili.com",
        }

    @property
    def cookie_string(self) -> str:
        """Return the current raw Cookie header value."""
        return str(self._cookies.get("cookie", ""))

    @property
    def csrf_token(self) -> str:
        """Extract bili_jct from the current cookie string."""
        for part in self.cookie_string.split(";"):
            name, _, value = part.strip().partition("=")
            if name == "bili_jct":
                return value
        return ""

    @property
    def user_agent(self) -> str:
        return self._headers["User-Agent"]

    @property
    def cookie_dict(self) -> dict[str, str]:
        cookies: dict[str, str] = {}
        for part in self.cookie_string.split(";"):
            name, _, value = part.strip().partition("=")
            if name and value:
                cookies[name] = value
        return cookies

    async def generate_qr_login(self) -> dict[str, Any]:
        """Generate QR code for login."""
        try:
            async with create_client(timeout=30.0) as client:
                # New B站 passport QR login API
                resp = await client.get(
                    "https://passport.bilibili.com/x/passport-login/web/qrcode/generate",
                    params={"source": "main-fe-header"},
                    headers=self._headers,
                )
                resp.raise_for_status()
                data = resp.json()

                qr_data = data.get("data", {})
                qr_key = qr_data.get("qrcode_key")
                url = qr_data.get("url")
                if not qr_key:
                    return {"success": False, "error": data.get("message", "Failed to get QR key")}

                # Generate QR code image
                qr = qrcode.QRCode(version=1, box_size=10, border=4)
                qr.add_data(url)
                qr.make(fit=True)
                img = qr.make_image(fill_color="black", back_color="white")

                buffer = io.BytesIO()
                img.save(buffer, format="PNG")
                qr_base64 = base64.b64encode(buffer.getvalue()).decode()

                return {
                    "success": True,
                    "qrUrl": f"data:image/png;base64,{qr_base64}",
                    "qrKey": qr_key,
                }
        except Exception as e:
            logger.error(f"QR login generation failed: {e}")
            return {"success": False, "error": str(e)}

    async def check_qr_status(self, qr_key: str) -> dict[str, Any]:
        """Check QR code scan status."""
        try:
            async with create_client(timeout=30.0) as client:
                resp = await client.get(
                    "https://passport.bilibili.com/x/passport-login/web/qrcode/poll",
                    params={"qrcode_key": qr_key, "source": "main-fe-header"},
                    headers=self._headers,
                )
                resp.raise_for_status()
                data = resp.json()

                code = data.get("data", {}).get("code", -1)
                if code == 0:
                    # Login success — extract cookies from response headers
                    set_cookie_headers = resp.headers.get_list("set-cookie")
                    cookie_parts = []
                    for sc in set_cookie_headers:
                        part = sc.split(";")[0]
                        if "=" in part:
                            cookie_parts.append(part.strip())
                    cookie_str = "; ".join(cookie_parts)

                    # Also extract from response body if available
                    if not cookie_str:
                        cookies = data.get("data", {}).get("cookie_info", {}).get("cookies", [])
                        cookie_str = "; ".join(f"{c['name']}={c['value']}" for c in cookies)
                    if not cookie_str:
                        cookie_str = "; ".join(
                            f"{name}={value}" for name, value in resp.cookies.items()
                        )
                    if not cookie_str:
                        cookie_str = self._extract_cookie_from_login_url(
                            str(data.get("data", {}).get("url", ""))
                        )

                    if not cookie_str:
                        return {"status": "error", "message": "登录成功但未收到 Cookie，请重试"}

                    refresh_token = data.get("data", {}).get("refresh_token", "")

                    self._cookies = {
                        "cookie": cookie_str,
                        "uid": data.get("data", {}).get("mid"),
                        "refresh_token": refresh_token,
                    }
                    await self._save_cookies()
                    user = await self.get_user_info(force=True)
                    return {"status": "success", "success": True, "user": user}
                elif code == 86101:
                    return {"status": "pending", "message": "请使用哔哩哔哩APP扫描二维码"}
                elif code == 86090:
                    return {"status": "scanned", "message": "扫描成功，请在手机上确认登录"}
                elif code == 86038:
                    return {"status": "expired", "message": "二维码已过期，请刷新重试"}
                else:
                    return {"status": "pending", "message": data.get("data", {}).get("message", data.get("message", ""))}

        except Exception as e:
            logger.error(f"QR status check failed: {e}")
            return {"status": "error", "message": str(e)}

    async def login_by_cookie(self, cookie_str: str) -> dict[str, Any]:
        """Login using cookie string."""
        try:
            self._cookies = {"cookie": cookie_str}

            async with create_client(timeout=config.timeout) as client:
                resp = await client.get(
                    f"{config.bilibili_api_base}/x/web-interface/nav",
                    headers={**self._headers, "Cookie": cookie_str},
                )
                resp.raise_for_status()
                data = resp.json()

                if data.get("code") != 0:
                    return {"success": False, "error": "Cookie已失效，请重新获取"}

                user = await self.get_user_info(force=True)
                await self._save_cookies(user)
                return {"success": True, "user": user}

        except Exception as e:
            logger.error(f"Cookie login failed: {e}")
            return {"success": False, "error": str(e)}

    async def get_user_info(self, force: bool = False) -> dict[str, Any]:
        """Get current user information."""
        if not force and self._cached_user and self._cached_user.get("avatar") and self._cached_user.get("roomId"):
            return self._cached_user
        return await self._fetch_user_info()

    async def _fetch_user_info(self) -> dict[str, Any]:
        """Fetch user info from Bilibili API."""
        cookie_str = self._cookies.get("cookie", "")
        if not cookie_str:
            return {"uid": None, "name": "未登录", "avatar": ""}

        try:
            async with create_client(timeout=30.0) as client:
                resp = await client.get(
                    "https://api.bilibili.com/x/web-interface/nav",
                    headers={
                        **self._headers,
                        "Cookie": cookie_str,
                    },
                )
                resp.raise_for_status()
                data = resp.json()

                if data.get("code") == 0 and data.get("data", {}).get("isLogin"):
                    nav_data = data.get("data", {})
                    room_id = await self.get_room_id(nav_data.get("mid"))
                    if not room_id:
                        room_id = self._read_saved_room_id()
                    user = {
                        "uid": nav_data.get("mid"),
                        "mid": nav_data.get("mid"),
                        "name": nav_data.get("uname", "B站用户"),
                        "avatar": nav_data.get("face", ""),
                        "vipStatus": nav_data.get("vipStatus"),
                        "level": nav_data.get("level_info", {}).get("current_level"),
                        "roomId": room_id,
                        "csrf": self.csrf_token,
                        "isLogin": nav_data.get("isLogin", True),
                    }
                    await self._save_room_id(room_id)
                    await self._save_cookies(user)
                    self._cached_user = user
                    return user
                return {"uid": None, "mid": None, "name": "未登录", "avatar": "", "isLogin": False}
        except Exception as e:
            logger.error(f"Failed to fetch user info: {e}")
            if self._cached_user:
                return self._cached_user
            return {"uid": self._cookies.get("uid"), "name": "B站用户", "avatar": "", "roomId": self._read_saved_room_id()}

    @staticmethod
    def _extract_cookie_from_login_url(login_url: str) -> str:
        """Bilibili QR success may return cookies as query parameters in data.url."""
        if not login_url:
            return ""
        query: dict[str, str] = {}
        for part in urlparse(login_url).query.split("&"):
            name, _, value = part.partition("=")
            if name and value:
                query[name] = value
        names = [
            "SESSDATA",
            "bili_jct",
            "DedeUserID",
            "DedeUserID__ckMd5",
            "sid",
            "buvid3",
            "b_nut",
        ]
        parts = []
        for name in names:
            value = query.get(name, "")
            if value:
                parts.append(f"{name}={value}")
        return "; ".join(parts)

    async def get_room_id(self, mid: Any) -> Any:
        """Fetch the logged-in user's live room ID via space profile."""
        if not mid:
            return None
        try:
            async with create_client(timeout=15.0) as client:
                resp = await client.get(
                    "https://api.bilibili.com/x/space/acc/info",
                    params={"mid": mid},
                    headers={**self._headers, "Cookie": self.cookie_string},
                )
                resp.raise_for_status()
                data = resp.json()
            if data.get("code") == 0:
                return data.get("data", {}).get("live_room", {}).get("roomid")
            logger.warning(f"Failed to fetch room id: {data.get('message')}")
        except Exception as e:
            logger.error(f"Failed to fetch room id: {e}")
        return None

    async def _save_room_id(self, room_id: Any) -> None:
        if not room_id:
            return
        config_path = PRO_ROOT / "config" / "bili_roomid.json"
        config_path.parent.mkdir(parents=True, exist_ok=True)
        config_path.write_text(
            json.dumps({"ROOM_ID": room_id}, ensure_ascii=False, indent=4),
            encoding="utf-8",
        )

    @staticmethod
    def _read_saved_room_id() -> Any:
        config_path = PRO_ROOT / "config" / "bili_roomid.json"
        if not config_path.exists():
            return None
        try:
            return json.loads(config_path.read_text(encoding="utf-8")).get("ROOM_ID")
        except Exception:
            return None

    async def _save_cookies(self, user: dict[str, Any] | None = None) -> None:
        """Save cookies to disk."""
        cookies_path = Path(config.cookies_dir)
        cookies_path.mkdir(parents=True, exist_ok=True)
        payload = {**self._cookies, "csrf": self.csrf_token, "cookie_dict": self.cookie_dict}
        saved_at = datetime.now()
        valid_days = int(app_settings_service.get().get("credentialValidDays") or 30)
        payload["saved_at"] = saved_at.isoformat(timespec="seconds")
        payload["expires_at"] = (saved_at + timedelta(days=max(valid_days, 1))).isoformat(timespec="seconds")
        if user:
            payload["user"] = user
            self._cached_user = user
        (cookies_path / "session.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        pro_cookies_path = PRO_ROOT / "cookies" / "bili_cookies.json"
        pro_cookies_path.parent.mkdir(parents=True, exist_ok=True)
        pro_cookies_path.write_text(
            json.dumps({"COOKIES": self.cookie_string}, ensure_ascii=False, indent=4),
            encoding="utf-8",
        )

    async def load_cookies(self) -> bool:
        """Load cookies from disk."""
        cookies_path = Path(config.cookies_dir) / "session.json"
        if cookies_path.exists():
            payload = json.loads(cookies_path.read_text())
            expires_at = payload.get("expires_at")
            if not expires_at:
                valid_days = int(app_settings_service.get().get("credentialValidDays") or 30)
                expires_at = (datetime.fromtimestamp(cookies_path.stat().st_mtime) + timedelta(days=max(valid_days, 1))).isoformat(timespec="seconds")
            if expires_at:
                try:
                    if datetime.fromisoformat(expires_at) <= datetime.now():
                        return False
                except ValueError:
                    pass
            self._cookies = {
                "cookie": payload.get("cookie", ""),
                "uid": payload.get("uid") or payload.get("user", {}).get("mid"),
                "refresh_token": payload.get("refresh_token", ""),
            }
            self._cached_user = payload.get("user")
            if self._cached_user and not self._cached_user.get("roomId"):
                self._cached_user["roomId"] = self._read_saved_room_id()
            return True
        return False

    async def is_logged_in(self) -> bool:
        """Check if user is logged in."""
        return bool(self._cookies.get("cookie"))

    def credential_meta(self) -> dict[str, Any]:
        cookies_path = Path(config.cookies_dir) / "session.json"
        if not cookies_path.exists():
            return {"hasCredential": False}
        try:
            payload = json.loads(cookies_path.read_text())
            return {
                "hasCredential": bool(payload.get("cookie")),
                "savedAt": payload.get("saved_at") or datetime.fromtimestamp(cookies_path.stat().st_mtime).isoformat(timespec="seconds"),
                "expiresAt": payload.get("expires_at") or (datetime.fromtimestamp(cookies_path.stat().st_mtime) + timedelta(days=int(app_settings_service.get().get("credentialValidDays") or 30))).isoformat(timespec="seconds"),
                "validDays": app_settings_service.get().get("credentialValidDays"),
            }
        except Exception:
            return {"hasCredential": False}

    def refresh_credential_expiry(self, valid_days: int) -> None:
        cookies_path = Path(config.cookies_dir) / "session.json"
        if not cookies_path.exists():
            return
        try:
            payload = json.loads(cookies_path.read_text())
            if not payload.get("cookie"):
                return
            now = datetime.now()
            payload["saved_at"] = payload.get("saved_at") or now.isoformat(timespec="seconds")
            payload["expires_at"] = (now + timedelta(days=max(int(valid_days), 1))).isoformat(timespec="seconds")
            cookies_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception:
            return

    async def logout(self) -> None:
        """Logout and clear cookies."""
        self._cookies = {}
        self._cached_user = None
        cookies_path = Path(config.cookies_dir) / "session.json"
        if cookies_path.exists():
            cookies_path.unlink()
        pro_cookies_path = PRO_ROOT / "cookies" / "bili_cookies.json"
        if pro_cookies_path.exists():
            pro_cookies_path.unlink()


bilibili_service = BilibiliService()
