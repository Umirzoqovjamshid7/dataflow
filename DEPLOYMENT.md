# Joriy serverga joylash

Deployment faqat joriy Linux server va `https://kassa.192-255-242-92.sslip.io` uchun sozlangan. Eski server, uning `.env` fayli, database'i va backup ma'lumotlari ishlatilmaydi.

Mavjud production uchun quyidagi yangi o'rnatish bosqichlarini takrorlamang. V5 yangilanish tartibi hujjat oxirida. Production deployment faqat egasi tasdiqlagandan so'ng bajariladi.

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

Joriy serverda Caddy/TLS, konteynerlar va PostgreSQL migratsiyasini alohida tekshirish kerak. V5 PostgreSQL navbatli import worker'ga ega; Redis talab qilinmaydi.

## Mavjud database uchun V5 yangilanishi — tasdiqdan keyin

Mavjud `.env`, database DSN, JWT secret, domen va Docker volume'larni saqlang. Bazani qayta yaratish, `down -v`, MFactor scriptlarini ishga tushirish, eski serverdan import yoki `alembic stamp` ishlatish mumkin emas.

Avval joriy database backupini shifrlab oling va staging'da restore/upgrade sinovini bajaring. `0005` faqat nullable campaign currency va yangi tenant-scoped jadvallarni qo'shadi; mavjud yozuvlarni ko'chirmaydi yoki o'chirmaydi. Avtomatik downgrade biznes ma'lumotlarini yo'qotmaslik uchun bloklangan.

Joriy serverda alohida Fernet key yarating:

```bash
docker compose run --rm --no-deps backend python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
```

Kalitni `INTEGRATION_ENCRYPTION_KEY` sifatida faqat server `.env`iga yozing, `chmod 600` bilan himoyalang va shifrlangan backupda saqlang. Kalitni shunchaki almashtirish mavjud credentiallarni ochib bo'lmaydigan qiladi. JWT secret bu maqsadda ishlatilmaydi. Backend va worker bir xil key va `META_GRAPH_VERSION` olishi kerak.

Egasi tasdiqlagandan keyingi operator buyruqlari:

```bash
docker compose build backend worker frontend
docker compose run --rm --no-deps backend alembic upgrade head
docker compose up -d backend worker frontend caddy
docker compose ps
curl --fail https://kassa.192-255-242-92.sslip.io/api-proxy/health/ready
```

Har bir kompaniya administratori o'z sozlamalaridan provider token/webhookini saqlaydi, real ulanish testini bajaradi va ko'pi bilan 31 kunlik syncni navbatga qo'shadi. API `202 queued` qaytarishi sync tugaganini bildirmaydi. Worker yakunida holat `synced` yoki `error` bo'ladi; sozlamalar holatni avtomatik yangilaydi. Worker uzilgan running joblar 10 daqiqadan keyin xato deb qayd etiladi va mijoz qayta sync boshlashi mumkin. Token muddati tugasa mijoz yangi tokenni sozlamadan kiritadi.

Productionda ishga tushirishdan oldin PostgreSQL concurrency, provider pagination/permissions, OnlinePBX account response format/limit, currency va AI model tool calling'ni stagingda tekshiring. OAuth refresh, avtomatik davriy sync va Telegram delivery bu migrationda qo'shilmagan.
