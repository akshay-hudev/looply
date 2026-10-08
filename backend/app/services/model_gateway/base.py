from dataclasses import dataclass, field
from typing import Literal, Protocol


class ProviderError(Exception):
    def __init__(self, message: str, *, retryable: bool = False, status: int | None = None):
        super().__init__(message)
        self.retryable = retryable
        self.status = status


class NotSupported(ProviderError):
    pass


@dataclass
class ChatMessage:
    role: Literal["system", "user", "assistant"]
    content: str | list  # list = OpenAI-style multimodal parts (text + image_url)


@dataclass
class ImageResult:
    url: str | None = None
    b64: str | None = None
    provider: str = ""


@dataclass
class VideoTask:
    task_id: str
    provider: str


@dataclass
class VideoStatus:
    status: Literal["pending", "processing", "ready", "failed"]
    url: str | None = None
    error: str | None = None
    raw: dict = field(default_factory=dict)


class ModelProvider(Protocol):
    name: str

    async def chat(self, messages: list[ChatMessage], *, json_mode: bool = True, temperature: float = 0.7) -> str: ...

    async def image(self, prompt: str, *, size: str = "1024x1024", reference_urls: list[str] | None = None) -> ImageResult: ...

    async def video_submit(
        self, prompt: str, *, duration_s: int = 8, aspect_ratio: str = "9:16", image_url: str | None = None
    ) -> VideoTask: ...

    async def video_status(self, task_id: str) -> VideoStatus: ...
