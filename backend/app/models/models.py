from datetime import date, datetime, timezone
from decimal import Decimal
from sqlalchemy import String, Integer, Numeric, Date, DateTime, ForeignKey, Boolean, Text, CheckConstraint, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.db import Base

class Tenant(Base):
    __tablename__ = "tenants"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(180), unique=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("(role = 'super_admin' AND tenant_id IS NULL) OR (role IN ('tenant_admin','marketer','sales_manager','analyst') AND tenant_id IS NOT NULL)", name="ck_user_role_tenant"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int | None] = mapped_column(ForeignKey("tenants.id"), nullable=True, index=True)
    email: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(180))
    role: Mapped[str] = mapped_column(String(50), default="tenant_admin")
    active: Mapped[bool] = mapped_column(Boolean, default=True)

class Campaign(Base):
    __tablename__ = "campaigns"
    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    platform: Mapped[str] = mapped_column(String(50), default="facebook")
    external_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    spend: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    impressions: Mapped[int] = mapped_column(Integer, default=0)
    clicks: Mapped[int] = mapped_column(Integer, default=0)
    leads: Mapped[int] = mapped_column(Integer, default=0)
    sales: Mapped[int] = mapped_column(Integer, default=0)
    revenue: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

class V5BusinessPlan(Base):
    __tablename__ = "v5_business_plans"
    __table_args__ = (
        CheckConstraint("target >= 0", name="ck_v5_plan_target"),
        UniqueConstraint("tenant_id", "month", "metric", "project", name="uq_v5_plan_project"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    month: Mapped[str] = mapped_column(String(7))
    metric: Mapped[str] = mapped_column(String(30))
    project: Mapped[str] = mapped_column(String(255), default="__total__")
    target: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)

class Lead(Base):
    __tablename__ = "leads"
    __table_args__ = (
        Index("uq_leads_tenant_idempotency_key", "tenant_id", "idempotency_key", unique=True),
        Index("ix_leads_crm_external", "tenant_id", "crm", "external_id", unique=True),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    name: Mapped[str] = mapped_column(String(180))
    phone: Mapped[str] = mapped_column(String(80), index=True)
    email: Mapped[str | None] = mapped_column(String(180), nullable=True)
    source: Mapped[str] = mapped_column(String(80), default="website")
    campaign_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(80), default="NEW", index=True)
    crm: Mapped[str | None] = mapped_column(String(80), nullable=True)
    external_id: Mapped[str | None] = mapped_column(String(180), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    assigned_to: Mapped[str | None] = mapped_column(String(180), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

class Integration(Base):
    __tablename__ = "integrations"
    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    provider: Mapped[str] = mapped_column(String(80))
    config_json: Mapped[str] = mapped_column(Text, default="{}")
    active: Mapped[bool] = mapped_column(Boolean, default=True)

class V5ProviderConnection(Base):
    __tablename__ = "v5_provider_connections"
    __table_args__ = (UniqueConstraint("tenant_id", "provider", name="uq_v5_connection"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    provider: Mapped[str] = mapped_column(String(30))
    credentials_encrypted: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="not_connected")
    tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(180), nullable=True)
    synced_records: Mapped[int] = mapped_column(Integer, default=0)
    operation_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

class V5ExternalRecord(Base):
    __tablename__ = "v5_external_records"
    __table_args__ = (UniqueConstraint("tenant_id", "provider", "kind", "external_id", name="uq_v5_external_record"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    provider: Mapped[str] = mapped_column(String(30))
    kind: Mapped[str] = mapped_column(String(30))
    external_id: Mapped[str] = mapped_column(String(180))
    data_json: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class V5SyncJob(Base):
    __tablename__ = "v5_sync_jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    connection_id: Mapped[int] = mapped_column(ForeignKey("v5_provider_connections.id"), index=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(30), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int | None] = mapped_column(ForeignKey("tenants.id"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(80), index=True)
    resource: Mapped[str] = mapped_column(String(180))
    ip: Mapped[str | None] = mapped_column(String(80))
    user_agent: Mapped[str | None] = mapped_column(String(500))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

class RefreshSession(Base):
    __tablename__ = "refresh_sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int | None] = mapped_column(ForeignKey("tenants.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    persistent: Mapped[bool] = mapped_column(Boolean, default=False)

class RateLimit(Base):
    """Infrastructure state; not a tenant business object."""
    __tablename__ = "rate_limits"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    window: Mapped[int] = mapped_column(Integer)
    count: Mapped[int] = mapped_column(Integer)
