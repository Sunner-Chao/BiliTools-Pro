"""Standardized IPC response envelope and error code system.

All IPC handlers should return dicts via ``ok()`` / ``fail()`` helpers so the
front-end can consume a uniform shape::

    {"ok": true,  "data": {...}, "error": null, "code": 200}
    {"ok": false, "data": null,  "error": "msg", "code": 401}
"""
from __future__ import annotations

from enum import IntEnum
from typing import Any, Dict, Optional


class ErrorCode(IntEnum):
    """Structured error codes shared between back-end and front-end.

    Ranges:
        2xx  – success / informational
        4xx  – client / validation errors (front-end can react)
        5xx  – server / unexpected errors
    """
    # -- Success --
    OK = 200

    # -- Client errors --
    BAD_REQUEST = 400          # generic validation failure
    UNAUTHORIZED = 401         # not logged in / cookie expired
    FORBIDDEN = 403            # logged in but lacks permission
    NOT_FOUND = 404            # resource does not exist
    CONFLICT = 409             # duplicate / already running
    GONE = 410                 # resource expired (e.g. QR code)
    VALIDATION_ERROR = 422     # field-level validation failed
    REQUIRES_CONFIRM = 428     # destructive action needs user confirmation
    RATE_LIMITED = 429         # too many requests

    # -- Server errors --
    INTERNAL_ERROR = 500       # unexpected exception
    UPSTREAM_ERROR = 502       # third-party API failure (Bilibili etc.)
    TIMEOUT = 504              # operation timed out


# --------------- response builders ---------------

def ok(data: Any = None, code: int = ErrorCode.OK) -> Dict[str, Any]:
    """Build a success envelope."""
    return {"ok": True, "data": data, "error": None, "code": code}


def fail(
    error: str,
    code: int = ErrorCode.INTERNAL_ERROR,
    *,
    data: Any = None,
    error_field: Optional[str] = None,
) -> Dict[str, Any]:
    """Build an error envelope.

    Parameters
    ----------
    error : str
        Human-readable error message (displayed in Toast / inline).
    code : int
        Machine-readable error code (see ``ErrorCode``).
    data : Any, optional
        Partial data the front-end may still use (e.g. validation details).
    error_field : str, optional
        Name of the form field that caused the error, so the front-end can
        highlight it and trigger a shake animation.
    """
    payload: Dict[str, Any] = {"ok": False, "data": data, "error": error, "code": code}
    if error_field:
        payload["errorField"] = error_field
    return payload


def wrap(raw: Any) -> Dict[str, Any]:
    """Wrap a legacy handler result into the standard envelope.

    This is the migration shim used by ``IPCServer._dispatch`` so that
    *existing* handlers that still return raw dicts are transparently
    wrapped.  Once all handlers are migrated to ``ok()``/``fail()`` this
    can be removed.
    """
    # Already in envelope format
    if isinstance(raw, dict) and "ok" in raw and "data" in raw and "error" in raw:
        return raw
    # Legacy success flag pattern
    if isinstance(raw, dict) and raw.get("success") is False:
        error = raw.get("error") or raw.get("message") or "Unknown error"
        return fail(error, data={k: v for k, v in raw.items() if k not in ("success", "error")})
    return ok(data=raw)
