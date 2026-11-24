# ReachInbox Email Scheduler — Production Deployment Guide

This repository is ready for deployment across multiple platforms. Below are the recommended deployment options.

---

## Architecture Overview

A complete production deployment requires 4 components:
1. **PostgreSQL Database**: Persistent storage for emails, users, and audit records.
2. **Redis (v6.2+)**: Queue and rate limiting atomic sliding window for BullMQ.
3. **Backend API & BullMQ Worker**: Node.js services (`server.js` and `workers/email.worker.js`).
4. **Frontend**: React (Vite) single-page application.

---

## Option 1: Full-Stack Cloud Deployment (Railway / Render) — Recommended

### Step 1: Provision Managed Database & Redis
You can use managed services with free or low-cost tiers:
- **PostgreSQL**: [Neon](https://neon.tech) or [Supabase](https://supabase.com) or [Render Postgres](https://render.com)
- **Redis**: [Upstash](https://upstash.com) or [Railway Redis](https://railway.app) or [Render Redis](https://render.com)

### Step 2: Deploy Backend & Worker on Render or Railway

#### Backend API Service
- **Build Command**: `cd backend && npm install && npm run build`
- **Start Command**: `node backend/dist/server.js`
- **Environment Variables**:
  ```env
  NODE_ENV=production
  PORT=5000
  DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
  REDIS_HOST=your-redis-host.com
  REDIS_PORT=6379
  REDIS_PASSWORD=your-redis-password
  JWT_SECRET=generate-a-secure-random-32-char-string
  FRONTEND_URL=https://your-frontend-app.vercel.app
  GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
  GOOGLE_CLIENT_SECRET=your-google-client-secret
  GOOGLE_CALLBACK_URL=https://your-backend-api.onrender.com/api/auth/google/callback
  MAX_EMAILS_PER_HOUR=200
  WORKER_CONCURRENCY=5
  ```

#### BullMQ Worker Service (Background Worker)
- **Build Command**: `cd backend && npm install && npm run build`
- **Start Command**: `node backend/dist/workers/email.worker.js`
- **Environment Variables**: Same `DATABASE_URL`, `REDIS_*`, and rate limit variables as the backend.

### Step 3: Deploy Frontend on Vercel
1. Go to [Vercel](https://vercel.com) -> New Project -> Import `Reachinbox`.
2. Set **Root Directory** to `frontend`.
3. Set **Framework Preset** to `Vite`.
4. In **Environment Variables**:
   ```env
   VITE_API_URL=https://your-backend-api.onrender.com/api
   ```
5. Deploy!

### Step 4: Update Google OAuth Console
1. Open [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Edit your OAuth 2.0 Client ID:
   - **Authorized JavaScript origins**: Add `https://your-frontend-app.vercel.app`
   - **Authorized redirect URIs**: Add `https://your-backend-api.onrender.com/api/auth/google/callback`
3. Save changes.

---

## Option 2: Single-Server VPS with Docker Compose (AWS EC2 / DigitalOcean)

If you have a Linux server (Ubuntu 22.04+):

1. **SSH into your server**:
   ```bash
   git clone https://github.com/vishalkumar9939/Reachinbox.git
   cd Reachinbox
   ```

2. **Configure Production `.env`**:
   ```bash
   cp .env.example .env
   nano .env
   ```
   Fill in your production values, domains, and secrets.

3. **Start All Services with Docker Compose**:
   ```bash
   docker compose up -d --build
   ```
   This will spin up:
   - PostgreSQL (port 5432)
   - Redis (port 6379)
   - Elasticsearch (port 9200)
   - ReachInbox API (port 5000)
   - BullMQ Worker
   - Frontend Nginx (port 80/443)

4. **Verify Health**:
   ```bash
   curl http://localhost:5000/api/health
   ```

---

## Summary of Production URLs

| Component | Target URL |
|-----------|------------|
| Frontend App | `https://your-frontend.vercel.app` |
| Backend API | `https://your-backend.onrender.com/api` |
| Bull Board Queue Dashboard | `https://your-backend.onrender.com/admin/queues` |
| Health Check | `https://your-backend.onrender.com/api/health` |
