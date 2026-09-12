import httpx

async def create_bitrix_lead(webhook_base: str, lead):
    if not webhook_base:
        return {"skipped": True}
    url = webhook_base.rstrip("/") + "/crm.item.add.json"
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
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(url, json=payload)
        r.raise_for_status()
        return r.json()
