from datetime import datetime, timedelta, timezone
from jose import jwt
from passlib.context import CryptContext
from pwdlib import PasswordHash
from .config import settings

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
modern_pwd = PasswordHash.recommended()

def hash_password(password: str) -> str:
    return modern_pwd.hash(password)

def verify_password(password: str, hashed: str) -> bool:
    try:
        return modern_pwd.verify(password, hashed) if hashed.startswith("$argon2") else pwd.verify(password, hashed)
    except (ValueError, TypeError):
        return False

def create_token(user_id: int, role: str, tenant_id: int | None):
    payload = {
        "sub": str(user_id),
        "role": role,
        "tenant_id": tenant_id,
        "iss": "leadflow",
        "aud": "leadflow-api",
        "type": "access",
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")

def decode_token(token: str):
    return jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"], audience="leadflow-api", issuer="leadflow", options={"require_exp": True, "require_sub": True})
