"""Read-only provider adapters. Never follow provider-supplied URLs or prune rows."""
import asyncio
import json
import re
import logging
import hashlib
from datetime import datetime, time, timedelta, timezone
from urllib.parse import urlsplit
import httpx
from app.core.config import settings

MAX_PAGES = 100
MAX_RECORDS = 25000
# httpx INFO logs contain request URLs; Bitrix embeds a secret in its URL path.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)


class ProviderError(Exception):
    """Only safe fixed messages are exposed to customers."""


def account_url(value, provider):
    parsed = urlsplit(value)
    suffixes = {
        "bitrix": (".bitrix24.com", ".bitrix24.ru", ".bitrix24.eu", ".bitrix24.kz", ".bitrix24.uz"),
        "amocrm": (".amocrm.ru", ".amocrm.com", ".kommo.com"),
    }[provider]
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or parsed.port not in (None, 443) or parsed.query or parsed.fragment
            or not parsed.hostname.endswith(suffixes)):
        raise ValueError("Use your official HTTPS provider account URL")
    if provider == "bitrix" and not re.fullmatch(r"/rest/\d+/[A-Za-z0-9_-]+/?", parsed.path):
        raise ValueError("Bitrix requires a REST webhook URL")
    if provider == "amocrm" and parsed.path not in ("", "/"):
        raise ValueError("amoCRM requires an account origin without a path")
    return value.rstrip("/")


def validate_credentials(provider, credentials):
    required = {
        "bitrix": {"webhook_url"}, "meta": {"access_token", "ad_account_id"},
        "amocrm": {"account_url", "access_token"},
        "onlinepbx": {"domain", "auth_key"}, "openai": {"api_key", "model"},
    }
    if provider not in required or set(credentials) != required[provider]:
        raise ValueError("Provide exactly the required provider fields")
    if any(not isinstance(v, str) or not v.strip() or len(v) > 4096 for v in credentials.values()):
        raise ValueError("Provider fields must be non-empty strings")
    c = {k: v.strip() for k, v in credentials.items()}
    if provider == "bitrix": c["webhook_url"] = account_url(c["webhook_url"], provider)
    if provider == "amocrm": c["account_url"] = account_url(c["account_url"], provider)
    if provider == "meta" and not re.fullmatch(r"act_\d+", c["ad_account_id"]):
        raise ValueError("Meta ad account must be act_<digits>")
    if provider == "onlinepbx" and not re.fullmatch(r"[a-z0-9-]+\.onpbx\.ru", c["domain"]):
        raise ValueError("Use your <account>.onpbx.ru domain")
    if provider == "openai" and not re.fullmatch(r"[A-Za-z0-9_.:-]{1,100}", c["model"]):
        raise ValueError("Invalid model ID")
    return c


async def request_json(client, method, url, **kwargs):
    for attempt in range(3):
        try:
            # Throttles all pages and retries, independently of inbound API limits.
            await asyncio.sleep(0.55)
            response = await client.request(method, url, **kwargs)
            if response.status_code == 429 or response.status_code >= 500:
                if attempt == 2: raise ProviderError("Provider rate limit or temporary failure; retry later")
                try: delay = min(10, max(1, float(response.headers.get("Retry-After", 2 ** attempt))))
                except ValueError: delay = 2 ** attempt
                await asyncio.sleep(delay)
                continue
            if response.status_code in (401, 403):
                raise ProviderError("Credentials expired or provider permissions are missing")
            if response.status_code == 204: return {}
            if response.status_code >= 300: raise ProviderError("Provider rejected the request")
            body = response.json()
            if not isinstance(body, dict): raise ProviderError("Unexpected provider response")
            if body.get("error"):
                error = body["error"]
                code = error.get("code") if isinstance(error, dict) else error
                if code in ("QUERY_LIMIT_EXCEEDED", "OPERATION_TIME_LIMIT", 4, 17, 32, 613) and attempt < 2:
                    await asyncio.sleep(2 ** attempt)
                    continue
                raise ProviderError("Provider reported an API error")
            return body
        except (httpx.TimeoutException, httpx.NetworkError):
            if attempt == 2: raise ProviderError("Provider connection timed out or is unavailable") from None
            await asyncio.sleep(2 ** attempt)
        except (ValueError, httpx.RemoteProtocolError):
            raise ProviderError("Unexpected provider response") from None


def record(kind, identity, data):
    identity = str(identity or "")
    if not identity or len(identity) > 180: raise ProviderError("Provider record has no valid stable ID")
    return {"kind": kind, "external_id": identity, "data": data}


def crm_record(provider, kind, row):
    if provider == "bitrix":
        fields = {k: row.get(k) for k in ("TITLE", "NAME", "LAST_NAME", "STATUS_ID", "STAGE_ID", "STAGE_SEMANTIC_ID", "OPPORTUNITY", "CURRENCY_ID", "ASSIGNED_BY_ID", "DATE_CREATE", "DATE_MODIFY")}
        return record(kind, row.get("ID"), fields)
    fields = {k: row.get(k) for k in ("name", "price", "status_id", "pipeline_id", "responsible_user_id", "created_at", "updated_at", "closed_at")}
    return record(kind, row.get("id"), fields)


async def bitrix_pages(client, c, method, kind, start, end):
    offset = 0
    for _ in range(MAX_PAGES):
        payload = {"start": offset, "order": {"ID": "ASC"}}
        if kind != "employee":
            payload["filter"] = {">=DATE_CREATE": start.isoformat(), "<DATE_CREATE": (end + timedelta(days=1)).isoformat()}
        body = await request_json(client, "POST", c["webhook_url"] + "/" + method + ".json", json=payload)
        rows = body.get("result")
        if not isinstance(rows, list): raise ProviderError("Unexpected Bitrix list response")
        for row in rows: yield crm_record("bitrix", kind, row)
        next_offset = body.get("next")
        if next_offset is None: return
        if not isinstance(next_offset, int) or next_offset <= offset:
            raise ProviderError("Provider pagination did not advance")
        offset = next_offset
    raise ProviderError("Sync page limit reached; choose a shorter period")


async def fetch_records(provider, c, start, end):
    records = []
    async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
        if provider == "bitrix":
            for method, kind in (("crm.lead.list", "lead"), ("crm.deal.list", "deal"), ("user.get", "employee")):
                async for item in bitrix_pages(client, c, method, kind, start, end):
                    records.append(item)
                    if len(records) > MAX_RECORDS: raise ProviderError("Sync record limit reached")
        elif provider == "amocrm":
            for endpoint, kind in (("leads", "deal"), ("users", "employee")):
                for page in range(1, MAX_PAGES + 1):
                    params = {"limit": 250, "page": page}
                    if kind == "deal":
                        params.update({"filter[created_at][from]": int(datetime.combine(start, time.min, timezone.utc).timestamp()),
                                       "filter[created_at][to]": int(datetime.combine(end, time.max, timezone.utc).timestamp())})
                    body = await request_json(client, "GET", c["account_url"] + "/api/v4/" + endpoint,
                                              params=params, headers={"Authorization": "Bearer " + c["access_token"]})
                    rows = body.get("_embedded", {}).get(endpoint, [])
                    if not isinstance(rows, list): raise ProviderError("Unexpected amoCRM list response")
                    records.extend(crm_record(provider, kind, row) for row in rows)
                    if len(records) > MAX_RECORDS: raise ProviderError("Sync record limit reached")
                    if not body.get("_links", {}).get("next"): break
                else: raise ProviderError("Sync page limit reached; choose a shorter period")
        elif provider == "meta":
            url = f"https://graph.facebook.com/{settings.META_GRAPH_VERSION}/{c['ad_account_id']}/insights"
            params = {"level": "campaign", "time_increment": 1, "limit": 100,
                      "fields": "campaign_id,campaign_name,spend,impressions,clicks,actions,date_start,account_currency",
                      "time_range": json.dumps({"since": start.isoformat(), "until": end.isoformat()})}
            seen = set()
            for _ in range(MAX_PAGES):
                body = await request_json(client, "GET", url, params=params, headers={"Authorization": "Bearer " + c["access_token"]})
                rows = body.get("data")
                if not isinstance(rows, list): raise ProviderError("Unexpected Meta insights response")
                for row in rows:
                    identity = f"{c['ad_account_id']}:{row.get('campaign_id')}:{row.get('date_start')}"
                    records.append(record("campaign", identity, row))
                if len(records) > MAX_RECORDS: raise ProviderError("Sync record limit reached")
                paging = body.get("paging", {})
                if not paging.get("next"): break
                cursor = paging.get("cursors", {}).get("after")
                if not cursor or cursor in seen: raise ProviderError("Provider pagination did not advance")
                seen.add(cursor)
                params["after"] = cursor
            else: raise ProviderError("Sync page limit reached; choose a shorter period")
        elif provider == "onlinepbx":
            auth = await request_json(client, "POST", f"https://api2.onlinepbx.ru/{c['domain']}/auth.json", data={"auth_key": c["auth_key"], "new": "true"})
            if str(auth.get("status")).lower() not in {"1", "true"}: raise ProviderError("OnlinePBX authentication failed")
            keys = auth.get("data", {})
            if not keys.get("key_id") or not keys.get("key"): raise ProviderError("Invalid OnlinePBX authentication response")
            # Bounded day windows; reject known truncation instead of claiming complete sync.
            day = start
            while day <= end:
                body = await request_json(client, "POST", f"https://api2.onlinepbx.ru/{c['domain']}/mongo_history/search.json",
                    headers={"x-pbx-authentication": f"{keys['key_id']}:{keys['key']}"},
                    json={"start_stamp_from": int(datetime.combine(day, time.min, timezone.utc).timestamp()),
                          "start_stamp_to": int(datetime.combine(day, time.max, timezone.utc).timestamp()), "direction": ["in", "out"]})
                if str(body.get("status")).lower() not in {"1", "true"}: raise ProviderError("OnlinePBX call history failed")
                rows = body.get("data", [])
                if isinstance(rows, dict): rows = rows.get("calls", rows.get("items"))
                if not isinstance(rows, list) or body.get("next") or len(rows) >= 10000:
                    raise ProviderError("OnlinePBX history is truncated or unsupported; account validation required")
                for row in rows:
                    records.append(record("call", row.get("uuid"), {k: row.get(k) for k in ("uuid", "start_stamp", "duration", "billsec", "direction", "hangup_cause", "user_talk_time", "extension")}))
                if len(records) > MAX_RECORDS: raise ProviderError("Sync record limit reached")
                day += timedelta(days=1)
        else: raise ProviderError("This provider does not support data synchronization")
    if provider in {"bitrix", "amocrm", "onlinepbx"}:
        # Account scope survives token rotation and keeps another account's same ID distinct.
        account = urlsplit(c["webhook_url"]).hostname if provider == "bitrix" else urlsplit(c["account_url"]).hostname if provider == "amocrm" else c["domain"]
        scope = hashlib.sha256(account.encode()).hexdigest()[:16]
        for item in records:
            item["external_id"] = f"{scope}:{item['external_id']}"
            if len(item["external_id"]) > 180: raise ProviderError("Provider record ID exceeds supported length")
    return records


async def test_connection(provider, c):
    async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
        if provider == "bitrix":
            body = await request_json(client, "POST", c["webhook_url"] + "/crm.lead.list.json", json={"start": 0, "select": ["ID"]})
            if not isinstance(body.get("result"), list): raise ProviderError("Unexpected Bitrix response")
        elif provider == "meta":
            body = await request_json(client, "GET", f"https://graph.facebook.com/{settings.META_GRAPH_VERSION}/{c['ad_account_id']}", params={"fields": "id,name,currency"}, headers={"Authorization": "Bearer " + c["access_token"]})
            if not body.get("id"): raise ProviderError("Unexpected Meta account response")
        elif provider == "amocrm":
            body = await request_json(client, "GET", c["account_url"] + "/api/v4/account", headers={"Authorization": "Bearer " + c["access_token"]})
            if not body.get("id"): raise ProviderError("Unexpected amoCRM account response")
        elif provider == "onlinepbx":
            body = await request_json(client, "POST", f"https://api2.onlinepbx.ru/{c['domain']}/auth.json", data={"auth_key": c["auth_key"], "new": "true"})
            if str(body.get("status")).lower() not in {"1", "true"}: raise ProviderError("OnlinePBX authentication failed")
        elif provider == "openai":
            body = await request_json(client, "GET", "https://api.openai.com/v1/models/" + c["model"], headers={"Authorization": "Bearer " + c["api_key"]})
            if not body.get("id"): raise ProviderError("AI model is unavailable")
