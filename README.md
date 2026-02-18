# Dashio

Customer analytics platform in a monorepo:
- `web`: Next.js 15 + React Query + Tailwind
- `api`: Express + TypeScript + MongoDB + JWT cookie auth
- `packages/shared`: shared Zod schemas and types

## What You Get

- Authentication with HTTP-only cookies and refresh token rotation
- Customer management with search, filters, notes, CSV export
- Saved customer views (user scoped)
- Segment builder (status, segment value, date range, inactivity)
- Bulk customer actions (status, segment, delete)
- KPI and trend analytics
- Cohort retention analytics
- Alert rules and alert events (churn spike, activity drop)
- Admin user management with granular permissions
- Advanced audit logs (before/after snapshots + IP/User-Agent + CSV export)
- Scheduled report definitions and manual "run due" execution

## Tech Stack

- Node.js 20+
- MongoDB 7+
- Next.js 15 (App Router)
- Express 4
- Mongoose 8
- Jest + React Testing Library (web), Jest + Supertest (api)

## Repository Structure

| Path | Purpose |
|---|---|
| `web` | Frontend app |
| `api` | Backend API |
| `packages/shared` | Shared schemas/types |

## Quick Start (Local)

### 1. Install

```bash
npm install
```

### 2. Configure environment

```bash
cp api/.env.example api/.env
cp web/.env.example web/.env.local
```

Required values:
- `api/.env`
  - `PORT` (default `5000`)
  - `WEB_ORIGIN` (default `http://localhost:3000`)
  - `MONGODB_URI`
  - `JWT_SECRET` (required in production)
- `web/.env.local`
  - `NEXT_PUBLIC_API_URL` (for local, usually `http://localhost:5000`)

### 3. Build shared package

```bash
npm run build --workspace=@dashio/shared
```

### 4. Run web + api

```bash
npm run dev
```

Default URLs:
- Web: `http://localhost:3000`
- API: `http://localhost:5000`
- Health: `http://localhost:5000/health`

## Database Utilities

Run from `api`:

```bash
npm run reset-db
npm run seed
```

- `reset-db`: clears customers/events/notes related data
- `seed`: inserts sample customers, events, and notes

## Docker

Run full stack (MongoDB + API + Web):

```bash
docker compose up --build
```

Run API-only stack for server deployment (MongoDB + API):

```bash
cp server.env.example .env
docker compose -f docker-compose.api.yml up -d --build
```

Default ports:
- Web: `3000`
- API: `5000`
- MongoDB: `27017`

## Permissions Model

Roles:
- `admin`: full access
- `viewer`: permission-based (defaults to read analytics/customers)

Supported permissions:
- `analytics.read`
- `customers.read`
- `customers.write`
- `admin.users.read`
- `admin.users.write`
- `admin.audit.read`
- `alerts.manage`
- `reports.manage`

## API Overview

All non-auth routes require authentication cookie.

### Health

- `GET /health`

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh`
- `GET /auth/me`
- `PATCH /auth/profile`
- `PATCH /auth/password`

### Customers

- `GET /customers`
- `GET /customers/export`
- `GET /customers/:id`
- `PATCH /customers/:id`
- `DELETE /customers/:id`
- `GET /customers/:id/activity`
- `GET /customers/:id/notes`
- `POST /customers/:id/notes`
- `PATCH /customers/:id/notes/:noteId`
- `DELETE /customers/:id/notes/:noteId`

Saved views:
- `GET /customers/views`
- `POST /customers/views`
- `DELETE /customers/views/:viewId`

Segments:
- `GET /customers/segments`
- `POST /customers/segments`
- `DELETE /customers/segments/:segmentId`
- `GET /customers/segments/:segmentId/preview`

Bulk:
- `POST /customers/bulk`

### Analytics

- `GET /analytics/kpis`
- `GET /analytics/new-customers`
- `GET /analytics/activity-trend`
- `GET /analytics/churn`
- `GET /analytics/cohort-retention`

Alerts:
- `GET /analytics/alerts/rules`
- `POST /analytics/alerts/rules`
- `PATCH /analytics/alerts/rules/:id`
- `DELETE /analytics/alerts/rules/:id`
- `GET /analytics/alerts/events`
- `POST /analytics/alerts/evaluate`

### Admin

Users:
- `POST /admin/users`
- `GET /admin/users`
- `PATCH /admin/users/:id/role`
- `PATCH /admin/users/:id/permissions`
- `PATCH /admin/users/:id/password`
- `DELETE /admin/users/:id`

Audit:
- `GET /admin/audit`
- `GET /admin/audit/export`

Scheduled reports:
- `GET /admin/reports/schedules`
- `POST /admin/reports/schedules`
- `PATCH /admin/reports/schedules/:id`
- `DELETE /admin/reports/schedules/:id`
- `POST /admin/reports/run-due`

## Testing

Run all workspace tests:

```bash
npm run test
```

Run per workspace:

```bash
npm run test --workspace=web
npm run test --workspace=api
```

Build checks:

```bash
npm run build --workspace=api
npm run build --workspace=web
```

## License

MIT. See `LICENSE`.
