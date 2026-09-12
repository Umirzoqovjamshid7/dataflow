import httpx

async def send_telegram(bot_token: str, chat_id: str, text: str):
    if not bot_token or not chat_id:
        return {"skipped": True}
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(url, json={"chat_id": chat_id, "text": text})
        return r.json()
