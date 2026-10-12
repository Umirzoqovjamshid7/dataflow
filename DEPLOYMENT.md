# Joriy serverga joylash

Deployment faqat joriy Linux server va `https://kassa.192-255-242-92.sslip.io` uchun sozlangan. Eski server, uning `.env` fayli, database'i va backup ma'lumotlari ishlatilmaydi.

## 1. Server va environment

Joriy serverda Docker Engine va Compose o'rnatilgan bo'lishi kerak. Firewall orqali `80/tcp`, `443/tcp` va HTTP/3 kerak bo'lsa `443/udp` portlarini oching. HTTPS sertifikatini Compose ichidagi Caddy avtomatik boshqaradi.

Repositoryni joriy serverga yuklang. Eski serverdan `.env`, PostgreSQL volume, dump, `.venv`, `node_modules`, `dist` yoki test bazalarini ko'chirmang.

```bash
cp .env.example .env
openssl rand -hex 32
openssl rand -hex 48
```

Birinchi tasodifiy qiymatni database paroli sifatida `POSTGRES_PASSWORD` va `DATABASE_URL` ichiga, ikkinchisini `JWT_SECRET`ga kiriting. `DATABASE_URL` hostname'i Compose ichida `db` bo'ladi. `CORS_ORIGINS=https://kassa.192-255-242-92.sslip.io` bo'lib qolishi kerak; oxiriga slash qo'ymang. `.env`ga `chmod 600 .env` qo'llang.

## 2. Build, migratsiya va administrator

```bash
docker compose build
docker compose up -d db
docker compose run --rm backend alembic upgrade head
docker compose run --rm backend python -m app.cli admin@kassa.192-255-242-92.sslip.io
docker compose up -d backend frontend
```

Admin paroli yashirin prompt orqali kiritiladi. Standart account yoki ochiq bootstrap yo'q. Bu buyruqlar joriy serverda yangi database va yangi admin yaratadi.

## 3. HTTPS va tekshiruv

Caddy `deploy/Caddyfile`dagi joriy domen uchun sertifikatni avtomatik oladi. Barcha servislarni ishga tushiring:

```bash
docker compose up -d
docker compose ps
curl --fail https://kassa.192-255-242-92.sslip.io/api-proxy/health/ready
```

Caddy `80` va `443` portlarida so'rovlarni qabul qilib, frontend konteynerining ichki `80` portiga uzatadi. Frontend `/api-proxy` so'rovlarini backendga uzatadi. Backend va PostgreSQL portlarini internetga ochmang. Refresh cookie productionda Secure va HttpOnly bo'ladi.

Frontend API manzili `/api-proxy`; alohida frontend API domenini kiritish shart emas.

Readiness database ulanishi va Alembic revisionni tekshiradi. Konteynerlar `unless-stopped` restart policy bilan ishlaydi. Ishonchli proxy IP sozlanmaguncha limiter bitta proxy ortidagi so'rovlarni umumiy IP sifatida hisoblaydi.

## Ma'lumot siyosati

Eski serverdagi database yoki foydalanuvchi ma'lumotlarini import qilmang. Joriy server alohida yangi PostgreSQL volume, yangi parollar va yangi admin bilan ishlaydi. `.env` yoki secretlarni serverlar orasida ko'chirmang.

Alembic faqat joriy server bazasining schema versiyasini boshqaradi. Noma'lum database'ga `alembic stamp` ishlatmang.

## Backup va rollback

Har kuni faqat joriy serverdagi PostgreSQL bazasidan `pg_dump -Fc` backup oling va shifrlangan storage'da saqlang. Parolni CLI argumentga yozmang. Restore sinovini alohida vaqtinchalik database'da bajaring; eski server backupini joriy production bazasiga tiklamang.

## Tekshiruv chegarasi

Joriy serverda Caddy/TLS, konteynerlar va PostgreSQL migratsiyasini alohida tekshirish kerak. Redis/worker servislar hali yozilmagan.
