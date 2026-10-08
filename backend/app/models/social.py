from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, JSONType
from app.models.base import IdMixin, TimestampMixin


class SocialAccount(IdMixin, TimestampMixin, Base):
    __tablename__ = "social_accounts"
    __table_args__ = (UniqueConstraint("org_id", "platform", "external_id"),)

    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    business_id: Mapped[str | None] = mapped_column(ForeignKey("businesses.id", ondelete="SET NULL"), nullable=True)
    platform: Mapped[str] = mapped_column(String(32))  # instagram | facebook | whatsapp | linkedin | mock
    external_id: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(255), default="")
    access_token_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    refresh_token_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scopes: Mapped[str] = mapped_column(Text, default="")
    meta: Mapped[dict] = mapped_column(JSONType, default=dict)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class PublishJob(IdMixin, TimestampMixin, Base):
    __tablename__ = "publish_jobs"

    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    campaign_id: Mapped[str] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), index=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id", ondelete="CASCADE"), index=True)
    social_account_id: Mapped[str] = mapped_column(ForeignKey("social_accounts.id", ondelete="CASCADE"))
    platform: Mapped[str] = mapped_column(String(32))
    # queued | scheduled | publishing | published | failed
    status: Mapped[str] = mapped_column(String(32), default="queued", index=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    external_post_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    result: Mapped[dict] = mapped_column(JSONType, default=dict)


class WhatsAppContact(IdMixin, TimestampMixin, Base):
    __tablename__ = "whatsapp_contacts"
    __table_args__ = (UniqueConstraint("business_id", "phone"),)

    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    business_id: Mapped[str] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    phone: Mapped[str] = mapped_column(String(32))  # E.164
    name: Mapped[str] = mapped_column(String(255), default="")
    language: Mapped[str | None] = mapped_column(String(16), nullable=True)
    opted_in: Mapped[bool] = mapped_column(Boolean, default=False)
    opted_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    opt_in_source: Mapped[str] = mapped_column(String(128), default="")


class WhatsAppTemplate(IdMixin, TimestampMixin, Base):
    __tablename__ = "whatsapp_templates"

    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    social_account_id: Mapped[str] = mapped_column(ForeignKey("social_accounts.id", ondelete="CASCADE"))
    asset_id: Mapped[str | None] = mapped_column(ForeignKey("assets.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(512))
    language: Mapped[str] = mapped_column(String(16))
    category: Mapped[str] = mapped_column(String(32), default="MARKETING")
    status: Mapped[str] = mapped_column(String(32), default="draft")  # draft | PENDING | APPROVED | REJECTED
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    components: Mapped[list] = mapped_column(JSONType, default=list)
