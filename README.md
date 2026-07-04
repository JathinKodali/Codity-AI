# ⚡ Codity: Distributed Job Scheduler

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A robust, production-ready distributed job scheduler built with Node.js, Express, and PostgreSQL. Features an incredibly sleek, dark-themed React dashboard for real-time monitoring and configuration.

Under the hood, we rely on PostgreSQL's powerful row-level locking (`FOR UPDATE SKIP LOCKED`) to guarantee that no matter how many worker nodes you spin up, jobs are claimed atomically with absolutely zero race conditions. 

---

## ✨ Highlights

| Feature | Details |
|---------|---------|
| **Atomic Job Claims** | `FOR UPDATE SKIP LOCKED` — zero race conditions across N workers |
| **Configurable Retries** | Fixed, linear, or exponential backoff per queue |
| **Dead Letter Queue** | Auto-quarantine after max retries, optional AI failure summaries |
| **Real-Time Dashboard** | WebSocket-powered React console with live job and worker status |
| **Cron Scheduling** | Recurring jobs via standard cron expressions |
| **Worker Health** | Heartbeat monitoring + automatic reaper for crashed workers |
| **RBAC** | JWT auth with admin/member role enforcement |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Dashboard (Vite)                    │
│              WebSocket ↕ ·  JWT REST ↕                      │
├─────────────────────────────────────────────────────────────┤
│                    Express API Server                        │
│         LISTEN/NOTIFY ↕ · Raw SQL ↕                         │
├─────────────────────────────────────────────────────────────┤
│                      PostgreSQL                              │
│    ┌──────────┐  ┌──────────┐  ┌──────────┐                │
│    │ Worker A │  │ Worker B │  │  Reaper  │                 │
│    │ FOR UPDATE│  │ FOR UPDATE│  │ Heartbeat│                │
│    │ SKIP LOCKED│ │ SKIP LOCKED│ │   Scan  │                │
│    └──────────┘  └──────────┘  └──────────┘                │
└─────────────────────────────────────────────────────────────┘
```

> For a detailed Mermaid version, see [architecture.md](./architecture.md).

---

## 🚀 Getting Started

Ready to spin things up? Let's get your local environment configured.

1. **Configure your environment**
   Copy the example environment file to get started:
   ```bash
   cp .env.example .env
   ```
   *Make sure to set `DATABASE_URL` and a secret `JWT_SECRET` in your new `.env` file. If you have an `OPENAI_API_KEY`, drop it in there too to enable the AI-powered failure summaries!*

2. **Install and Bootstrap**
   Install the dependencies, build the database tables, and seed it with some initial data:
   ```bash
   npm install
   npm run migrate
   npm run seed
   ```

---

## 🏃‍♂️ Running Locally

Codity is a distributed system, meaning it's composed of a few different moving parts. You can run all of these locally in separate terminal tabs:

```bash
# 1. Start the main API server (Handles REST and WebSockets)
npm run start:api

# 2. Start a Worker (Pulls jobs and executes them)
# Note: You can run as many of these as you want!
npm run start:worker

# 3. Start the Reaper (Monitors worker heartbeats and rescues abandoned jobs)
npm run start:reaper

# 4. Spin up the gorgeous React Dashboard
npm run dev:frontend
```

Once everything is running, open the Vite URL in your browser. Since you ran the seed script, you can log in with:
**Email:** `admin@scheduler.local` 
**Password:** `password123`

---

## 🧪 Testing the API

Want to poke around via the terminal? Here are some handy curl commands to check if the engine is purring:

```bash
# Check system health
curl http://127.0.0.1:4000/health

# Grab an authentication token
curl -X POST http://127.0.0.1:4000/auth/login \
  -H "content-type: application/json" \
  -d "{\"email\":\"admin@scheduler.local\",\"password\":\"password123\"}"
```

## 🚥 Reliability Tests

We take stability seriously. To run the integration suite:

```bash
npm test
```
*Note: These tests require your `DATABASE_URL` to be set. They will seed jobs, spin up multiple concurrent workers, forcibly crash them, run the reaper, and verify that the system perfectly recovers without ever double-executing a successful job.*

---

## ☁️ Deployment Guide

Ready for the real world? Here is how to deploy Codity:

1. **Database:** Provision a PostgreSQL instance on a provider like Neon or Railway.
2. **Backend Services:** Deploy the `api` and `worker` as completely separate, long-running processes on your cloud provider of choice (e.g., Render, Railway, AWS).
   ```bash
   npm run start:api
   npm run start:worker
   ```
3. **Frontend Dashboard:** Deploy the Vite React app to Vercel or Netlify. Just make sure to expose your deployed API URL as the `VITE_API_URL` environment variable during the build step!

---

## 📚 Deep Dives

Curious about how we built this? Check out the architectural docs:

- [Architecture Overview](./architecture.md) - How the pieces fit together.
- [ER Diagram](./er-diagram.md) - The database schema design.
- [Design Decisions](./design-decisions.md) - Why we chose Postgres locks over Redis, and more.
- [API Documentation](./api-docs.md) - Complete REST API reference.
