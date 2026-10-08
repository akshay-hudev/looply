from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, JSONType
from app.models.base import IdMixin, TimestampMixin


class Campaign(IdMixin, TimestampMixin, Base):
    __tablename__ = "campaigns"

    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    business_id: Mapped[str] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255), default="Untitled campaign")
    # draft | clarifying | generating | review | approved | publishing | published | failed
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True)
    stage: Mapped[str | None] = mapped_column(String(64), nullable=True)
    current_version: Mapped[int] = mapped_column(Integer, default=1)
    brain: Mapped[dict] = mapped_column(JSONType, default=dict)


class CampaignVersion(IdMixin, TimestampMixin, Base):
    __tablename__ = "campaign_versions"
    __table_args__ = (UniqueConstraint("campaign_id", "version"),)

    campaign_id: Mapped[str] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    brain: Mapped[dict] = mapped_column(JSONType)
    change_summary: Mapped[dict] = mapped_column(JSONType, default=dict)


class AgentEvent(IdMixin, TimestampMixin, Base):
    """Progress events streamed to the UI over SSE."""

    __tablename__ = "agent_events"

    campaign_id: Mapped[str] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), index=True)
    seq: Mapped[int] = mapped_column(Integer, index=True)
    agent: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32))  # started | completed | failed | info
    message: Mapped[str] = mapped_column(Text, default="")
    data: Mapped[dict] = mapped_column(JSONType, default=dict)
