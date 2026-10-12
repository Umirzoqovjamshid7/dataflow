# Amaliy maslahatlar

- Eski serverdan `.env`, database, backup, volume yoki maxfiy kalitlarni joriy serverga ko'chirmang.
- Joriy manzilni o'zgartirmang: `https://kassa.192-255-242-92.sslip.io`.
- `POSTGRES_PASSWORD` va `JWT_SECRET`ni joriy serverda yangidan yarating va Git'ga qo'shmang.
- Tashqi tarmoqqa faqat `80` va `443` portlarini oching; backend va PostgreSQL portlarini ochmang.
- O'zgarishdan keyin `docker compose ps` va health-check orqali holatni tekshiring.
- Faqat joriy server ma'lumotlaridan muntazam shifrlangan backup oling.
- Meta, CRM, Telegram va background worker integratsiyalari tugallanmaguncha tizimni to'liq tayyor deb hisoblamang.
