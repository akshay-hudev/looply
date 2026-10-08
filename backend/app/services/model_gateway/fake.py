from collections.abc import Callable

from app.services.model_gateway.base import ChatMessage, ImageResult, VideoStatus, VideoTask

Responder = Callable[[list[ChatMessage]], str]


class FakeProvider:
    """Deterministic provider for tests and offline demos. `responder` maps messages to raw text."""

    def __init__(self, responder: Responder, name: str = "fake"):
        self.name = name
        self.responder = responder
        self.calls: list[list[ChatMessage]] = []
        self.video_polls: dict[str, int] = {}

    async def chat(self, messages: list[ChatMessage], *, json_mode: bool = True, temperature: float = 0.7) -> str:
        self.calls.append(messages)
        return self.responder(messages)

    async def image(self, prompt: str, *, size: str = "1024x1024", reference_urls: list[str] | None = None) -> ImageResult:
        # 1x1 PNG so downstream storage code paths are exercised.
        png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        return ImageResult(b64=png, provider=self.name)

    async def video_submit(self, prompt: str, *, duration_s: int = 8, aspect_ratio: str = "9:16", image_url: str | None = None) -> VideoTask:
        task_id = f"fake-{len(self.video_polls) + 1}"
        self.video_polls[task_id] = 0
        return VideoTask(task_id=task_id, provider=self.name)

    async def video_status(self, task_id: str) -> VideoStatus:
        self.video_polls[task_id] = self.video_polls.get(task_id, 0) + 1
        if self.video_polls[task_id] < 2:
            return VideoStatus(status="processing")
        return VideoStatus(status="ready", url=f"https://example.com/{task_id}.mp4")
