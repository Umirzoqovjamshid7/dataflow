from app.models.models import AuditLog

def audit(db, request, action, user=None, resource="", tenant_id=None):
    db.add(AuditLog(tenant_id=tenant_id if tenant_id is not None else getattr(user, "tenant_id", None), user_id=getattr(user, "id", None), action=action, resource=resource[:180], ip=request.client.host if request and request.client else None, user_agent=request.headers.get("user-agent", "")[:500] if request else None))
