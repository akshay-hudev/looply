from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_access_token
from app.models import Membership, User

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    user_id = decode_access_token(creds.credentials)
    user = db.get(User, user_id) if user_id else None
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    return user


@dataclass
class OrgContext:
    user: User
    org_id: str
    role: str
    db: Session


def get_org_context(
    x_org_id: str = Header(..., alias="X-Org-Id"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrgContext:
    membership = db.scalar(
        select(Membership).where(Membership.user_id == user.id, Membership.org_id == x_org_id)
    )
    if membership is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a member of this organization")
    return OrgContext(user=user, org_id=x_org_id, role=membership.role, db=db)


def require_admin(ctx: OrgContext = Depends(get_org_context)) -> OrgContext:
    if ctx.role not in ("owner", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin role required")
    return ctx


def get_owned(ctx: OrgContext, model, obj_id: str):
    """Fetch a row by id, 404 unless it belongs to the caller's organization."""
    obj = ctx.db.get(model, obj_id)
    if obj is None or getattr(obj, "org_id", None) != ctx.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{model.__name__} not found")
    return obj
