# DataFlow V5 migration audit — 2026-10-12

Branch: `migration/dataflow-v5-mfactor`. Production deployment requires owner approval.

## Audit and migration order

DataFlow uses FastAPI, SQLAlchemy, Alembic, PostgreSQL, React 19, Vite and Recharts. Authentication is JWT plus revocable refresh sessions; roles and active-company checks already exist. Analytics routes exist inside `api/admin.py`. Meta is a normalizer placeholder; Bitrix only supports outbound lead creation. Settings currently do not persist provider connections. AI Advisor is frontend heuristics, not an AI agent.

MFactor is an untracked reference directory with standalone HTML dashboards, a Python HTTP server, PostgreSQL import scripts, pandas/requests, and a Telegram bot. Reviewed dashboard layouts, API dispatch, connector pagination/retries, SQL writers and prune paths. MFactor assumes one company's databases, global environment credentials, company-specific stages and employee exclusions. Its Bitrix/Meta importers can prune records. None of those scripts may run against DataFlow or production as part of this migration.

| Conflict | Decision |
| --- | --- |
| Routes | Keep `/api/*`; do not mount `/mfactor_api` or MFactor HTTP server |
| CSS/globals | Adapt navy/gold design within React; never import reference global scripts/styles |
| Dependencies | Preserve FastAPI/React; no pandas, Telegram bot or second web framework |
| Tables | Add tenant-scoped V5 tables; preserve existing rows and original integration configs |
| Credentials/environment | Per-company encrypted credentials; separate encryption key; no copied `.env` |
| Authentication | Existing JWT/RBAC only; no MFactor upload/admin tokens |
| Ports/Docker | Keep existing Caddy domain, internal 8000/PostgreSQL and current volumes |
| Data | No company data copying, seed data, pruning, or production access |

Sequence: (1) audit/branch; (2) adapt dashboard presentation and backend KPI contract; (3) tenant-scoped connector registry and read-only analytics services; (4) additive Alembic migration; (5) provider adapters with bounded pagination/retry and transactional upserts; (6) bounded AI tool loop over allowlisted aggregates; (7) migration preservation, tenant/RBAC, failure-path tests and frontend build.

## External prerequisites

Live verification requires explicitly selected company accounts, scoped API credentials, server encryption key, AI server key/model and an approved staging environment. No live credentials or production access were provided. Unit tests use synthetic fixtures only; no fake product data is seeded. Connection success must be based on a real API response; synchronization success is separate. Provider permissions, OAuth expiry/refresh, reporting currency, attribution and OnlinePBX account limits must be verified on staging before release.

## Amalga oshirilgan funksiyalar

- SaaS mijozining kompaniya administratori Bitrix24, Meta Ads, amoCRM, OnlinePBX va OpenAI'ni o'z sozlamalaridan ulaydi. Boshqa kompaniya ID'sini yuborish rad etiladi. Super admin uchun tenant ulanishlarini global ravishda sozlash ochilmagan.
- Credentiallar alohida server Fernet key'i bilan shifrlanadi; ciphertext ichida tenant/provider scope tekshiriladi. GET/status javoblari secret yoki ciphertext qaytarmaydi. Kalit yo'q bo'lsa yozish yopiladi. Provider URL'lari rasmiy domenlarga cheklangan, redirect va pagination'dagi tashqi URL'larga o'tilmaydi. HTTP client URL loglari webhook secretlarini oshkor qilmasligi uchun o'chirilgan.
- Haqiqiy API connection test, bounded pagination, outbound throttling, 429/5xx/transport retry va xavfsiz xato matnlari bor. Sync so'rovi PostgreSQL navbatiga yoziladi; alohida worker uni bajaradi. `queued` muvaffaqiyatli import degani emas. 180 sekundlik fetch chegarasi va uzilgan joblar uchun 10 daqiqalik recovery bor.
- Importlar tenant/provider/account/kind/external ID bilan ajratiladi. Overlapping page yozuvlari deduplicate qilinadi; qayta sync update qiladi. Biror fetch/import xatosida qisman yozuvlar commit qilinmaydi. Prune/delete yoki MFactor bazasidan copy yo'q.
- KPI qiymatlari, o'tgan oy taqqoslashlari, foiz/direction/tone, 7 kunlik trend, platformalar va top kampaniyalar backendda hisoblanadi. Nol bazaga bo'lish foizi `null`; frontend uni `—` ko'rsatadi. Turli valyutalarning pul summalari jamlanmaydi. Legacy currency noma'lumligicha qoladi. Kampaniya filtri uning barcha kunlik metric yozuvlarini oladi.
- MFactor navy/gold palitrasi React sahifalariga moslashtirildi. CRM/sotuv jamlanmasi, xodimlarning user ID bo'yicha yuklamasi, call statistics va oylik plan/fakt sahifalari qo'shildi. Frontend API pagination'i limitga yetganda ma'lumotlarni yashirin kesmaydi; filtrni toraytirish xatosini ko'rsatadi.
- AI chat kompaniyaning shifrlangan OpenAI kaliti/modeli bilan backend orqali ishlaydi. Tool'lar: `marketing_summary`, `campaign_performance`, `business_summary`, `plan_fact`. Tool argumentlarida tenant/SQL/mutation yo'q; budget chegaralangan. Telefon/email/credentiallar tools orqali yuborilmaydi. CRM va xodimlar matnlari AI kontekstiga qo'shilmaydi.
- `0005` additive migration, readiness revision, Docker worker va secretlarni image'dan chiqaruvchi ignore qoidalari qo'shildi. Eski tenant/campaign/integration yozuvlarini saqlash testi bor. Destructive downgrade avtomatik bajarilmaydi.

## O'zgartirilgan fayllar

Backend API: `backend/app/api/admin.py`, `analytics.py`, `integrations.py`, `business.py`, `ai.py`, `leads.py`; `backend/app/main.py`.

Backend servislar: `backend/app/services/providers.py`, `credentials.py`, `business.py`, `ai.py`, `meta.py`; `backend/app/worker.py`, `backend/app/models/models.py`, `backend/app/core/config.py`.

Database/testlar: `backend/migrations/versions/0005_v5_connections.py`, `backend/tests/test_v5.py`, `backend/tests/test_migrations.py`.

Frontend: `frontend/src/pages/Settings.jsx`, `AIAdvisor.jsx`, `Business.jsx`, `Dashboard.jsx`; `frontend/src/components/Kpi.jsx`, `frontend/src/main.jsx`, `frontend/src/styles.css`, `frontend/src/analytics.js`, `frontend/src/analytics.test.js`, `frontend/src/pagination.js`.

Konfiguratsiya/hujjatlar: `.env.example`, `backend/.env.example`, `backend/requirements.txt`, `backend/.dockerignore`, `frontend/.dockerignore`, `frontend/nginx.conf`, `frontend/package-lock.json`, `docker-compose.yml`, `README.md`, `DEPLOYMENT.md`, `MIGRATION_V5.md`.

`MFactor/` foydalanuvchining avvaldan mavjud alohida Git repository'si. V5 bosqichida GitHub uchun dashboard HTML/CSS/JS fayllari `references/mfactor/dashboard/`ga nusxalangan edi. Keyingi frontend dizayn integratsiyasida foydalanilmaydigan, asl manba bilan byte-identical bo'lgan bu 10 nusxa olib tashlandi. Asl local `MFactor/` saqlandi va DataFlow Git ignore'iga qo'shildi. Joriy holat va frontend tekshiruvlari: [UI_INTEGRATION_REPORT.md](UI_INTEGRATION_REPORT.md). MFactor production'i, database va production API hisoblariga tegilmadi; deploy bajarilmadi.

## Testlar va tekshiruv chegaralari

- Backend: **45/45 test passed**, bitta Starlette/AnyIO deprecation warning. Testlar tenant/RBAC, encryption, provider pagination/retry, durable queue, repeated import, rollback, stale job recovery, currency, campaign daily filtering, AI tools va API method/path collision'larini qamrab oladi.
- Frontend: **5/5 test passed**, `npm run build` muvaffaqiyatli. Responsive CSS moslashtirildi; autentifikatsiyadan keyingi brauzer visual/E2E sinovi bajarilmadi.
- `pip check`: **No broken requirements found**.
- `npm audit`: **0 vulnerabilities**. Lockfile'dagi `source-map-js` 1.2.1 → 1.2.2 security patch qo'llandi.
- `docker compose config --quiet`: **passed**, tekshiruv uchun vaqtinchalik placeholder environment ishlatildi. Docker client config'iga sandbox o'qish ogohlantirishi bor; Docker daemon ishlamayotgani sababli image build/container health sinovi bajarilmadi.
- Database upgrade testlari alohida vaqtinchalik **SQLite** bazalarida o'tkazildi. Production/PostgreSQL migration va multi-worker locking staging'da tekshirilishi shart. Existing database yoki production volume'ga tegilmadi.

## Qolgan ishlar — sotuvga tayyorlik tasdiqlanmagan

1. Haqiqiy mijoz hisoblari bilan stagingda barcha provider permission, pagination, response schema, expired token va rate-limit holatlarini tekshirish. OnlinePBX'da kesilgan/nomuvofiq response xato sifatida qaytariladi; account pagination limiti alohida tasdiqlanishi kerak.
2. amoCRM/Meta uchun avtomatik OAuth consent va token refresh qo'shilmagan. Hozir administrator mavjud access tokenni sozlamadan kiritadi va muddati tugasa yangilaydi. AI Chat Completions tool calling'ni qo'llaydigan OpenAI model bilan cheklangan; Gemini qo'shilmagan.
3. Davriy avtomatik sync, incremental updated-at watermark, katta tarixiy import va worker monitoring/alerting keyingi ishlar. Hozir sync mijoz tomonidan navbatga qo'yiladi, ko'pi bilan 31 kunlik davr bilan.
4. CRM/reklama/call/xodim cross-provider attribution, stage mapping, employee identity reconciliation va currency conversion qo'shilmagan. CRM/business sahifasi mavjud importlarning jamlanmasini beradi; marketing sotuv KPI'si eski campaign sales qiymatlaridan keladi. Ular tasdiqlangan attribution deb ko'rsatilmaydi. amoCRM sotuv valyutasi mavjud payload'da aniqlanmasa `unknown` bo'ladi.
5. Telegram delivery/avtomatik hisobotlar, PostgreSQL concurrency/load test, autentifikatsiyadan keyingi visual/E2E tekshiruv va server TLS/health sinovlari qolgan. Shundan keyin egasidan production deployment tasdig'i olinadi.

## Tekshirilgan API manbalari

- [Bitrix lead list va pagination](https://apidocs.bitrix24.com/api-reference/crm/leads/crm-lead-list.html)
- [amoCRM leads API](https://www.amocrm.ru/developers/content/crm_platform/leads-api)
- [OnlinePBX HTTP API](https://api.onlinepbx.ru/)
- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)
- Meta adapteri MFactor insights contractidan moslashtirildi; rasmiy Insights sahifasini ochish muvaffaqiyatsiz bo'ldi. Configurable Graph version va haqiqiy account contracti stagingda tekshirilishi kerak.
