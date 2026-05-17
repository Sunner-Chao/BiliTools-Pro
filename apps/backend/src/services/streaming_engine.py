"""Live and OBS-like ffmpeg streaming engine."""
import asyncio
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx

from .bilibili import bilibili_service
from .game_config import game_config_service


class StreamingEngine:
    """Starts Bilibili live sessions and optional OBS-like ffmpeg pushes."""

    def __init__(self) -> None:
        self.state: dict[str, Any] = {
            "isStreaming": False,
            "status": "idle",
            "roomId": None,
            "mode": "obs",
            "startedAt": None,
            "duration": 0,
            "viewers": 0,
            "logs": [],
            "rtmpUrl": "",
        }
        self._process: subprocess.Popen[bytes] | None = None
        self._timer_task: asyncio.Task[None] | None = None
        self._pump_task: asyncio.Task[None] | None = None
        self._auto_stop_task: asyncio.Task[None] | None = None
        self._scheduled_start_task: asyncio.Task[None] | None = None

    def _log(self, level: str, message: str) -> None:
        self.state.setdefault("logs", []).append(
            {
                "time": datetime.now().strftime("%H:%M:%S"),
                "level": level,
                "message": message,
            }
        )
        self.state["logs"] = self.state["logs"][-400:]

    async def start(self, config: dict[str, Any]) -> dict[str, Any]:
        if self.state["isStreaming"]:
            return {"success": False, "error": "Already streaming"}

        room_id = str(config.get("roomId") or "").strip()
        if not room_id:
            return {"success": False, "error": "请输入直播间号"}

        mode = config.get("mode", "obs")
        self.state.update(
            {
                "isStreaming": True,
                "status": "connecting",
                "roomId": room_id,
                "mode": mode,
                "startedAt": datetime.now().isoformat(timespec="seconds"),
                "duration": 0,
                "logs": [],
            }
        )
        self._log("warning", "开始直播任务")

        try:
            target_time = str(config.get("targetTime") or "")
            if target_time:
                target = datetime.fromisoformat(target_time.replace("Z", "+00:00")).replace(tzinfo=None)
                seconds = (target - datetime.now()).total_seconds()
                if seconds > 0:
                    self.state["status"] = "waiting"
                    self._log("info", f"定时推流已设置，将在 {target.strftime('%Y-%m-%d %H:%M:%S')} 开始")
                    self._scheduled_start_task = asyncio.create_task(self._start_after(seconds, config))
                    return {"success": True, "state": self.status()}
            return await self._start_now(config)
        except Exception as exc:
            await self.stop()
            return {"success": False, "error": str(exc)}

    async def _start_now(self, config: dict[str, Any]) -> dict[str, Any]:
        try:
            mode = config.get("mode", "obs")
            rtmp_url = str(config.get("rtmpUrl") or "").rstrip("/")
            stream_key = str(config.get("streamKey") or "")
            if mode == "bili-live":
                live_result = await self._start_bilibili_live(config)
                if not live_result["success"]:
                    await self.stop()
                    return live_result
                rtmp_url = live_result["rtmpUrl"]
                stream_key = live_result["streamKey"]

            self.state["rtmpUrl"] = rtmp_url
            video_path = str(config.get("videoPath") or "").strip()
            if video_path:
                self._start_ffmpeg(video_path, rtmp_url, stream_key, config)
            else:
                self._log("info", "未配置视频文件，仅记录开播状态")

            self.state["status"] = "streaming"
            self._timer_task = asyncio.create_task(self._tick())
            duration = float(config.get("duration") or 0)
            if duration > 0:
                self._log("warning", f"已设置 {int(duration)} 秒后自动关播")
                self._auto_stop_task = asyncio.create_task(self._auto_stop(duration))
            return {"success": True, "state": self.status()}
        except Exception as exc:
            await self.stop()
            return {"success": False, "error": str(exc)}

    async def stop(self) -> dict[str, Any]:
        if self._scheduled_start_task:
            self._scheduled_start_task.cancel()
            self._scheduled_start_task = None
        if self._timer_task:
            self._timer_task.cancel()
            self._timer_task = None
        if self._pump_task:
            self._pump_task.cancel()
            self._pump_task = None
        if self._auto_stop_task and self._auto_stop_task is not asyncio.current_task():
            self._auto_stop_task.cancel()
            self._auto_stop_task = None
        if self._process and self._process.poll() is None:
            self._log("warning", "正在停止 ffmpeg 推流进程")
            self._process.terminate()
            try:
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._process.kill()
        self._process = None
        if self.state.get("mode") == "bili-live" and self.state.get("roomId"):
            await self._stop_bilibili_live(str(self.state["roomId"]))
        self.state["isStreaming"] = False
        self.state["status"] = "idle"
        self._log("warning", "推流已停止")
        return {"success": True, "state": self.status()}

    def status(self) -> dict[str, Any]:
        return self.state.copy()

    async def _tick(self) -> None:
        try:
            while self.state["isStreaming"]:
                self.state["duration"] += 1
                if self._process and self._process.poll() is not None:
                    self._log("error", "ffmpeg 进程已退出")
                    self.state["status"] = "ended"
                    self.state["isStreaming"] = False
                    break
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            pass

    async def _auto_stop(self, duration: float) -> None:
        try:
            await asyncio.sleep(duration)
            self._log("warning", "定时关播时间到，开始停止推流")
            await self.stop()
        except asyncio.CancelledError:
            pass

    async def _start_after(self, seconds: float, config: dict[str, Any]) -> None:
        try:
            await asyncio.sleep(seconds)
            self._log("warning", "到达定时推流时间，开始开播/推流")
            await self._start_now(config)
        except asyncio.CancelledError:
            self._log("warning", "定时推流已取消")

    async def _start_bilibili_live(self, config: dict[str, Any]) -> dict[str, Any]:
        if not await bilibili_service.is_logged_in():
            return {"success": False, "error": "请先登录 B 站账号"}
        csrf = bilibili_service.csrf_token
        if not csrf:
            return {"success": False, "error": "当前 Cookie 缺少 bili_jct"}
        data = {
            "room_id": config["roomId"],
            "platform": "pc",
            "area_v2": str(config.get("areaV2") or game_config_service.get_area_v2(config.get("game", ""))),
            "backup_stream": "0",
            "csrf_token": csrf,
            "csrf": csrf,
        }
        headers = {
            "Cookie": bilibili_service.cookie_string,
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            "origin": "https://link.bilibili.com",
            "referer": "https://link.bilibili.com/p/center/index",
            "user-agent": bilibili_service.user_agent,
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                "https://api.live.bilibili.com/room/v1/Room/startLive",
                headers=headers,
                data=data,
            )
        payload = response.json()
        if payload.get("code") != 0:
            return {"success": False, "error": payload.get("message", "开播失败")}
        rtmp = payload.get("data", {}).get("rtmp", {})
        addr = str(rtmp.get("addr", "")).split("?")[0].rstrip("/")
        code = rtmp.get("code", "")
        self._log("success", f"开播成功，分区 {data['area_v2']}")
        return {"success": True, "rtmpUrl": addr, "streamKey": code}

    async def _stop_bilibili_live(self, room_id: str) -> None:
        csrf = bilibili_service.csrf_token
        if not csrf:
            return
        headers = {
            "Cookie": bilibili_service.cookie_string,
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            "origin": "https://link.bilibili.com",
            "referer": "https://link.bilibili.com/p/center/index",
            "user-agent": bilibili_service.user_agent,
        }
        data = {"room_id": room_id, "platform": "pc", "csrf_token": csrf, "csrf": csrf}
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                payload = (await client.post(
                    "https://api.live.bilibili.com/room/v1/Room/stopLive",
                    headers=headers,
                    data=data,
                )).json()
            self._log("warning", payload.get("message", "关播请求已发送"))
        except Exception as exc:
            self._log("error", f"关播失败: {exc}")

    def _start_ffmpeg(self, video_path: str, rtmp_url: str, stream_key: str, config: dict[str, Any]) -> None:
        path = Path(video_path)
        if not path.exists():
            raise FileNotFoundError(f"视频文件不存在: {video_path}")
        ffmpeg_path = self._resolve_ffmpeg_path(config.get("ffmpegPath"))
        target = f"{rtmp_url.rstrip('/')}/{stream_key}" if stream_key else rtmp_url
        quality = config.get("quality", "low")
        bitrate = {"high": "8000k", "medium": "4500k", "low": "2200k"}.get(quality, "2200k")
        command = [
            ffmpeg_path,
            "-re",
            "-stream_loop",
            "-1",
            "-i",
            str(path),
            "-c:v",
            "libx264" if config.get("cpuMode", True) else "h264_nvenc",
            "-preset",
            "veryfast",
            "-b:v",
            bitrate,
            "-c:a",
            "aac",
            "-f",
            "flv",
            target,
        ]
        self._log("info", "启动仿 OBS ffmpeg 推流")
        self._process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self._pump_task = asyncio.create_task(self._pump_ffmpeg())

    def _resolve_ffmpeg_path(self, configured: Any) -> str:
        if configured:
            return str(configured)
        for executable in game_config_service.list_executables():
            if executable["name"].lower().startswith("ffmpeg"):
                return str(executable["path"])
        return str(shutil.which("ffmpeg") or "ffmpeg")

    async def _pump_ffmpeg(self) -> None:
        if not self._process or not self._process.stderr:
            return
        try:
            while self._process.poll() is None:
                line = await asyncio.to_thread(self._process.stderr.readline)
                if line:
                    self._log("debug", line.decode(errors="ignore").strip())
        except asyncio.CancelledError:
            pass


streaming_engine = StreamingEngine()
