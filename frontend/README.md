# GearVault Frontend

This frontend provides the user interface for equipment catalog browsing, dynamic availability scheduling, temporary holds, booking management, staff equipment pickup/return workflows, and manager analytics.

## Included features

- Customer Authentication (`Login`, `Signup`) via Flask JWT
- Equipment catalog dashboard with searchable equipment listings, category filters, and live time-window availability
- 15-minute soft booking holds and deposit checkout simulation
- Customer booking and active rental history
- Staff operations: confirmed booking pickup handover (with condition logs and photo uploads)
- Staff return inspection: damage deduction calculation, late penalty assessment, and condition photos
- Manager analytics dashboard with revenue metrics and CSV reporting

## Environment Setup

Create a `.env` file from the sample configuration:

```bash
cp .env.example .env
```

Set the backend API endpoint:

```bash
VITE_API_URL=http://localhost:5000/api
```

For production builds, `VITE_API_URL` defaults to `/api` (same-origin reverse proxy behind CloudFront/ALB/Nginx).

## Run Locally

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```
The compiled static assets will be output to `dist/`.
