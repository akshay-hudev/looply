from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.core.tenancy import get_current_user
from app.models import Membership, Organization, User

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    organization_name: str = Field(min_length=1, max_length=255)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class OrgOut(BaseModel):
    id: str
    name: str
    role: str


class MeOut(BaseModel):
    id: str
    email: str
    name: str
    organizations: list[OrgOut]


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: MeOut


def _me(user: User) -> MeOut:
    return MeOut(
        id=user.id,
        email=user.email,
        name=user.name,
        organizations=[OrgOut(id=m.org_id, name=m.organization.name, role=m.role) for m in user.memberships],
    )


@router.post("/register", response_model=TokenOut, status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(email=email, name=body.name, password_hash=hash_password(body.password))
    org = Organization(name=body.organization_name)
    db.add_all([user, org])
    db.flush()
    db.add(Membership(user_id=user.id, org_id=org.id, role="owner"))
    db.commit()
    db.refresh(user)
    return TokenOut(access_token=create_access_token(user.id), user=_me(user))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    return TokenOut(access_token=create_access_token(user.id), user=_me(user))


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(get_current_user)):
    return _me(user)
