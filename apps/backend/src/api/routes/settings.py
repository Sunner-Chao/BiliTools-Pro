"""Settings and real resource state routes."""
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

from ..ipc_server import IPCServer
from src.core.config import config
from src.api.routes.daily import SLOT_COUNT, daily_state
from src.services.app_settings import app_settings_service
from src.services.bilibili import bilibili_service
from src.services.game_config import GAME_FILES, PRO_ROOT, game_config_service


async def register(ipc: IPCServer) -> None:
    async def get_settings() -> Dict[str, Any]:
        user = await bilibili_service.get_user_info() if await bilibili_service.is_logged_in() else None
        config_files = []
        for game, filename in GAME_FILES.items():
            path = PRO_ROOT / "config" / filename
            config_files.append(_file_info(path, {"game": game, "expected": True}))
        room_file = PRO_ROOT / "config" / "bili_roomid.json"
        user_file = PRO_ROOT / "config" / "bili_user_info.json"
        app_settings_file = PRO_ROOT / "config" / "app_settings.json"
        cookie_file = PRO_ROOT / "cookies" / "bili_cookies.json"
        backend_cookie_file = Path(config.cookies_dir) / "session.json"
        audience_files = [
            _file_info(daily_state.slot_path(slot), {"slot": slot, "label": f"观众 {slot}"})
            for slot in range(SLOT_COUNT)
        ]
        return {
            "settings": app_settings_service.get(),
            "credential": bilibili_service.credential_meta(),
            "user": user,
            "games": game_config_service.list_games(),
            "resources": {
                "paths": game_config_service.ensure_resource_dirs(),
                "extraDirs": [
                    _dir_info(PRO_ROOT / "captcha_images", "验证码图片"),
                    _dir_info(PRO_ROOT / "javascript", "验证码/签名脚本"),
                    _dir_info(PRO_ROOT / "model", "验证码模型"),
                    _dir_info(PRO_ROOT / "others", "提示音资源"),
                    _dir_info(PRO_ROOT / "videos", "视频资源"),
                ],
                "executables": game_config_service.list_executables(),
                "configFiles": config_files,
                "runtimeFiles": [
                    _file_info(room_file, {"label": "直播间号"}),
                    _file_info(user_file, {"label": "用户信息"}),
                    _file_info(app_settings_file, {"label": "应用设置"}),
                    _file_info(cookie_file, {"label": "src 兼容 Cookie"}),
                    _file_info(backend_cookie_file, {"label": "后端会话 Cookie"}),
                ],
                "audienceCookieFiles": audience_files,
            },
            "backend": {
                "timeout": config.timeout,
                "maxRetries": config.max_retries,
                "ipcHost": config.ipc_host,
                "ipcPort": config.ipc_port,
                "dataDir": str(Path(config.data_dir).resolve()),
                "cookiesDir": str(Path(config.cookies_dir).resolve()),
                "cacheDir": str(Path(config.cache_dir).resolve()),
            },
        }

    async def save_settings(values: Dict[str, Any]) -> Dict[str, Any]:
        settings = app_settings_service.update(values)
        if "credentialValidDays" in values:
            bilibili_service.refresh_credential_expiry(int(values["credentialValidDays"]))
        return {"success": True, "settings": settings}

    ipc.register_handler("settings:get", get_settings)
    ipc.register_handler("settings:save", save_settings)


def _file_info(path: Path, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "path": str(path),
        "name": path.name,
        "exists": path.exists(),
        "size": 0,
        "updatedAt": None,
    }
    if path.exists():
        stat = path.stat()
        payload["size"] = stat.st_size
        payload["updatedAt"] = datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds")
    if extra:
        payload.update(extra)
    return payload


def _dir_info(path: Path, label: str) -> dict[str, Any]:
    files = [item for item in path.rglob("*") if item.is_file()] if path.exists() else []
    return {
        "label": label,
        "path": str(path),
        "exists": path.exists(),
        "fileCount": len(files),
        "size": sum(item.stat().st_size for item in files),
    }
