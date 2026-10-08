from fastapi import APIRouter, BackgroundTasks, Depends

from app.core.tenancy import OrgContext, get_org_context, get_owned
from app.models import Business, Campaign
from app.services.analytics_service import latest_rows
from app.services.jobs import dispatch

router = APIRouter(tags=["analytics"])


@router.get("/campaigns/{campaign_id}/analytics")
def campaign_analytics(campaign_id: str, ctx: OrgContext = Depends(get_org_context)):
    c = get_owned(ctx, Campaign, campaign_id)
    return {"rows": latest_rows(ctx.db, c.id), "report": (c.brain or {}).get("analytics_report"),
            "note": "Metrics are actual platform data; scores under ai_predicted are AI predictions made before launch."}


@router.post("/campaigns/{campaign_id}/analytics/refresh", status_code=202)
async def refresh(campaign_id: str, background: BackgroundTasks, ctx: OrgContext = Depends(get_org_context)):
    c = get_owned(ctx, Campaign, campaign_id)
    await dispatch(background, "pull_analytics", c.id)
    return {"queued": True}


@router.get("/businesses/{business_id}/learnings")
def learnings(business_id: str, ctx: OrgContext = Depends(get_org_context)):
    return get_owned(ctx, Business, business_id).learnings or []
