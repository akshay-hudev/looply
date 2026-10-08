"""Stores generated media in S3/MinIO (or local disk in dev) and returns a public URL."""

import base64
import mimetypes
from pathlib import Path

import httpx

from app.core.config import Settings, get_settings
from app.models.base import new_id


class MediaService:
    def __init__(self, settings: Settings | None = None):
        self.s = settings or get_settings()
        self._s3 = None

    @property
    def s3(self):
        if self._s3 is None and self.s.s3_endpoint:
            import boto3

            self._s3 = boto3.client(
                "s3", endpoint_url=self.s.s3_endpoint, aws_access_key_id=self.s.s3_access_key,
                aws_secret_access_key=self.s.s3_secret_key, region_name=self.s.s3_region,
            )
        return self._s3

    def put(self, data: bytes, *, org_id: str, ext: str) -> str:
        key = f"{org_id}/{new_id()}.{ext.lstrip('.')}"
        content_type = mimetypes.guess_type(key)[0] or "application/octet-stream"
        if self.s3:
            self.s3.put_object(Bucket=self.s.s3_bucket, Key=key, Body=data, ContentType=content_type)
            base = (self.s.s3_public_endpoint or self.s.s3_endpoint).rstrip("/")
            return f"{base}/{self.s.s3_bucket}/{key}"
        path = Path(self.s.local_media_dir) / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return f"{self.s.public_base_url.rstrip('/')}/media/{key}"

    async def store_b64(self, b64: str, *, org_id: str, ext: str = "png") -> str:
        return self.put(base64.b64decode(b64), org_id=org_id, ext=ext)

    async def store_from_url(self, url: str, *, org_id: str, default_ext: str) -> str:
        """Re-host provider output: provider URLs expire, and platforms need a stable public URL."""
        async with httpx.AsyncClient(timeout=120, follow_redirects=True) as c:
            r = await c.get(url)
            r.raise_for_status()
        ext = (mimetypes.guess_extension(r.headers.get("content-type", "").split(";")[0]) or f".{default_ext}").lstrip(".")
        return self.put(r.content, org_id=org_id, ext=ext)
