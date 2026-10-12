"""Durable tenant-scoped import worker: python -m app.worker. No destructive jobs."""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from app.core.db import SessionLocal
from app.models.models import SyncJob, ProviderConnection, Tenant
from app.services.providers import fetch_records, ProviderError
from app.services.credentials import decrypt_credentials
from app.api.integrations import upsert_records

logger = logging.getLogger("dataflow.worker")


def recover_stale(db):
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=10)
    for job in db.query(SyncJob).filter(SyncJob.status == "running", SyncJob.started_at < cutoff).with_for_update(skip_locked=True):
        job.status, job.finished_at = "failed", now
        connection = db.get(ProviderConnection, job.connection_id)
        connection.status, connection.last_error = "error", "Worker interrupted; retry synchronization"
    for connection in db.query(ProviderConnection).filter(ProviderConnection.status == "testing", ProviderConnection.operation_started_at < cutoff).with_for_update(skip_locked=True):
        connection.status, connection.last_error = "error", "Connection test interrupted; retry"
    db.commit()


async def process_one(factory=SessionLocal):
    with factory() as db:
        recover_stale(db)
        job = db.query(SyncJob).filter_by(status="queued").order_by(SyncJob.id).with_for_update(skip_locked=True).first()
        if not job: return False
        job_id = job.id
        job.status, job.started_at = "running", datetime.now(timezone.utc)
        connection = db.query(ProviderConnection).filter_by(id=job.connection_id, tenant_id=job.tenant_id).one()
        connection.status = "syncing"
        db.commit()
        try:
            tenant = db.get(Tenant, job.tenant_id)
            if not tenant or not tenant.active: raise ProviderError("Company is disabled")
            credentials = decrypt_credentials(connection)
            records = await asyncio.wait_for(fetch_records(connection.provider, credentials, job.start_date, job.end_date), timeout=180)
            records = list({(item["kind"], item["external_id"]): item for item in records}.values())
            # Lock/fence before import; a recovered job may not commit late results.
            db.refresh(job, with_for_update=True)
            db.refresh(tenant)
            if job.status != "running" or not tenant.active: raise ProviderError("Synchronization was cancelled or company is disabled")
            upsert_records(db, connection, records)
            job.status, job.finished_at = "completed", datetime.now(timezone.utc)
            connection.status, connection.last_error = "synced", None
            connection.last_sync_at, connection.synced_records = job.finished_at, len(records)
            db.commit()
        except (Exception, asyncio.CancelledError) as exc:
            db.rollback()
            job = db.get(SyncJob, job_id)
            connection = db.get(ProviderConnection, job.connection_id)
            job.status, job.finished_at = "failed", datetime.now(timezone.utc)
            connection.status = "error"
            connection.last_error = str(exc) if isinstance(exc, ProviderError) else "Synchronization failed; no partial import was saved"
            db.commit()
            if isinstance(exc, asyncio.CancelledError): raise
    return True


async def run():
    while True:
        try:
            worked = await process_one()
        except Exception:
            # Never log request URLs, provider bodies, credentials or exception strings.
            logger.error("Import worker could not process queue")
            worked = False
        if not worked: await asyncio.sleep(3)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
