import asyncio
import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import httpx
import pytest
from cryptography.fernet import Fernet
from app.core.config import settings
from app.models.models import ProviderConnection, ExternalRecord, Campaign, SyncJob, Tenant, User, BusinessPlan
from app.services.credentials import decrypt_credentials
from app.services.providers import ProviderError, validate_credentials, fetch_records, request_json
from app.services.ai import execute_tool
from app.worker import process_one

CREDS = {"webhook_url": "https://example.bitrix24.com/rest/1/secret-test-only/"}


@pytest.fixture
def encryption(monkeypatch):
    monkeypatch.setattr(settings, "INTEGRATION_ENCRYPTION_KEY", Fernet.generate_key().decode())


def configure(client, tokens, provider="bitrix", credentials=None):
    return client.post(f"/api/integrations/{provider}", headers=tokens["tenant_admin"], json={"credentials": credentials or CREDS})


def test_credentials_encrypted_scoped_and_never_returned(fixture, encryption):
    client, factory, tokens, ids = fixture
    response = configure(client, tokens)
    assert response.status_code == 200
    assert "secret-test-only" not in response.text
    assert response.json()["status"] == "configured"
    with factory() as db:
        connection = db.query(ProviderConnection).one()
        assert "secret-test-only" not in connection.credentials_encrypted
        assert decrypt_credentials(connection)["webhook_url"].endswith("secret-test-only")
        connection.tenant_id = ids["b"]
        with pytest.raises(Exception): decrypt_credentials(connection)


def test_customer_cannot_select_other_company(fixture, encryption):
    client, factory, tokens, ids = fixture
    body = {"credentials": CREDS, "tenant_id": ids["b"]}
    assert client.post("/api/integrations/bitrix", headers=tokens["tenant_admin"], json=body).status_code == 422
    for role in ("marketer", "analyst", "sales_manager", "super_admin"):
        assert client.get("/api/integrations", headers=tokens[role]).status_code == 403
    assert configure(client, tokens).status_code == 200
    with factory() as db:
        db.query(ProviderConnection).update({"tenant_id": ids["b"]})
        db.commit()
    assert client.get("/api/integrations", headers=tokens["tenant_admin"]).json() == []
    assert client.post("/api/integrations/bitrix/test", headers=tokens["tenant_admin"]).status_code == 404


def test_missing_encryption_key_fails_closed(fixture, monkeypatch):
    client, factory, tokens, _ = fixture
    monkeypatch.setattr(settings, "INTEGRATION_ENCRYPTION_KEY", "")
    assert configure(client, tokens).status_code == 503
    with factory() as db: assert db.query(ProviderConnection).count() == 0


@pytest.mark.parametrize("url", ["http://example.bitrix24.com/rest/1/key", "https://127.0.0.1/rest/1/key", "https://example.bitrix24.com.evil.com/rest/1/key", "https://user:pass@example.bitrix24.com/rest/1/key", "https://example.bitrix24.com:8443/rest/1/key", "https://example.bitrix24.com/rest/1/key?token=x"])
def test_provider_url_restrictions(url):
    with pytest.raises(ValueError): validate_credentials("bitrix", {"webhook_url": url})


def test_connection_test_failure_is_honest_and_redacted(fixture, encryption, monkeypatch):
    client, _, tokens, _ = fixture
    configure(client, tokens)
    async def fail(*args): raise RuntimeError("https://secret-test-only.invalid/raw-provider-token")
    monkeypatch.setattr("app.api.integrations.test_connection", fail)
    response = client.post("/api/integrations/bitrix/test", headers=tokens["tenant_admin"])
    assert response.status_code == 502
    assert "secret-test-only" not in response.text
    assert client.get("/api/integrations", headers=tokens["tenant_admin"]).json()[0]["status"] == "error"


def test_queue_worker_duplicate_prevention_and_tenant_scope(fixture, encryption, monkeypatch):
    client, factory, tokens, ids = fixture
    configure(client, tokens, "meta", {"ad_account_id": "act_123", "access_token": "test-only-token"})
    async def fake(*args): return [{"kind": "campaign", "external_id": "act_123:123:2026-10-01", "data": {
        "campaign_id": "123", "campaign_name": "Real API fixture", "date_start": "2026-10-01",
        "spend": "10.00", "impressions": "100", "clicks": "5", "account_currency": "UZS",
        "actions": [{"action_type": "lead", "value": "2"}, {"action_type": "onsite_conversion.lead_grouped", "value": "2"}]}}]
    monkeypatch.setattr("app.worker.fetch_records", fake)
    body = {"start": "2026-10-01", "end": "2026-10-01"}
    for _ in range(2):
        response = client.post("/api/integrations/meta/sync", headers=tokens["tenant_admin"], json=body)
        assert response.status_code == 202
        assert response.json()["status"] == "queued"
        assert asyncio.run(process_one(factory)) is True
    with factory() as db:
        assert db.query(Campaign).count() == 1
        campaign = db.query(Campaign).one()
        assert campaign.tenant_id == ids["a"] and campaign.leads == 2 and campaign.currency == "UZS"
        assert db.query(ExternalRecord).count() == 1
        assert db.query(SyncJob).filter_by(status="completed").count() == 2
        assert db.query(ProviderConnection).one().last_sync_at


def test_failed_import_rolls_back_all_records(fixture, encryption, monkeypatch):
    client, factory, tokens, ids = fixture
    configure(client, tokens)
    async def fake(*args): return [{"kind": "deal", "external_id": "first", "data": {"TITLE": "First"}},
                                  {"kind": "campaign", "external_id": "broken", "data": {}}]
    monkeypatch.setattr("app.worker.fetch_records", fake)
    response = client.post("/api/integrations/bitrix/sync", headers=tokens["tenant_admin"], json={"start":"2026-10-01","end":"2026-10-01"})
    assert response.status_code == 202
    asyncio.run(process_one(factory))
    with factory() as db:
        assert db.query(ExternalRecord).count() == 0
        assert db.query(Campaign).count() == 0
        assert db.query(SyncJob).one().status == "failed"
        assert db.query(ProviderConnection).one().last_sync_at is None


def test_queue_lock_and_disabled_company(fixture, encryption, monkeypatch):
    client, factory, tokens, ids = fixture
    configure(client, tokens)
    body = {"start":"2026-10-01","end":"2026-10-01"}
    assert client.post("/api/integrations/bitrix/sync", headers=tokens["tenant_admin"], json=body).status_code == 202
    assert client.post("/api/integrations/bitrix/sync", headers=tokens["tenant_admin"], json=body).status_code == 409
    assert configure(client, tokens).status_code == 409
    async def forbidden(*args): raise AssertionError("Disabled company must never call provider")
    monkeypatch.setattr("app.worker.fetch_records", forbidden)
    with factory() as db:
        db.get(Tenant, ids["a"]).active = False
        db.commit()
    asyncio.run(process_one(factory))
    with factory() as db: assert db.query(ProviderConnection).one().last_error == "Company is disabled"


def test_kpis_and_foreign_campaign_filter(fixture):
    client, factory, tokens, ids = fixture
    with factory() as db:
        db.add(Campaign(tenant_id=ids["b"], name="Private", spend=500, date=datetime(2026,10,1,tzinfo=timezone.utc)))
        db.commit()
        foreign = db.query(Campaign).one().id
    assert client.get(f"/api/analytics/summary?campaign={foreign}", headers=tokens["tenant_admin"]).status_code == 404
    data = client.get("/api/analytics/summary?from=2026-10-01&to=2026-10-12",headers=tokens["analyst"]).json()
    assert data["spend"] == 0
    assert len(data["kpis"]["spend"]["trend"]) == 7
    assert data["kpis"]["spend"]["change_percent"] == 0


def test_mixed_currency_totals_are_not_added(fixture):
    client, factory, tokens, ids = fixture
    with factory() as db:
        db.add_all([Campaign(tenant_id=ids["a"], name="USD", currency="USD", spend=10), Campaign(tenant_id=ids["a"], name="UZS", currency="UZS", spend=100000)])
        db.commit()
    response = client.get("/api/analytics/summary",headers=tokens["tenant_admin"])
    assert response.status_code == 200
    data = response.json()
    assert data["currency"] == "mixed" and data["spend"] is None and data["cpl"] is None
    assert data["kpis"]["spend"]["current"] is None


def test_business_and_plans_isolation(fixture):
    client, factory, tokens, ids = fixture
    with factory() as db:
        db.add(ExternalRecord(tenant_id=ids["b"],provider="bitrix",kind="deal",external_id="private",data_json='{"TITLE":"private","STAGE_SEMANTIC_ID":"S","OPPORTUNITY":900}'))
        db.commit()
    data = client.get("/api/business/summary",headers=tokens["analyst"]).json()
    assert data["records"] == 0 and data["sales"]["won"] == 0
    body = {"month":"2026-10","metric":"leads","target":100}
    assert client.post("/api/business/plans",headers=tokens["analyst"],json=body).status_code == 403
    assert client.post("/api/business/plans",headers=tokens["tenant_admin"],json={**body,"tenant_id":ids["b"]}).status_code == 422
    assert client.post("/api/business/plans",headers=tokens["tenant_admin"],json=body).status_code == 200
    assert client.get("/api/business/plans?month=2026-99",headers=tokens["analyst"]).status_code == 422


def test_ai_readonly_tool_allowlist(fixture):
    _, factory, _, _ = fixture
    with factory() as db:
        user = db.query(User).filter_by(role="analyst").one()
        before = db.query(ExternalRecord).count()
        for name in ("marketing_summary","campaign_performance","business_summary","plan_fact"):
            assert execute_tool(name,"{}",db,user) is not None
        for name, arguments in (("execute_sql", "{}"),("business_summary",'{"tenant_id":2}'),("business_summary","[]")):
            with pytest.raises(ProviderError): execute_tool(name,arguments,db,user)
        assert db.query(ExternalRecord).count() == before
        assert not db.new and not db.dirty and not db.deleted


def test_ai_requires_backend_company_credentials(fixture):
    client, _, tokens, _ = fixture
    assert client.get("/api/ai/status",headers=tokens["analyst"]).json()["configured"] is False
    assert client.post("/api/ai/chat",headers=tokens["analyst"],json={"message":"Analyze"}).status_code == 503
    assert client.post("/api/ai/chat",headers=tokens["sales_manager"],json={"message":"Analyze"}).status_code == 403


def mock_provider(monkeypatch, handler):
    original = httpx.AsyncClient
    monkeypatch.setattr("app.services.providers.httpx.AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    async def no_sleep(*args): pass
    monkeypatch.setattr("app.services.providers.asyncio.sleep", no_sleep)


def test_bitrix_pagination_and_no_pruning(monkeypatch):
    starts = []
    def handler(request):
        assert request.method == "POST" and "delete" not in str(request.url)
        body = json.loads(request.content)
        starts.append(body["start"])
        return httpx.Response(200,json={"result":[{"ID": str(body["start"]+1)}], **({"next":50} if body["start"]==0 else {})})
    mock_provider(monkeypatch,handler)
    records = asyncio.run(fetch_records("bitrix",CREDS,date(2026,10,1),date(2026,10,1)))
    assert len(records)==6 and starts == [0,50,0,50,0,50]


def test_meta_never_follows_next_url(monkeypatch):
    urls=[]
    def handler(request):
        urls.append(str(request.url))
        return httpx.Response(200,json={"data":[], **({"paging":{"next":"https://evil.invalid/steal","cursors":{"after":"next"}}} if "after" not in request.url.params else {})})
    mock_provider(monkeypatch,handler)
    asyncio.run(fetch_records("meta",{"ad_account_id":"act_123","access_token":"private"},date(2026,10,1),date(2026,10,1)))
    assert len(urls)==2 and all(url.startswith("https://graph.facebook.com/") for url in urls)
    assert all("private" not in url for url in urls)


def test_retry_is_bounded_and_errors_redacted(monkeypatch):
    attempts=[]
    def handler(request):
        attempts.append(1)
        return httpx.Response(429,json={"secret":"must-not-leak"},headers={"Retry-After":"0"})
    mock_provider(monkeypatch,handler)
    async def run():
        async with httpx.AsyncClient() as client:
            with pytest.raises(ProviderError) as error:
                await request_json(client,"GET","https://graph.facebook.com/test")
            assert "must-not-leak" not in str(error.value)
    asyncio.run(run())
    assert len(attempts)==3


def test_amocrm_pagination_stays_on_account(monkeypatch):
    requests=[]
    def handler(request):
        requests.append(request)
        endpoint=request.url.path.rsplit("/",1)[-1]
        page=int(request.url.params["page"])
        return httpx.Response(200,json={"_embedded":{endpoint:[{"id":page,"name":"Fixture"}]},
            "_links": {"next":{"href":"https://evil.invalid/steal"}} if page==1 else {}})
    mock_provider(monkeypatch,handler)
    records=asyncio.run(fetch_records("amocrm",{"account_url":"https://example.amocrm.ru","access_token":"private"},date(2026,10,1),date(2026,10,1)))
    assert len(records)==4
    assert all(request.url.host=="example.amocrm.ru" for request in requests)
    assert all(request.headers["Authorization"]=="Bearer private" for request in requests)


def test_onlinepbx_auth_and_bounded_day_windows(monkeypatch):
    history=[]
    def handler(request):
        if request.url.path.endswith("auth.json"):
            return httpx.Response(200,json={"status":1,"data":{"key_id":"id","key":"private"}})
        body=json.loads(request.content)
        history.append(body)
        assert request.headers["x-pbx-authentication"]=="id:private"
        return httpx.Response(200,json={"status":1,"data":[{"uuid":str(body["start_stamp_from"]),"billsec":10,"caller_id_number":"must-not-store"}]})
    mock_provider(monkeypatch,handler)
    records=asyncio.run(fetch_records("onlinepbx",{"domain":"test.onpbx.ru","auth_key":"private"},date(2026,10,1),date(2026,10,2)))
    assert len(records)==2 and len(history)==2
    assert all(item["kind"]=="call" and "caller_id_number" not in item["data"] for item in records)
    assert all(body["start_stamp_to"]-body["start_stamp_from"]==86399 for body in history)


def test_ai_tool_loop_returns_backend_analysis(fixture, encryption, monkeypatch):
    client, factory, tokens, ids=fixture
    assert configure(client,tokens,"openai",{"api_key":"private-test-key","model":"gpt-4.1-mini"}).status_code==200
    calls=[]
    async def fake(client,method,url,**kwargs):
        payload=kwargs["json"]
        calls.append(payload)
        if len(calls)==1:
            return {"choices":[{"message":{"role":"assistant","content":None,"tool_calls":[{"id":"read1","type":"function","function":{"name":"business_summary","arguments":"{}"}}]}}]}
        assert "private-test-key" not in json.dumps(payload)
        assert payload["messages"][-1]["role"]=="tool"
        data=json.loads(payload["messages"][-1]["content"])
        assert data["records"]==0
        return {"choices":[{"message":{"role":"assistant","content":"No imported CRM data yet."}}]}
    monkeypatch.setattr("app.services.ai.request_json",fake)
    response=client.post("/api/ai/chat",headers=tokens["analyst"],json={"message":"Analyze CRM"})
    assert response.status_code==200
    assert response.json()["tools_used"]==["business_summary"]
    assert response.json()["read_only"] is True
    with factory() as db: assert db.query(ExternalRecord).count()==0


def test_worker_recovers_interrupted_jobs(fixture, encryption):
    client,factory,tokens,ids=fixture
    configure(client,tokens)
    with factory() as db:
        row=db.query(ProviderConnection).one()
        row.status="syncing"
        db.add(SyncJob(connection_id=row.id,tenant_id=ids["a"],start_date=date(2026,10,1),end_date=date(2026,10,1),status="running",started_at=datetime.now(timezone.utc)-timedelta(minutes=11)))
        db.commit()
    assert asyncio.run(process_one(factory)) is False
    with factory() as db:
        assert db.query(SyncJob).one().status=="failed"
        assert db.query(ProviderConnection).one().status=="error"


def test_no_api_method_path_collisions():
    from app.main import app
    endpoints=[(method,route.path) for route in app.routes for method in getattr(route,"methods",[]) ]
    assert len(endpoints)==len(set(endpoints))


def test_campaign_filter_includes_all_daily_rows(fixture):
    client,factory,tokens,ids=fixture
    with factory() as db:
        rows=[Campaign(tenant_id=ids["a"],platform="facebook",external_id="same",name="Same",spend=10,leads=2,date=datetime(2026,10,day,tzinfo=timezone.utc)) for day in (1,2)]
        db.add_all(rows)
        db.add(Campaign(tenant_id=ids["b"],platform="facebook",external_id="same",name="Private",spend=999,date=datetime(2026,10,1,tzinfo=timezone.utc)))
        db.commit()
        selected=rows[0].id
    response=client.get(f"/api/analytics/summary?from=2026-10-01&to=2026-10-12&campaign={selected}",headers=tokens["analyst"])
    assert response.status_code==200
    assert response.json()["spend"]==20
    assert response.json()["top_campaigns"][0]["leads"]==4


def test_overlapping_pages_deduplicate_with_autoflush_disabled(fixture, encryption):
    client,factory,tokens,_=fixture
    configure(client,tokens)
    from app.api.integrations import upsert_records
    with factory(autoflush=False) as db:
        connection=db.query(ProviderConnection).one()
        records=[{"kind":"deal","external_id":"repeated","data":{"TITLE":title}} for title in ("old","latest")]
        upsert_records(db,connection,records)
        db.commit()
        assert db.query(ExternalRecord).count()==1
        assert json.loads(db.query(ExternalRecord).one().data_json)["TITLE"]=="latest"


def test_meta_json_rate_limit_is_retried(monkeypatch):
    attempts=[]
    def handler(request):
        attempts.append(1)
        return httpx.Response(200,json={"error":{"code":4,"message":"private-token"}} if len(attempts)<3 else {"data":[]})
    mock_provider(monkeypatch,handler)
    records=asyncio.run(fetch_records("meta",{"ad_account_id":"act_123","access_token":"private"},date(2026,10,1),date(2026,10,1)))
    assert records==[] and len(attempts)==3
