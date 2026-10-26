import base64
import hashlib
import hmac
import re
from datetime import date, datetime, time, timezone
from email.utils import format_datetime
from urllib.parse import urlencode

import httpx

DOMAIN_RE = re.compile(r"^[a-z0-9](?:[a-z0-9.-]{1,251}[a-z0-9])?$")


def validate_domain(domain: str) -> str:
    value = domain.strip().lower().removeprefix("https://").removeprefix("http://").strip("/")
    if not DOMAIN_RE.fullmatch(value) or "." not in value:
        raise ValueError("OnlinePBX domeni noto‘g‘ri")
    return value


def base_url(domain: str) -> str:
    return f"https://api.onlinepbx.ru/{validate_domain(domain)}/"


async def authenticate(domain: str, auth_key: str) -> tuple[str, str]:
    async with httpx.AsyncClient(timeout=25, follow_redirects=False) as client:
        response = await client.post(base_url(domain) + "auth.json", data={"auth_key": auth_key})
    response.raise_for_status()
    body = response.json()
    if int(body.get("status", 0)) != 1:
        raise RuntimeError(body.get("comment") or body.get("error") or "OnlinePBX authorization failed")
    data = body.get("data") or {}
    if not data.get("key") or not data.get("key_id"):
        raise RuntimeError("OnlinePBX authorization response is incomplete")
    return str(data["key_id"]), str(data["key"])


async def signed_request(domain: str, auth_key: str, path: str, payload: dict) -> dict:
    key_id, secret = await authenticate(domain, auth_key)
    url = base_url(domain) + path
    encoded = urlencode(payload)
    content_type = "application/x-www-form-urlencoded"
    content_md5 = hashlib.md5(encoded.encode()).hexdigest()
    stamp = format_datetime(datetime.now(timezone.utc), usegmt=True)
    sign_data = f"POST\n{content_md5}\n{content_type}\n{stamp}\n{url}\n"
    signature_hex = hmac.new(secret.encode(), sign_data.encode(), hashlib.sha1).hexdigest()
    signature = base64.b64encode(signature_hex.encode()).decode()
    headers = {"Date": stamp, "Accept": "application/json", "Content-Type": content_type, "Content-MD5": content_md5, "x-pbx-authentication": f"{key_id}:{signature}"}
    async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
        response = await client.post(url, content=encoded, headers=headers)
    response.raise_for_status()
    body = response.json()
    if int(body.get("status", 0)) != 1:
        raise RuntimeError(body.get("comment") or body.get("error") or "OnlinePBX request failed")
    return body


async def call_history(domain: str, auth_key: str, start: date, end: date, direction: str = "all") -> list[dict]:
    payload = {
        "date_from": format_datetime(datetime.combine(start, time.min, tzinfo=timezone.utc), usegmt=True),
        "date_to": format_datetime(datetime.combine(end, time.max, tzinfo=timezone.utc), usegmt=True),
    }
    if direction in {"inbound", "outbound"}:
        payload["type"] = direction
    body = await signed_request(domain, auth_key, "history/search.json", payload)
    data = body.get("data") or []
    if isinstance(data, dict):
        data = data.get("items") or data.get("history") or data.get("records") or []
    return data if isinstance(data, list) else []
