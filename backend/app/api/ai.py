from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.orm import Session
from app.api.business import business_user
from app.core.db import get_db
from app.core.rate_limit import limit
from app.models.models import ProviderConnection
from app.services.credentials import decrypt_credentials
from app.services.providers import ProviderError
from app.services.ai import analyze

router = APIRouter(prefix="/api/ai", tags=["ai"])


class ChatInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=4000)


@router.get("/status")
def status(user=Depends(business_user), db: Session = Depends(get_db)):
    row = db.query(ProviderConnection).filter_by(tenant_id=user.tenant_id, provider="openai").first()
    return {"configured": row is not None, "provider": "openai", "read_only": True}


@router.post("/chat")
async def chat(data: ChatInput, request: Request, user=Depends(business_user), db: Session = Depends(get_db)):
    limit(db, request, f"ai:{user.tenant_id}", maximum=5)
    row = db.query(ProviderConnection).filter_by(tenant_id=user.tenant_id, provider="openai").first()
    if not row: raise HTTPException(503, "Company administrator must configure AI in settings")
    try: return await analyze(data.message, decrypt_credentials(row), db, user)
    except ProviderError as exc: raise HTTPException(502, str(exc)) from None
    except Exception: raise HTTPException(502, "AI analysis is temporarily unavailable") from None
