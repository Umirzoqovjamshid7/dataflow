from fastapi import APIRouter, Depends, HTTPException, Request, Response
from datetime import datetime, timedelta, timezone
import hashlib
import secrets
from sqlalchemy import update
from app.core.config import settings
from app.core.audit import audit
from app.core.rate_limit import limit
from app.api.deps import current_user
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.security import verify_password, create_token, hash_password
from app.models.models import User, Tenant, RefreshSession
from app.schemas.schemas import LoginIn

router = APIRouter(prefix="/api/auth", tags=["auth"])
DUMMY_HASH = hash_password(secrets.token_urlsafe(32))

@router.post("/login")
def login(data: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    trusted_origin(request)
    email = str(data.email).strip().lower()
    limit(db, request, "login-ip", maximum=30)
    limit(db, request, "login-account", maximum=10, identity=email)
    user = db.query(User).filter(User.email == email).first()
    password_ok = verify_password(data.password, user.password_hash if user else DUMMY_HASH)
    if not user or not password_ok or not user.active:
        audit(db, request, "failed_login")
        db.commit()
        raise HTTPException(401, "Invalid credentials")
    if user.role != "super_admin":
        tenant = db.get(Tenant, user.tenant_id) if user.tenant_id else None
        if not tenant or not tenant.active:
            audit(db, request, "failed_login", user)
            db.commit()
            raise HTTPException(401, "Invalid credentials")
    issue_refresh(db, response, user)
    audit(db, request, "login", user)
    db.commit()
    return token_response(user)

def token_response(user):
    return {
        "access_token": create_token(user.id, user.role, user.tenant_id),
        "role": user.role,
        "tenant_id": user.tenant_id,
        "full_name": user.full_name,
    }

def issue_refresh(db, response, user):
    raw = secrets.token_urlsafe(48)
    db.add(RefreshSession(user_id=user.id, tenant_id=user.tenant_id, token_hash=hashlib.sha256(raw.encode()).hexdigest(), expires_at=datetime.now(timezone.utc) + timedelta(days=7)))
    response.set_cookie("refresh_token", raw, httponly=True, secure=settings.ENVIRONMENT == "production", samesite="strict", max_age=604800, path="/api/auth")

def trusted_origin(request):
    origin = request.headers.get("origin")
    if origin and origin not in [s.strip() for s in settings.CORS_ORIGINS.split(",")]:
        raise HTTPException(403, "Untrusted origin")

@router.post("/refresh")
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    trusted_origin(request)
    limit(db, request, "refresh", maximum=30)
    digest = hashlib.sha256(request.cookies.get("refresh_token", "").encode()).hexdigest()
    session = db.query(RefreshSession).filter(RefreshSession.token_hash == digest).first()
    now = datetime.now(timezone.utc)
    if not session:
        raise HTTPException(401, "Invalid session")
    # Conditional update permits only one consumer, including concurrent requests.
    claimed = db.execute(update(RefreshSession).where(RefreshSession.id == session.id, RefreshSession.revoked == False, RefreshSession.expires_at > now).values(revoked=True).execution_options(synchronize_session=False)).rowcount
    if not claimed:
        raise HTTPException(401, "Expired or used session")
    user = db.get(User, session.user_id)
    tenant = db.get(Tenant, user.tenant_id) if user and user.tenant_id else None
    if not user or not user.active or (user.role != "super_admin" and (not tenant or not tenant.active)):
        db.commit()
        raise HTTPException(401, "Session disabled")
    issue_refresh(db, response, user)
    db.commit()
    return token_response(user)

@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    trusted_origin(request)
    digest = hashlib.sha256(request.cookies.get("refresh_token", "").encode()).hexdigest()
    db.execute(update(RefreshSession).where(RefreshSession.token_hash == digest).values(revoked=True))
    db.commit()
    response.delete_cookie("refresh_token", path="/api/auth")
    return {"success": True}

@router.get("/me")
def me(user=Depends(current_user)):
    return {"id": user.id, "tenant_id": user.tenant_id, "role": user.role, "full_name": user.full_name, "email": user.email}
