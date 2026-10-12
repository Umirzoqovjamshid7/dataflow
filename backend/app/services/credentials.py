"""Credentials never leave the backend; ciphertext is bound to company/provider."""
import json
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from app.core.config import settings


def cipher():
    try:
        return Fernet(settings.INTEGRATION_ENCRYPTION_KEY.encode())
    except (ValueError, TypeError):
        raise HTTPException(503, "Server integration encryption key is not configured") from None


def encrypt_credentials(tenant_id, provider, credentials):
    payload = {"tenant_id": tenant_id, "provider": provider, "credentials": credentials}
    return cipher().encrypt(json.dumps(payload).encode()).decode()


def decrypt_credentials(connection):
    try:
        payload = json.loads(cipher().decrypt(connection.credentials_encrypted.encode()))
        if payload["tenant_id"] != connection.tenant_id or payload["provider"] != connection.provider:
            raise ValueError("Credential scope mismatch")
        return payload["credentials"]
    except (InvalidToken, ValueError, KeyError, TypeError):
        raise HTTPException(503, "Integration credentials cannot be decrypted") from None
