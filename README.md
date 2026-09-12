# LeadFlow SaaS

FastAPI + React asosidagi multi-tenant SaaS. Ishga tushirish serverda Docker Compose, domen va HTTPS orqali bajariladi.

## Serverga joylash

1. Repository fayllarini Docker Engine va Compose o'rnatilgan Linux serverga yuklang. `.venv`, `node_modules`, `dist` va test bazalarini yuklamang.
2. `.env.example` faylidan serverda `.env` yarating. Database paroli, JWT secret va haqiqiy HTTPS domenni kiriting.
3. [DEPLOYMENT.md](DEPLOYMENT.md) bo'yicha image build, migratsiya, admin yaratish va HTTPS ingressni sozlang.

Frontend APIga o'z domenidagi `/api-proxy` orqali ulanadi. PostgreSQL va backend tashqi portlarga ochilmaydi. Frontendning server ichki porti `127.0.0.1:8080`; foydalanuvchilar faqat HTTPS domen orqali kiradi.

## Joriy holat

Audit, tenant/RBAC tekshiruvlari, Argon2 parollar, JWT/refresh sessiyalar, rate limiting, Alembic migratsiyalari va boshlang'ich admin/team boshqaruvi mavjud. Ochiq bootstrap va standart administrator paroli yo'q.

To'liq o'n fazali ish hali tugamagan. Meta, CRM, Telegram delivery, sales attribution, AI va background worker qismlari tugallanmagan. Server konfiguratsiyasi mavjudligi butun mahsulot production-ready ekanligini anglatmaydi.

## Hujjatlar

- [Audit](AUDIT.md)
- [Arxitektura](ARCHITECTURE.md)
- [Xavfsizlik](SECURITY.md)
- [Server deployment](DEPLOYMENT.md)
- [Bajarilgan ishlar](PHASES.md)
- [Qolgan ishlar](REMAINING_ISSUES.md)
