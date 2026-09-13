# Server deployment

Deployment faqat Linux server, Docker Compose, haqiqiy domen va HTTPS uchun sozlangan. Loyihaning tugallanmagan funksiyalari `REMAINING_ISSUES.md`da keltirilgan.

## 1. Server va environment

Docker Engine, Compose va host Nginx o'rnating. Domen DNS yozuvini server IP manziliga yo'naltiring. Firewall orqali HTTPS uchun 443, HTTP redirect va sertifikat tekshiruvi uchun 80 portlarini oching.

Repositoryni serverga yuklang; `.venv`, `node_modules`, `dist`, test bazalari va kompyuterdagi `.env`ni yuklamang.

```bash
cp .env.example .env
openssl rand -hex 32
openssl rand -hex 48
```

Birinchi tasodifiy qiymatni database paroli sifatida `POSTGRES_PASSWORD` va `DATABASE_URL` ichiga, ikkinchisini `JWT_SECRET`ga kiriting. `DATABASE_URL` hostname'i Compose ichida `db` bo'ladi. Hex formatdan boshqa parol ishlatilsa, DSN ichida URL-encode qiling. `CORS_ORIGINS=https://SIZNING-DOMENINGIZ` qilib o'zgartiring; oxiriga slash qo'ymang. `.env`ga `chmod 600 .env` qo'llang. Compose backendni production rejimida ishga tushiradi.

## 2. Build, migratsiya va administrator

```bash
docker compose build
docker compose up -d db
docker compose run --rm backend alembic upgrade head
docker compose run --rm backend python -m app.cli admin@SIZNING-DOMENINGIZ
docker compose up -d backend frontend
```

Admin paroli yashirin prompt orqali kiritiladi. Standart account yoki ochiq bootstrap yo'q. Mavjud database uchun quyidagi upgrade bo'limini avval o'qing.

## 3. Domen va HTTPS

Domen uchun haqiqiy TLS sertifikat oling va avtomatik yangilanishini sozlang. `deploy/nginx.conf` ichidagi `leadflow.example.com` va sertifikat yo'llarini o'zingiznikiga almashtiring. Konfiguratsiyani host Nginx server konfiguratsiyalari ichiga o'rnating, so'ng:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Host Nginx 443 portida HTTPSni qabul qiladi va serverning ichki `127.0.0.1:8081` portiga uzatadi. Bu development server emas; frontendning Nginx konteyneriga yopiq ingress portidir. Backend/database portlarini internetga ochmang. Refresh cookie productionda Secure va HttpOnly bo'ladi.

Frontend API manzili `/api-proxy`; alohida frontend API domenini kiritish shart emas.

```bash
docker compose ps
curl --fail https://SIZNING-DOMENINGIZ/api-proxy/health/ready
```

Readiness database ulanishi va Alembic revisionni tekshiradi. Konteynerlar `unless-stopped` restart policy bilan ishlaydi. Ishonchli proxy IP sozlanmaguncha limiter bitta proxy ortidagi so'rovlarni umumiy IP sifatida hisoblaydi.

## Mavjud database upgrade

Avval tekshirilgan backup oling. Alembic versiyasi yo'q eski bazani `0001` migration bilan schema darajasida solishtiring. Faqat to'liq mos bo'lsa `alembic stamp 0001`, keyin `alembic upgrade head` bajaring. Noma'lum bazani stamp qilmang va PostgreSQL volumeni o'chirmang.

`0002` noto'g'ri tenant/role qiymatlarida xato bilan to'xtaydi. Eski naive timestamp qiymatlari UTC deb qabul qilinadi, Float pul qiymatlari ikki kasrli Numericga o'tadi. Real ma'lumotlarda vaqt va pul natijalarini solishtiring.

## Backup va rollback

Har kuni PostgreSQL `pg_dump -Fc` backup oling, shifrlangan holda boshqa storagega saqlang. Parolni CLI argumentga yozmang; himoyalangan credential fayli yoki secret injection ishlating. `pg_restore`ni alohida databasega sinab, tenant yozuvlari va balanslarni tekshiring. Release oldidan image versiyasi va mos backupni saqlang. `0002` forward-only; rollback tekshirilgan backup yoki PITR rejasini talab qiladi.

## Tekshiruv chegarasi

Compose sintaksisi va frontend build tekshiriladi; haqiqiy serverdagi Nginx/TLS, konteyner startup va PostgreSQL migratsiyasi hali tekshirilmagan. Redis/worker servislar hali yozilmagan. To'liq release to'siqlari `REMAINING_ISSUES.md`da.
