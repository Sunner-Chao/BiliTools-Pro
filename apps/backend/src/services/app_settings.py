"""Persistent application settings."""
import json
import os
from pathlib import Path
from typing import Any

PRO_ROOT = Path(os.environ.get("BILITOOLS_PRO_ROOT", Path(__file__).resolve().parents[4])).resolve()

DEFAULT_SETTINGS = {
    "credentialValidDays": 30,
    "network": {"timeout": 30, "maxRetries": 3, "userAgent": ""},
    "proxy": {"enabled": False, "type": "http", "host": "", "port": None},
}


class AppSettingsService:
    def __init__(self) -> None:
        self.path = PRO_ROOT / "config" / "app_settings.json"
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def get(self) -> dict[str, Any]:
        if not self.path.exists():
            return DEFAULT_SETTINGS.copy()
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            return self._merge(DEFAULT_SETTINGS, data)
        except Exception:
            return DEFAULT_SETTINGS.copy()

    def update(self, values: dict[str, Any]) -> dict[str, Any]:
        current = self.get()
        updated = self._merge(current, values)
        self.path.write_text(json.dumps(updated, ensure_ascii=False, indent=2), encoding="utf-8")
        return updated

    @staticmethod
    def _merge(base: dict[str, Any], extra: dict[str, Any]) -> dict[str, Any]:
        result = {**base}
        for key, value in extra.items():
            if isinstance(value, dict) and isinstance(result.get(key), dict):
                result[key] = {**result[key], **value}
            else:
                result[key] = value
        return result


app_settings_service = AppSettingsService()
