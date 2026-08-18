# GearVault Frontend (Increment 1)

Quick start for the local frontend (Vite + React) and Supabase-based auth.

Prerequisites:
- Node.js 18+ and npm/yarn

Setup:
1. Copy `env.example` to `.env` (or set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment).

   Example (UNIX/macOS):
   ```bash
   cp env.example .env
   # then edit .env to add your Supabase project URL and anon key
   ```

2. Install and run:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

Security notes:
- Never commit `.env`, service_role keys, or other secrets. Use CI/CD secret storage for deployment.
- The anonymous Supabase key (`VITE_SUPABASE_ANON_KEY`) is intended for client use; do not expose your `service_role` key.
