from ipaddress import ip_address
from urllib.parse import urlsplit

import httpx

def validate_bitrix_webhook(webhook_base: str) -> str:
    parsed = urlsplit(webhook_base)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Bitrix webhook must be an HTTPS URL without credentials or query parameters")
    try:
        address = ip_address(parsed.hostname)
    except ValueError:
        address = None
    if parsed.hostname.lower() in {"localhost", "localhost.localdomain"} or (address and (address.is_private or address.is_loopback or address.is_link_local)):
        raise ValueError("Bitrix webhook cannot target a local or private address")
    return webhook_base.rstrip("/")

async def create_bitrix_lead(webhook_base: str, lead):
    if not webhook_base:
        return {"skipped": True}
    url = validate_bitrix_webhook(webhook_base) + "/crm.item.add.json"
    payload = {
        "entityTypeId": 1,
        "fields": {
            "title": f"Website lead - {lead.name}",
            "name": lead.name,
            "sourceId": "WEB",
            "fm": {
                "PHONE": [{"VALUE": lead.phone, "VALUE_TYPE": "MOBILE"}]
            }
        }
    }
    if lead.email:
        payload["fields"]["fm"]["EMAIL"] = [{"VALUE": lead.email, "VALUE_TYPE": "WORK"}]
    async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
        r = await client.post(url, json=payload)
        r.raise_for_status()
        body = r.json()
        if body.get("error"):
            raise RuntimeError("Bitrix rejected the lead")
        return body
