# API qisqa qo'llanmasi

Backend manzili localda `http://127.0.0.1:8000`, productionda esa frontend domenidagi `/api-proxy` orqali ishlaydi. `ENVIRONMENT=production` holatida OpenAPI docs o'chiriladi.

## Authentication

| Method | Path | Ruxsat |
|---|---|---|
| POST | `/api/auth/login` | Ochiq, rate-limited |
| POST | `/api/auth/refresh` | HttpOnly refresh cookie |
| POST | `/api/auth/logout` | Refresh cookie |
| GET | `/api/auth/me` | Bearer token |

Login:

```json
{"email":"user@example.com","password":"your-password"}
```

Access tokenni quyidagicha yuboring:

```http
Authorization: Bearer <access_token>
```

## Leads

| Method | Path | Ruxsat |
|---|---|---|
| POST | `/api/leads/public` | Ochiq, faol tenant slug kerak |
| GET | `/api/leads` | Barcha authenticated rollar, tenant-scoped |
| GET | `/api/leads/{lead_id}` | `tenant_admin`, `sales_manager` |

Public lead uchun minimal body:

```json
{"tenant_slug":"company-slug","name":"Customer","phone":"+998901234567"}
```

Retry paytida bir xil lead yaratmaslik uchun `Idempotency-Key` headeridan foydalaning. Kalit 8–128 belgidan iborat bo'lishi kerak.

## Admin va analytics

`super_admin` uchun:

- `GET /api/admin/summary`
- `GET /api/admin/tenants`
- `POST /api/admin/tenants`
- `PATCH /api/admin/tenants/{tenant_id}`
- `POST /api/admin/campaigns`

`tenant_admin` uchun kompaniya team endpointlari:

- `GET /api/admin/tenants/{tenant_id}/users`
- `POST /api/admin/tenants/{tenant_id}/users`
- `PATCH /api/admin/tenants/{tenant_id}/users/{user_id}`

Analytics:

- `GET /api/analytics/summary`
- `GET /api/analytics/campaigns`

Analytics qiymatlari hozircha legacy campaign aggregate ma'lumotlariga asoslanadi; ular verified financial reporting sifatida ishlatilmasin.

## Real integratsiyalar

- `POST /api/admin/workspace` — super admin bir martalik kompaniya va tenant admin yaratadi.
- `GET /api/integrations/bitrix/status` — maxfiy webhookni chiqarmasdan ulanish holati.
- `POST /api/integrations/bitrix/probe` — webhookni tekshirish va voronkalarni olish.
- `PUT /api/integrations/bitrix` — webhook va voronkani shifrlab saqlash.
- `POST /api/integrations/bitrix/sync` — Bitrix bitimlarini qo‘lda sinxronlash.
- `GET /api/pbx/status`, `PUT /api/pbx` — OnlinePBX ulanish holati va sozlamasi.
- `GET /api/pbx?from=YYYY-MM-DD&to=YYYY-MM-DD` — real qo‘ng‘iroqlar hisoboti.
- `GET /api/plan-fact`, `PUT /api/plan-fact` — hisobot va oylik reja.
- `GET /api/plan-fact/template`, `POST /api/plan-fact/import` — Excel namuna va loyiha rejalarini `.xlsx` orqali yuklash.
- `GET /api/integrations/databases/{postgresql|mssql}/status`, `PUT /api/integrations/databases/{postgresql|mssql}` — tashqi database ulanishini tekshirish va shifrlab saqlash.

## Health-check

- `GET /` — servis javob berayotganini tekshiradi.
- `GET /health/ready` — database ulanishi va Alembic migration holatini tekshiradi.

## Xatolar

API odatda JSON formatida `detail` maydonini qaytaradi. Asosiy statuslar: `401` authentication, `403` permission/origin, `404` resource, `409` duplicate/conflict, `422` validation, `429` rate limit.
