from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, JSONType
from app.models.base import IdMixin, TimestampMixin


class Business(IdMixin, TimestampMixin, Base):
    __tablename__ = "businesses"

    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    category: Mapped[str | None] = mapped_column(String(128), nullable=True)
    address: Mapped[str | None] = mapped_column(String(512), nullable=True)
    city: Mapped[str | None] = mapped_column(String(128), nullable=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    # BusinessProfile (products, brand voice, personality, preferred languages) from the Business agent.
    profile: Mapped[dict] = mapped_column(JSONType, default=dict)
    # Learnings written by the Analytics agent and fed into future strategy.
    learnings: Mapped[list] = mapped_column(JSONType, default=list)
