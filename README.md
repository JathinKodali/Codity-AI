# Distributed Job Scheduler

Node/Express, PostgreSQL, socket.io, and a Vite React dashboard for a distributed job scheduler with Postgres row-level locking.

## Setup

```bash
cp .env.example .env
npm install
npm run migrate
npm run seed
```

Set `DATABASE_URL` and `JWT_SECRET` in `.env`. `OPENAI_API_KEY` is optional; without it, DLQ summaries fall back to a local sentence.

## Run Locally

```bash
npm run start:api
npm run start:worker
npm run start:reaper
npm run dev:frontend
```

Open the Vite URL and sign in with `admin@scheduler.local` / `password123` after seeding.

## Useful API Checks

```bash
curl http://127.0.0.1:4000/health
curl -X POST http://127.0.0.1:4000/auth/login -H "content-type: application/json" -d "{\"email\":\"admin@scheduler.local\",\"password\":\"password123\"}"
```

## Tests

```bash
npm test
```

The reliability tests require `DATABASE_URL`. They seed jobs, run multiple worker processes, verify no duplicate successful executions, kill a worker, run the reaper, and verify recovery.

## Deployment

Provision Postgres on Neon or Railway. Deploy the API and worker as separate long-running services from this repo:

```bash
npm run start:api
npm run start:worker
```

Deploy the Vite frontend to Vercel or Netlify with `VITE_API_URL` pointing at the API service. Live URLs were not filled in here because deployment credentials are environment-specific.

## Docs

- [Architecture](./architecture.md)
- [ER diagram](./er-diagram.md)
- [Design decisions](./design-decisions.md)
