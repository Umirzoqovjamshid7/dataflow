# Local development

## Talablar

- Python 3.12+
- Node.js 22+
- PostgreSQL 16 (productionga yaqin local rejim uchun)
- Docker Desktop ixtiyoriy; Docker ishlamasa backend testlari SQLite bilan ishlaydi.

## Backend

PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt

$env:ENVIRONMENT="test"
$env:DATABASE_URL="sqlite:///D:/DataFlow/local-dev.sqlite"
$env:JWT_SECRET="local-dev-secret-change-this-123456789"
$env:CORS_ORIGINS="http://127.0.0.1:5173"

cd backend
..\.venv\Scripts\python.exe -m alembic upgrade head
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

`DATABASE_URL` yo'lini o'zingizning loyiha katalogingizga moslang. Production rejimida SQLite ishlatish taqiqlanadi.

Testlar:

```powershell
cd backend
..\.venv\Scripts\python.exe -m pytest -q
```

## Frontend

Ikkinchi terminalda:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Backend 8000 dan boshqa portda bo'lsa, `.env.local` ichida quyidagini o'zgartiring:

```env
VITE_API_PROXY_TARGET=http://127.0.0.1:8001
VITE_DEMO_MODE=false
```

Frontend: `http://127.0.0.1:5173`. Production buildni tekshirish: `npm run build`.

## Docker

Docker Desktop ishlayotgan bo'lsa, root katalogda `.env` yarating va qiymatlarni to'ldiring:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Production Compose PostgreSQL ishlatadi; local demo uchun haqiqiy production secretlarni qayta ishlatmang.
