from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.security import decode_token
from app.models.models import User, Tenant
from jose import JWTError

bearer = HTTPBearer()

def current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
):
    try:
        payload = decode_token(creds.credentials)
        if payload.get("type") != "access":
            raise HTTPException(401, "Invalid token type")
        user = db.get(User, int(payload["sub"]))
        if not user or not user.active:
            raise HTTPException(401, "Unauthorized")
        if user.role != "super_admin":
            tenant = db.get(Tenant, user.tenant_id) if user.tenant_id else None
            if not tenant or not tenant.active:
                raise HTTPException(403, "Company is disabled or unavailable")
        if user.role not in ROLES:
            raise HTTPException(403, "Unknown role")
        return user
    except (JWTError, ValueError, KeyError, TypeError):
        raise HTTPException(401, "Invalid token")

ROLES = {"super_admin", "tenant_admin", "marketer", "sales_manager", "analyst"}

def require_roles(*roles):
    def dependency(user=Depends(current_user)):
        if user.role not in roles and user.role != "super_admin":
            raise HTTPException(403, "Permission denied")
        return user
    return dependency

def tenant_query(db, model, user):
    query = db.query(model)
    if user.role == "super_admin":
        return query
    if not user.tenant_id:
        raise HTTPException(403, "Tenant required")
    return query.filter(model.tenant_id == user.tenant_id)

def super_admin(user=Depends(current_user)):
    if user.role != "super_admin":
        raise HTTPException(403, "Super admin only")
    return user
