import httpx

from app.services.model_gateway.base import (
    ChatMessage,
    ImageResult,
    NotSupported,
    ProviderError,
    VideoStatus,
    VideoTask,
)


def _raise_for(resp: httpx.Response, provider: str) -> None:
    if resp.status_code < 400:
        return
    retryable = resp.status_code == 429 or resp.status_code >= 500
    raise ProviderError(
        f"{provider} HTTP {resp.status_code}: {resp.text[:500]}", retryable=retryable, status=resp.status_code
    )


class OpenAICompatProvider:
    """Any provider exposing OpenAI-style /chat/completions and /images/generations."""

    def __init__(
        self,
        name: str,
        *,
        base_url: str,
        api_key: str,
        text_model: str,
        image_model: str | None = None,
        chat_path: str = "/chat/completions",
        image_path: str = "/images/generations",
        timeout: float = 120.0,
        supports_json_mode: bool = True,
    ):
        self.name = name
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.text_model = text_model
        self.image_model = image_model
        self.chat_path = chat_path
        self.image_path = image_path
        self.timeout = timeout
        self.supports_json_mode = supports_json_mode

    @property
    def headers(self) -> dict:
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

    async def _post(self, path: str, payload: dict) -> dict:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(self.base_url + path, json=payload, headers=self.headers)
        except (httpx.TimeoutException, httpx.TransportError) as e:
            raise ProviderError(f"{self.name} transport error: {e}", retryable=True) from e
        _raise_for(resp, self.name)
        return resp.json()

    async def _get(self, path: str) -> dict:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(self.base_url + path, headers=self.headers)
        except (httpx.TimeoutException, httpx.TransportError) as e:
            raise ProviderError(f"{self.name} transport error: {e}", retryable=True) from e
        _raise_for(resp, self.name)
        return resp.json()

    async def chat(self, messages: list[ChatMessage], *, json_mode: bool = True, temperature: float = 0.7) -> str:
        payload: dict = {
            "model": self.text_model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": temperature,
        }
        if json_mode and self.supports_json_mode:
            payload["response_format"] = {"type": "json_object"}
        data = await self._post(self.chat_path, payload)
        try:
            return data["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as e:
            raise ProviderError(f"{self.name} unexpected chat response: {str(data)[:300]}") from e

    async def image(self, prompt: str, *, size: str = "1024x1024", reference_urls: list[str] | None = None) -> ImageResult:
        if not self.image_model:
            raise NotSupported(f"{self.name} has no image model configured")
        payload: dict = {"model": self.image_model, "prompt": prompt, "size": size, "n": 1}
        if reference_urls:
            payload["image_urls"] = reference_urls
        data = await self._post(self.image_path, payload)
        item = (data.get("data") or [{}])[0]
        if not item.get("url") and not item.get("b64_json"):
            raise ProviderError(f"{self.name} returned no image: {str(data)[:300]}")
        return ImageResult(url=item.get("url"), b64=item.get("b64_json"), provider=self.name)

    async def video_submit(self, prompt: str, *, duration_s: int = 8, aspect_ratio: str = "9:16", image_url: str | None = None) -> VideoTask:
        raise NotSupported(f"{self.name} does not support video")

    async def video_status(self, task_id: str) -> VideoStatus:
        raise NotSupported(f"{self.name} does not support video")
