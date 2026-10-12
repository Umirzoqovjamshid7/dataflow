# LeadFlow SaaS

FastAPI + React asosidagi multi-tenant SaaS. Loyiha faqat joriy serverda Docker Compose, Caddy va HTTPS orqali ishlaydi.

Joriy manzil: `https://kassa.192-255-242-92.sslip.io`.

## Serverga joylash

1. Repository fayllarini joriy Linux serverga yuklang. `.venv`, `node_modules`, `dist`, test bazalari va boshqa serverdagi `.env` yoki database fayllarini ko'chirmang.
2. `.env.example` faylidan aynan joriy serverda yangi `.env` yarating. Yangi database paroli va JWT secret kiriting.
3. [DEPLOYMENT.md](DEPLOYMENT.md) bo'yicha image build, migratsiya, admin yaratish va Caddy orqali HTTPS'ni ishga tushiring.

Frontend APIga o'z domenidagi `/api-proxy` orqali ulanadi. PostgreSQL va backend tashqi portlarga ochilmaydi. Foydalanuvchilar faqat joriy HTTPS domen orqali kiradi.

## Joriy holat

Audit, tenant/RBAC tekshiruvlari, Argon2 parollar, JWT/refresh sessiyalar, rate limiting, Alembic migratsiyalari va boshlang'ich admin/team boshqaruvi mavjud. Ochiq bootstrap va standart administrator paroli yo'q.

V5 migration branchda kompaniya sozlamalaridan Bitrix24, Meta Ads, amoCRM, OnlinePBX va OpenAI ulanishlari, shifrlangan credentiallar, ulanish testi, navbatdagi sync worker, markazlashgan KPI/trend, CRM/business jamlanmalari va faqat o'qiydigan AI tools qo'shildi. Live accountlar va production PostgreSQL/Docker hali tekshirilmagan. OAuth avtomatik refresh, Telegram delivery va CRM/reklama atributsiyasi tugallanmagan; loyiha hali sotuvga tayyor deb tasdiqlanmagan.

## Hujjatlar

- [Server deployment](DEPLOYMENT.md)
- [Amaliy maslahatlar](maslahat.md)
- [V5 audit, migration va test hisoboti](MIGRATION_V5.md)
