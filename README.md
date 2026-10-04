# GearVault

GearVault is an equipment rental management application for browsing inventory, checking availability across dynamic time windows, reserving equipment with soft holds, managing counter handovers/returns with condition logging and damage assessment, and exporting manager analytics.

## Runtime Requirements

- **Python**: `3.13` (Pinned in backend Dockerfile and development setup)
- **Node.js**: `20` (Pinned in `.nvmrc` and frontend development setup)

---

## Architecture Overview

- **Frontend**: React + Vite (SPA) with Tailwind CSS, Chart.js, and Lucide icons.
- **Backend**: Flask 3.1, SQLAlchemy 2.0, Alembic (Flask-Migrate), Flask-JWT-Extended, Flask-Limiter, Marshmallow, and Gunicorn WSGI.
- **Database**: PostgreSQL 16 (single source of truth with UUID users table and strict RBAC).
- **Object Storage**: S3-compatible storage (MinIO locally / AWS S3 + CloudFront in production) using presigned upload and download flows.
- **Zero Third-Party Auth Lock-In**: Standalone Flask auth and PostgreSQL database with no Supabase dependency.

---

## Project Structure

```text
├── backend/
│   ├── app/
│   │   ├── routes/        # Auth, Catalog/Bookings, Uploads, Health
│   │   ├── services/      # Pricing engine, Damage engine, S3 storage service, Audit, Notifications
│   │   ├── cli.py         # Custom CLI commands (flask seed)
│   │   ├── config.py      # Environment configuration classes
│   │   ├── jobs.py        # Background jobs (flask jobs run)
│   │   ├── models.py      # SQLAlchemy ORM models (single source of truth)
│   │   ├── rbac.py        # JWT decorators and role enforcement
│   │   └── schemas.py     # Marshmallow request schemas
│   ├── migrations/        # Single Alembic baseline migration
│   ├── tests/             # Unit and integration test suite
│   ├── Dockerfile         # Python 3.13-slim non-root production container
│   ├── gunicorn.conf.py   # WSGI configuration with worker tuning and stdout logging
│   ├── requirements.txt   # Pinned Python dependencies
│   └── wsgi.py            # Gunicorn entrypoint
├── frontend/
│   ├── src/               # React components, pages, context, and storage adapter
│   ├── package.json       # React dependencies and build scripts
│   └── vite.config.js     # Vite configuration
├── docker-compose.yml     # Local parity stack (Postgres 16, MinIO, Backend, Seed)
├── .nvmrc                 # Node version pin (v20)
└── README.md
```

---

## Quick Start with Docker Compose

To run the complete production-parity stack locally (PostgreSQL 16, MinIO S3, and Flask backend):

```bash
docker compose up --build
```

Services exposed:
- **Flask Backend API**: `http://localhost:5000`
- **Health Check**: `http://localhost:5000/api/health`
- **MinIO Console**: `http://localhost:9001` (`minioadmin` / `minioadmin`)
- **MinIO S3 API**: `http://localhost:9000`
- **PostgreSQL**: `localhost:5432`

To run database migrations and seed canonical catalog data in one command:
```bash
docker compose run --rm migrate-seed
```

---

## Manual Local Development Setup

### 1. Backend Setup (Python 3.13)

```bash
cd backend
python -m venv venv
# Linux / macOS:
source venv/bin/activate
# Windows (PowerShell):
.\venv\Scripts\Activate.ps1

pip install -r requirements.txt
cp .env.example .env
```

Apply migrations and seed initial data:
```bash
flask db upgrade
flask seed
```

Run background maintenance jobs (soft-hold expiry and overdue escalation):
```bash
flask jobs run
```

Run tests:
```bash
python -m unittest discover tests
```

Start the backend:
```bash
# Development:
python -m flask run --port 5000
# Production WSGI (Linux/Docker):
gunicorn --config gunicorn.conf.py wsgi:app
```

### 2. Frontend Setup (Node 20)

```bash
cd frontend
nvm use 20
npm install
npm run dev
```

Build production static assets (`dist/`):
```bash
npm run build
```

---

## Health & Monitoring Probes

- `GET /api/health` — Liveness probe (returns 200 without database access)
- `GET /api/health/ready` — Readiness probe (validates PostgreSQL connectivity)
