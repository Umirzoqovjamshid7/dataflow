from pydantic import BaseModel, EmailStr, Field, ConfigDict
from decimal import Decimal
from typing import Optional

class LoginIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str = Field(min_length=1, max_length=1024)

class TenantCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=180)
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=100)

class LeadCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tenant_slug: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=180)
    phone: str = Field(pattern=r"^\+?[0-9 ()-]{7,30}$")
    email: Optional[EmailStr] = None
    source: str = Field(default="website", max_length=80)
    campaign_name: Optional[str] = Field(default=None, max_length=255)

class CampaignCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tenant_id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=255)
    platform: str = Field(default="facebook", max_length=50)
    spend: Decimal = Field(default=0, ge=0, max_digits=18, decimal_places=2)
    impressions: int = Field(default=0, ge=0)
    clicks: int = Field(default=0, ge=0)
    leads: int = Field(default=0, ge=0)
    sales: int = Field(default=0, ge=0)
    revenue: Decimal = Field(default=0, ge=0, max_digits=18, decimal_places=2)
