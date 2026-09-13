import httpx

async def send_telegram(bot_token: str, chat_id: str, text: str):
    if not bot_token or not chat_id:
        return {"skipped": True}
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
        response = await client.post(url, json={"chat_id": chat_id, "text": text})
        response.raise_for_status()
        body = response.json()
        if not body.get("ok"):
            raise RuntimeError("Telegram rejected the notification")
        return body
