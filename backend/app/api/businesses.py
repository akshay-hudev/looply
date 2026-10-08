from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.tenancy import OrgContext, get_org_context, get_owned
from app.models import Business

router = APIRouter(prefix="/businesses", tags=["businesses"])


class BusinessIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    category: str | None = None
    address: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    profile: dict = Field(default_factory=dict)


class BusinessPatch(BaseModel):
    name: str | None = None
    category: str | None = None
    address: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    profile: dict | None = None


def serialize(b: Business) -> dict:
    return {
        "id": b.id,
        "name": b.name,
        "category": b.category,
        "address": b.address,
        "city": b.city,
        "lat": b.lat,
        "lng": b.lng,
        "profile": b.profile or {},
        "learnings": b.learnings or [],
        "created_at": b.created_at,
    }


@router.get("")
def list_businesses(ctx: OrgContext = Depends(get_org_context)):
    rows = ctx.db.scalars(select(Business).where(Business.org_id == ctx.org_id).order_by(Business.created_at)).all()
    return [serialize(b) for b in rows]


@router.post("", status_code=201)
def create_business(body: BusinessIn, ctx: OrgContext = Depends(get_org_context)):
    b = Business(org_id=ctx.org_id, **body.model_dump())
    ctx.db.add(b)
    ctx.db.commit()
    return serialize(b)


@router.get("/{business_id}")
def get_business(business_id: str, ctx: OrgContext = Depends(get_org_context)):
    return serialize(get_owned(ctx, Business, business_id))


@router.patch("/{business_id}")
def update_business(business_id: str, body: BusinessPatch, ctx: OrgContext = Depends(get_org_context)):
    b = get_owned(ctx, Business, business_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(b, k, v)
    ctx.db.commit()
    return serialize(b)


@router.delete("/{business_id}", status_code=204)
def delete_business(business_id: str, ctx: OrgContext = Depends(get_org_context)):
    ctx.db.delete(get_owned(ctx, Business, business_id))
    ctx.db.commit()
