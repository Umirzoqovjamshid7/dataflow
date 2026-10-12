from decimal import Decimal, InvalidOperation

"""
Meta integration service placeholder.

Production flow:
1. User clicks "Connect Facebook".
2. Redirect to Meta OAuth.
3. Store encrypted access token per tenant.
4. Read ad accounts/campaigns/insights via Meta Marketing API.
5. Subscribe to Lead Ads webhooks.
6. Save normalized metrics in Campaign table.

Never collect a user's Facebook password directly.
"""

def normalize_insight(row: dict) -> dict:
    impressions = int(row.get("impressions", 0) or 0)
    clicks = int(row.get("clicks", 0) or 0)
    try:
        spend = Decimal(str(row.get("spend", 0) or 0))
    except (InvalidOperation, ValueError):
        spend = Decimal("0")
    ctr = (clicks / impressions * 100) if impressions else 0
    cpc = (spend / clicks) if clicks else 0
    return {
        "campaign_name": row.get("campaign_name"),
        "impressions": impressions,
        "clicks": clicks,
        "spend": spend.quantize(Decimal("0.01")),
        "ctr": round(ctr, 2),
        "cpc": round(cpc, 2),
    }
