"""Shared copy schema used by platform, language, optimizer and truth agents."""

from pydantic import BaseModel, Field

COPY_FIELDS = ("headline", "hook", "body", "cta")


class VideoScene(BaseModel):
    t: str = Field(description="time range, e.g. '0-2s'")
    visual: str
    overlay_text: str = ""
    voiceover: str = ""


class VideoScript(BaseModel):
    duration_s: int = 10
    aspect_ratio: str = "9:16"
    scenes: list[VideoScene] = Field(default_factory=list)


class AssetCopy(BaseModel):
    headline: str = ""
    hook: str = ""
    body: str = ""
    cta: str = ""
    hashtags: list[str] = Field(default_factory=list)
    visual_brief: str = ""
    slides: list[str] = Field(default_factory=list, description="carousel only: 3-6 short on-slide texts, in order")
    video_script: VideoScript | None = None


def copy_from_content(content: dict) -> AssetCopy:
    return AssetCopy.model_validate({k: v for k, v in content.items() if k in AssetCopy.model_fields})


def asset_text(content: dict) -> str:
    """All customer-facing text in an asset, for fact checking."""
    parts = [str(content.get(f) or "") for f in COPY_FIELDS]
    parts.append(" ".join(content.get("hashtags") or []))
    parts.append(str(content.get("overlay_text") or ""))
    parts.extend(str(s) for s in content.get("slides") or [])
    script = content.get("video_script") or {}
    for scene in script.get("scenes") or []:
        parts.extend([scene.get("overlay_text") or "", scene.get("voiceover") or ""])
    return "\n".join(p for p in parts if p.strip())
