from urllib.parse import urlparse

import httpx

from app.core.config import Settings
from app.services.model_gateway.base import ImageResult, ProviderError, VideoStatus, VideoTask
from app.services.model_gateway.openai_compat import OpenAICompatProvider, _raise_for

_RATIO_FROM_SIZE = {"1024x1024": "1:1", "1024x1280": "4:5", "1024x1792": "9:16", "1024x1365": "3:4"}

_STATUS_MAP = {
    "queued": "pending",
    "pending": "pending",
    "submitted": "pending",
    "running": "processing",
    "processing": "processing",
    "in_progress": "processing",
    "succeeded": "ready",
    "success": "ready",
    "completed": "ready",
    "done": "ready",
    "failed": "failed",
    "error": "failed",
    "cancelled": "failed",
}


def _find_url(data: dict) -> str | None:
    for key in ("video_url", "url", "output_url"):
        if isinstance(data.get(key), str):
            return data[key]
    for container in ("output", "result", "data"):
        inner = data.get(container)
        if isinstance(inner, list) and inner:
            inner = inner[0]
        if isinstance(inner, dict):
            found = _find_url(inner)
            if found:
                return found
    return None


class AgnesProvider(OpenAICompatProvider):
    """Agnes 3.0 Flash (text), Agnes Image 2.5 Flash, Agnes Video 2.5 (async task API)."""

    def __init__(self, s: Settings):
        super().__init__(
            "agnes",
            base_url=s.agnes_base_url,
            api_key=s.agnes_api_key,
            text_model=s.agnes_text_model,
            image_model=s.agnes_image_model,
            chat_path=s.agnes_chat_path,
            image_path=s.agnes_image_path,
        )
        self.video_model = s.agnes_video_model
        self.video_path = "/videos"
        parsed = urlparse(self.base_url)
        self._origin = f"{parsed.scheme}://{parsed.netloc}"

    async def image(self, prompt: str, *, size: str = "1024x1024", reference_urls: list[str] | None = None) -> ImageResult:
        """Agnes Image 2.5 Flash: resolution tier + ratio, not an OpenAI pixel size."""
        if not self.image_model:
            raise ProviderError("agnes has no image model configured")
        ratio = _RATIO_FROM_SIZE.get(size, "1:1")
        payload: dict = {
            "model": self.image_model, "prompt": prompt, "size": "2K", "ratio": ratio, "n": 1,
            "extra_body": {"response_format": "url"},
        }
        if reference_urls:
            payload["image"] = reference_urls
        data = await self._post(self.image_path, payload)
        item = data.get("data")
        if isinstance(item, list):
            item = item[0] if item else {}
        if not isinstance(item, dict):
            item = {}
        url = item.get("url") or data.get("url")
        b64 = item.get("b64_json") or data.get("b64_json")
        if not url and not b64:
            raise ProviderError(f"agnes returned no image: {str(data)[:300]}")
        return ImageResult(url=url, b64=b64, provider=self.name)

    async def video_submit(self, prompt: str, *, duration_s: int = 8, aspect_ratio: str = "9:16", image_url: str | None = None) -> VideoTask:
        seconds = str(min(12, max(4, int(duration_s))))
        payload: dict = {
            "model": self.video_model, "prompt": prompt, "seconds": seconds, "mode": "text",
            "size": "720P", "aspect_ratio": aspect_ratio or "9:16",
        }
        if image_url:
            payload["mode"] = "keyframe"
            payload["first_frame"] = image_url
        data = await self._post(self.video_path, payload)
        # Polling uses video_id. id/task_id identify the job but cannot retrieve the file.
        task_id = data.get("video_id") or data.get("task_id") or data.get("id")
        if not task_id:
            raise ProviderError(f"agnes video submit returned no task id: {str(data)[:300]}")
        return VideoTask(task_id=str(task_id), provider=self.name)

    async def video_status(self, task_id: str) -> VideoStatus:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(
                    f"{self._origin}/agnesapi",
                    params={"video_id": task_id, "model_name": self.video_model},
                    headers=self.headers,
                )
        except (httpx.TimeoutException, httpx.TransportError) as e:
            raise ProviderError(f"agnes transport error: {e}", retryable=True) from e
        _raise_for(resp, self.name)
        data = resp.json()
        body = data.get("data") if isinstance(data.get("data"), dict) else data
        raw_status = str(body.get("status") or body.get("state") or "pending").lower()
        status = _STATUS_MAP.get(raw_status, "processing")
        url = _find_url(body) or (body.get("url") if isinstance(body.get("url"), str) else None)
        if status == "ready" and not url:
            status = "processing"
        err = body.get("error") or body.get("message")
        if isinstance(err, dict):
            err = err.get("message") or str(err)
        return VideoStatus(status=status, url=url, error=err if isinstance(err, str) else None, raw=data)
