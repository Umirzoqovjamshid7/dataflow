from ipaddress import ip_address
from urllib.parse import urlsplit

import httpx

def validate_bitrix_webhook(webhook_base: str) -> str:
    webhook_base = webhook_base.strip().rstrip("/")
    parsed = urlsplit(webhook_base)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Bitrix webhook must be an HTTPS URL without credentials or query parameters")
    try:
        address = ip_address(parsed.hostname)
    except ValueError:
        address = None
    if parsed.hostname.lower() in {"localhost", "localhost.localdomain"} or (address and (address.is_private or address.is_loopback or address.is_link_local)):
        raise ValueError("Bitrix webhook cannot target a local or private address")
    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) < 3 or parts[0] != "rest":
        raise ValueError("To‘liq Bitrix incoming webhook manzilini kiriting")
    return webhook_base

def portal_from_webhook(webhook_base: str) -> str:
    parsed = urlsplit(webhook_base)
    return f"{parsed.scheme}://{parsed.hostname}"

async def bitrix_call(webhook_base: str, method: str, payload: dict | None = None) -> dict:
    url = validate_bitrix_webhook(webhook_base) + f"/{method}.json"
    async with httpx.AsyncClient(timeout=25, follow_redirects=False) as client:
        response = await client.post(url, json=payload or {})
    response.raise_for_status()
    body = response.json()
    if body.get("error"):
        raise RuntimeError(body.get("error_description") or body["error"])
    return body

async def get_funnels(webhook_base: str) -> list[dict]:
    body = await bitrix_call(webhook_base, "crm.category.list", {"entityTypeId": 2})
    rows = body.get("result", {}).get("categories", [])
    result = [{"id": int(row.get("id", 0)), "name": row.get("name") or "Asosiy voronka"} for row in rows]
    if not any(row["id"] == 0 for row in result):
        result.insert(0, {"id": 0, "name": "Asosiy voronka"})
    return result

async def get_stages(webhook_base: str, category_id: int) -> dict[str, dict]:
    entity = "DEAL_STAGE" if category_id == 0 else f"DEAL_STAGE_{category_id}"
    body = await bitrix_call(webhook_base, "crm.status.list", {"order": {"SORT": "ASC"}, "filter": {"ENTITY_ID": entity}})
    return {str(row.get("STATUS_ID")): row for row in body.get("result", [])}

async def get_users(webhook_base: str) -> dict[str, str]:
    body = await bitrix_call(webhook_base, "user.get")
    return {str(row.get("ID")): " ".join(filter(None, [row.get("NAME"), row.get("LAST_NAME")])).strip() for row in body.get("result", [])}

async def get_deals(webhook_base: str, category_id: int, maximum: int = 5000) -> list[dict]:
    rows, start = [], 0
    while len(rows) < maximum:
        body = await bitrix_call(webhook_base, "crm.item.list", {
            "entityTypeId": 2,
            "select": ["id", "title", "categoryId", "stageId", "stageSemanticId", "opportunity", "currencyId", "assignedById", "sourceId", "createdTime", "updatedTime"],
            "filter": {"categoryId": category_id}, "order": {"id": "ASC"}, "start": start,
        })
        result = body.get("result", {})
        page = result.get("items", []) if isinstance(result, dict) else []
        rows.extend(page)
        if body.get("next") is None or not page:
            break
        start = int(body["next"])
    return rows[:maximum]

async def create_bitrix_lead(webhook_base: str, lead):
    if not webhook_base:
        return {"skipped": True}
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
    return await bitrix_call(webhook_base, "crm.item.add", payload)
