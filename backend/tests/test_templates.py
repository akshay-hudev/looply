"""Stored templates are chosen for the job, and the three variants do not share one shape."""

from app.api.campaigns import blocks_approval
from app.content.templates import choose, signals
from app.graph.state import CampaignBrain, CampaignBrief, OfferFacts
from app.models import Asset


def _brain(**kwargs) -> CampaignBrain:
    brief = kwargs.pop("brief", {})
    offer = kwargs.pop("offer", {})
    return CampaignBrain(brief=CampaignBrief(**brief), offer=OfferFacts(**offer), **kwargs)


def test_offer_and_date_prefer_offer_and_event_templates():
    brain = _brain(brief={"offer": "15% off", "occasion": "new menu", "event_date": "2026-10-16"},
                   offer={"discount": "15%", "start_date": "2026-10-16"})
    assert signals(brain) >= {"offer", "event"}
    poster = choose(brain, "poster")
    ids = [item["id"] for item in poster]
    assert ids[:2] == ["poster_event", "poster_offer_badge"]
    assert len(set(ids)) == 3
    assert [item["label"] for item in poster] == ["A", "B", "C"]


def test_fact_flagged_image_can_still_be_approved():
    flagged = Asset(campaign_id="c", org_id="o", platform="instagram", format="poster", kind="image",
                    status="failed", verification={"verdict": "NEEDS_WORK", "issues": [{"severity": "high"}]})
    assert blocks_approval(flagged) is False
    unfinished = Asset(campaign_id="c", org_id="o", platform="instagram", format="poster", kind="image",
                       status="draft", verification={})
    assert blocks_approval(unfinished) is True
    waiting = Asset(campaign_id="c", org_id="o", platform="facebook", format="post", kind="text",
                    status="pending_localization", verification={"verdict": "NEEDS_WORK", "issues": [{"severity": "high"}]})
    assert blocks_approval(waiting) is False


def test_story_templates_name_roles_and_a_use():
    brain = _brain(objective="Increase awareness and visits")
    story = choose(brain, "story")
    assert story[0]["use"]
    roles = {beat["role"] for item in story for beat in item["beats"]}
    assert {"product", "customer", "host", "narrator", "place"} & roles
    reel = choose(brain, "reel")
    assert reel[0]["aspect"] == "9:16"
    assert any(beat["t"].startswith("0-2") for beat in reel[0]["beats"])
