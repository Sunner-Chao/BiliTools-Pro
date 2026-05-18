"""Tests for Bilibili game config parsing helpers."""
from src.services.game_config import GameConfigService


def test_extract_totalv2_task_ids_from_blackboard_urls():
    html = """
    https://api.bilibili.com/x/task/totalv2?csrf=token&task_ids=6ERAcwloghvb1f00&web_location=888.145296
    https://api.bilibili.com/x/task/totalv2?csrf=token\\u0026task_ids=6ERAcwloghvc1v00\\u0026web_location=888.145296
    """

    assert GameConfigService._extract_totalv2_task_ids(html) == [
        "6ERAcwloghvb1f00",
        "6ERAcwloghvc1v00",
    ]
