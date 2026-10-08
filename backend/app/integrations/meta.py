"""Shared Meta Graph API helpers (Instagram, Facebook Pages, WhatsApp Cloud)."""

import httpx

from app.core.config import get_settings
from app.integrations.base import AdapterError, raise_for


def graph_url(path: str, *, instagram: bool = False) -> str:
    host = "https://graph.instagram.com" if instagram else "https://graph.facebook.com"
    return f"{host}/{get_settings().meta_graph_version}/{path.lstrip('/')}"


async def graph(method: str, path: str, token: str, *, params: dict | None = None, json: dict | None = None,
                data: dict | None = None, platform: str = "meta", timeout: float = 60) -> dict:
    params = {**(params or {}), "access_token": token}
    try:
        async with httpx.AsyncClient(timeout=timeout) as c:
            resp = await c.request(method, graph_url(path, instagram=platform == "instagram"), params=params, json=json, data=data)
    except httpx.HTTPError as e:
        raise AdapterError(f"{platform} network error: {e}", retryable=True) from e
    return raise_for(resp, platform)
