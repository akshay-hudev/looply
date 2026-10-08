from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, JSONType
from app.models.base import IdMixin, TimestampMixin


class Asset(IdMixin, TimestampMixin, Base):
    __tablename__ = "assets"

    campaign_id: Mapped[str] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), index=True)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    platform: Mapped[str] = mapped_column(String(32))  # instagram | whatsapp | linkedin | facebook
    format: Mapped[str] = mapped_column(String(32))  # post | story | reel | carousel | message | offer_card | ...
    language: Mapped[str] = mapped_column(String(32), default="en")
    kind: Mapped[str] = mapped_column(String(16), default="text")  # text | image | video
    variant: Mapped[str] = mapped_column(String(8), default="A")
    is_selected: Mapped[bool] = mapped_column(default=True)
    content: Mapped[dict] = mapped_column(JSONType, default=dict)
    cultural_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    media_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    media_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    media_task_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    media_status: Mapped[str | None] = mapped_column(String(32), nullable=True)  # pending | processing | ready | failed
    # draft | stale | verified | failed | approved | rejected
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True)
    verification: Mapped[dict] = mapped_column(JSONType, default=dict)
    prediction: Mapped[dict] = mapped_column(JSONType, default=dict)
    optimization_history: Mapped[list] = mapped_column(JSONType, default=list)
    brain_version: Mapped[int] = mapped_column(Integer, default=1)
    attempts: Mapped[int] = mapped_column(Integer, default=0)


class AssetDependency(IdMixin, Base):
    """Edges of the campaign dependency graph: asset depends on a Campaign Brain fact key."""

    __tablename__ = "asset_dependencies"
    __table_args__ = (UniqueConstraint("asset_id", "fact_key"),)

    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id", ondelete="CASCADE"), index=True)
    campaign_id: Mapped[str] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), index=True)
    fact_key: Mapped[str] = mapped_column(String(64), index=True)
