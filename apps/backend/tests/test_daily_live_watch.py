"""Tests for daily live watch heartbeat helpers."""
from src.api.routes.daily import _live_watch_heartbeat_payload, _live_watch_sign


def test_live_watch_heartbeat_payload_signs_secret_rule():
    context = {
        "roomId": "12345",
        "parentAreaId": 1,
        "areaId": 2,
        "seq": 1,
        "ruid": 999,
        "buvid": "buvid-test",
        "deviceId": "device-test",
        "timestamp": 1710000000,
        "secretKey": "secret",
        "secretRule": [2, 1],
        "watchTime": 60,
        "ua": "ua-test",
        "trackid": "-999998",
    }

    payload = _live_watch_heartbeat_payload(context)

    assert payload["s"] == _live_watch_sign(payload, [2, 1])
    assert payload["s"] != payload["id"]
    assert len(payload["s"]) == 40


def test_live_watch_sign_accepts_json_string_rule():
    data = {
        "id": "[1,2,1,12345]",
        "device": '["buvid-test","device-test"]',
        "benchmark": "secret",
        "ets": 1710000000,
        "time": 60,
        "ts": 1710000060,
    }

    assert _live_watch_sign(data, "[2,1]") == _live_watch_sign(data, [2, 1])
