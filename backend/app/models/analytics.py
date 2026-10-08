from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, JSONType
from app.models.base import IdMixin, TimestampMixin


class AnalyticsSnapshot(IdMixin, TimestampMixin, Base):
    """Actual post-publication metrics. Never mixed with AI-predicted scores on Asset.prediction."""

    __tablename__ = "analytics_snapshots"

    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    campaign_id: Mapped[str] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), index=True)
    publish_job_id: Mapped[str] = mapped_column(ForeignKey("publish_jobs.id", ondelete="CASCADE"), index=True)
    platform: Mapped[str] = mapped_column(String(32))
    metrics: Mapped[dict] = mapped_column(JSONType, default=dict)
