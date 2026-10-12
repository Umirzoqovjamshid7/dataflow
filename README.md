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

To'liq o'n fazali ish hali tugamagan. Meta, CRM, Telegram delivery, sales attribution, AI va background worker qismlari tugallanmagan. Server konfiguratsiyasi mavjudligi butun mahsulot production-ready ekanligini anglatmaydi.

## Hujjatlar

- [Server deployment](DEPLOYMENT.md)
- [Amaliy maslahatlar](maslahat.md)
