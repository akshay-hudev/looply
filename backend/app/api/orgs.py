from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.tenancy import OrgContext, get_current_user, require_admin
from app.models import Membership, Organization, User

router = APIRouter(prefix="/orgs", tags=["organizations"])


class OrgIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class MemberIn(BaseModel):
    email: EmailStr
    role: str = Field(default="member", pattern="^(admin|member)$")


@router.post("", status_code=201)
def create_org(body: OrgIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org = Organization(name=body.name)
    db.add(org)
    db.flush()
    db.add(Membership(user_id=user.id, org_id=org.id, role="owner"))
    db.commit()
    return {"id": org.id, "name": org.name, "role": "owner"}


@router.get("/members")
def list_members(ctx: OrgContext = Depends(require_admin)):
    rows = ctx.db.scalars(select(Membership).where(Membership.org_id == ctx.org_id)).all()
    return [{"user_id": m.user_id, "email": m.user.email, "name": m.user.name, "role": m.role} for m in rows]


@router.post("/members", status_code=201)
def add_member(body: MemberIn, ctx: OrgContext = Depends(require_admin)):
    user = ctx.db.scalar(select(User).where(User.email == body.email.lower()))
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User must register before being added")
    exists = ctx.db.scalar(select(Membership).where(Membership.user_id == user.id, Membership.org_id == ctx.org_id))
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already a member")
    ctx.db.add(Membership(user_id=user.id, org_id=ctx.org_id, role=body.role))
    ctx.db.commit()
    return {"user_id": user.id, "role": body.role}
