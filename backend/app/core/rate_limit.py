import hashlib
import time
from fastapi import HTTPException
from sqlalchemy import case
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from app.models.models import RateLimit

def limit(db, request, scope, maximum=20, seconds=60):
    # Ignore untrusted Forwarded headers. Configure trusted proxy networks at ingress.
    host = request.client.host if request.client else "unknown"
    key = hashlib.sha256(f"{scope}:{host}".encode()).hexdigest()
    window = int(time.time()) // seconds
    insert = pg_insert if db.bind.dialect.name == "postgresql" else sqlite_insert
    stmt = insert(RateLimit).values(key=key, window=window, count=1)
    stmt = stmt.on_conflict_do_update(index_elements=[RateLimit.key], set_={"window": window, "count": case((RateLimit.window == window, RateLimit.count + 1), else_=1)}).returning(RateLimit.count)
    count = db.execute(stmt).scalar_one()
    db.commit()
    if count > maximum:
        raise HTTPException(429, "Too many requests", headers={"Retry-After": str(seconds)})
