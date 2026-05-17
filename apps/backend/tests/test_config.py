"""Tests for core config."""
import pytest
from src.core.config import AppConfig


def test_config_defaults():
    """Test default configuration values."""
    config = AppConfig()
    assert config.debug is False
    assert config.log_level == "INFO"
    assert config.data_dir == "./data"
    assert config.ipc_port == 3847


def test_config_env_override(monkeypatch):
    """Test environment variable override."""
    monkeypatch.setenv("BILITOOLS_DEBUG", "true")
    monkeypatch.setenv("BILITOOLS_LOG_LEVEL", "DEBUG")
    config = AppConfig()
    assert config.debug is True
    assert config.log_level == "DEBUG"