import logging
from typing import TypeVar

from pydantic import BaseModel

from app.core.config import Settings, get_settings
from app.services.model_gateway.agnes import AgnesProvider
from app.services.model_gateway.base import (
    ChatMessage,
    ImageResult,
    ModelProvider,
    NotSupported,
    ProviderError,
    VideoStatus,
    VideoTask,
)
from app.services.model_gateway.openai_compat import OpenAICompatProvider
from app.services.model_gateway.parser import ParseError, parse_model
from app.services.model_gateway.rate_limit import TokenBucket
from app.services.model_gateway.retry import with_retries

M = TypeVar("M", bound=BaseModel)
log = logging.getLogger(__name__)

__all__ = ["ChatMessage", "ModelGateway", "ModelUnavailable", "get_gateway", "set_gateway"]


class ModelUnavailable(Exception):
    """All configured providers failed for a capability."""


def build_providers(s: Settings) -> dict[str, ModelProvider]:
    providers: dict[str, ModelProvider] = {}
    if s.agnes_api_key:
        providers["agnes"] = AgnesProvider(s)
    if s.openai_api_key:
        providers["openai"] = OpenAICompatProvider(
            "openai", base_url=s.openai_base_url, api_key=s.openai_api_key,
            text_model=s.openai_text_model, image_model=s.openai_image_model,
        )
    if s.gemini_api_key:
        providers["gemini"] = OpenAICompatProvider(
            "gemini", base_url=s.gemini_base_url, api_key=s.gemini_api_key, text_model=s.gemini_text_model,
        )
    return providers


class ModelGateway:
    """Single entry point for every model call. Agents never talk to a provider directly."""

    def __init__(self, providers: dict[str, ModelProvider], routing: dict[str, list[str]], *,
                 requests_per_minute: int = 60, max_retries: int = 4, repair_attempts: int = 2):
        self.providers = providers
        self.routing = routing
        self.max_retries = max_retries
        self.repair_attempts = repair_attempts
        self.buckets = {name: TokenBucket(requests_per_minute) for name in providers}

    def _chain(self, capability: str) -> list[ModelProvider]:
        chain = [self.providers[n] for n in self.routing.get(capability, []) if n in self.providers]
        if not chain:
            raise ModelUnavailable(
                f"No {capability} provider configured. Set AGNES_API_KEY (or a fallback provider key) in .env."
            )
        return chain

    async def _call(self, provider: ModelProvider, fn):
        async def attempt():
            await self.buckets[provider.name].acquire()
            return await fn()
        return await with_retries(attempt, max_retries=self.max_retries)

    async def chat_json(self, system: str, user: str | list, schema: type[M], *, temperature: float = 0.7) -> M:
        """Ask for JSON matching `schema`; on invalid output, send the validation error back for repair."""
        errors: list[str] = []
        for provider in self._chain("text"):
            messages = [ChatMessage("system", system), ChatMessage("user", user)]
            try:
                for _ in range(self.repair_attempts + 1):
                    raw = await self._call(provider, lambda: provider.chat(messages, json_mode=True, temperature=temperature))
                    try:
                        return parse_model(raw, schema)
                    except ParseError as e:
                        messages = messages + [
                            ChatMessage("assistant", raw),
                            ChatMessage("user", f"Your response was not valid JSON for the required schema: {e}. "
                                                "Return ONLY the corrected JSON object."),
                        ]
                errors.append(f"{provider.name}: output never matched schema")
            except ProviderError as e:
                errors.append(f"{provider.name}: {e}")
                log.warning("provider %s failed, falling back: %s", provider.name, e)
        raise ModelUnavailable("; ".join(errors))

    async def image(self, prompt: str, *, size: str = "1024x1024", reference_urls: list[str] | None = None) -> ImageResult:
        errors = []
        for provider in self._chain("image"):
            try:
                return await self._call(
                    provider, lambda p=provider, urls=reference_urls: p.image(prompt, size=size, reference_urls=urls))
            except ProviderError as e:
                errors.append(f"{provider.name}: {e}")
        raise ModelUnavailable("; ".join(errors))

    async def video_submit(self, prompt: str, *, duration_s: int = 8, aspect_ratio: str = "9:16",
                           image_url: str | None = None) -> VideoTask:
        errors = []
        for provider in self._chain("video"):
            try:
                return await self._call(provider, lambda p=provider, frame=image_url: p.video_submit(
                    prompt, duration_s=duration_s, aspect_ratio=aspect_ratio, image_url=frame))
            except ProviderError as e:
                errors.append(f"{provider.name}: {e}")
        raise ModelUnavailable("; ".join(errors))

    async def video_status(self, provider_name: str, task_id: str) -> VideoStatus:
        provider = self.providers.get(provider_name)
        if provider is None:
            raise ModelUnavailable(f"Video provider {provider_name} is no longer configured")
        return await self._call(provider, lambda: provider.video_status(task_id))


_gateway: ModelGateway | None = None


def get_gateway() -> ModelGateway:
    global _gateway
    if _gateway is None:
        s = get_settings()
        _gateway = ModelGateway(
            build_providers(s),
            {cap: s.provider_list(cap) for cap in ("text", "image", "video")},
            requests_per_minute=s.model_requests_per_minute,
            max_retries=s.model_max_retries,
        )
    return _gateway


def set_gateway(gateway: ModelGateway | None) -> None:
    """Override the process-wide gateway (tests, offline demo)."""
    global _gateway
    _gateway = gateway
