from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.graph.state import CampaignBrain
from app.models import AgentEvent, Business, Campaign, CampaignVersion
from app.services.model_gateway import ModelGateway, get_gateway


@dataclass
class PipelineContext:
    db: Session
    campaign: Campaign
    gateway: ModelGateway = field(default_factory=get_gateway)
    settings: Settings = field(default_factory=get_settings)

    @property
    def business(self) -> Business:
        return self.db.get(Business, self.campaign.business_id)

    def brain(self) -> CampaignBrain:
        return CampaignBrain.model_validate(self.campaign.brain or {})

    def save_brain(self, brain: CampaignBrain) -> None:
        self.campaign.brain = brain.model_dump(mode="json")
        self.db.commit()

    def snapshot_version(self, brain: CampaignBrain, change_summary: dict) -> int:
        """Persist the brain as a new immutable version and make it current."""
        version = (self.db.scalar(
            select(func.max(CampaignVersion.version)).where(CampaignVersion.campaign_id == self.campaign.id)
        ) or 0) + 1
        brain.version = version
        self.db.add(CampaignVersion(
            campaign_id=self.campaign.id, version=version, brain=brain.model_dump(mode="json"),
            change_summary=change_summary,
        ))
        self.campaign.current_version = version
        self.save_brain(brain)
        return version

    def set_status(self, status: str, stage: str | None = None) -> None:
        self.campaign.status = status
        self.campaign.stage = stage
        self.db.commit()

    def emit(self, agent: str, status: str, message: str = "", data: dict | None = None) -> None:
        emit_event(self.db, self.campaign.id, agent, status, message, data)


def emit_event(db: Session, campaign_id: str, agent: str, status: str, message: str = "", data: dict | None = None) -> None:
    seq = (db.scalar(select(func.max(AgentEvent.seq)).where(AgentEvent.campaign_id == campaign_id)) or 0) + 1
    db.add(AgentEvent(campaign_id=campaign_id, seq=seq, agent=agent, status=status, message=message, data=data or {}))
    db.commit()
