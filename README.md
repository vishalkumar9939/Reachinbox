# ReachInbox Email Scheduler

> **Production-Grade Email Scheduling & Outreach Dispatch System**  
> Built with Node.js, TypeScript, Express, BullMQ, Redis, PostgreSQL (Prisma ORM), Elasticsearch, Ethereal Email (Nodemailer), Socket.IO, and React (Vite & Tailwind CSS).

---

## 1. Executive Overview

**ReachInbox Email Scheduler** is a high-throughput, fault-tolerant cold email dispatch platform designed to safely schedule and deliver thousands of outreach emails across custom time windows while protecting sender reputation and avoiding email provider throttling.

The system features:
- **Persistent Job Queues**: Scheduled emails survive backend restarts and worker node crashes using BullMQ + Redis delayed jobs.
- **Atomic Rate Limiting**: Distributed hourly sending quotas enforced via atomic Redis operations with automatic next-window deferral.
- **Worker Concurrency**: Configurable concurrent workers (`WORKER_CONCURRENCY`) processing independent jobs with exponential backoff retries.
- **Proactive Slack Alerts**: Instant Slack notifications dispatched to customer channels when hourly email limits are reached.
- **Full-Text Search Engine**: Elasticsearch indexing for scheduled, sent, and failed emails with transparent database fallback.
- **Live Observability**: Real-time Socket.IO event broadcasting and embedded Bull Board queue monitoring.
- **Ethereal SMTP Integration**: Automatic dynamic fake SMTP generation with clickable preview URLs.

---

## 2. Architecture & System Flow

```
                      ┌─────────────────────────────────────────┐
                      │    ReachInbox React Dashboard (Vite)    │
                      └────────────┬──────────────▲─────────────┘
                         HTTP/REST │              │ Socket.IO
                         (Axios)   │              │ (Real-time updates)
                                   ▼              │
                      ┌───────────────────────────┴─────────────┐
                      │          Express API Server             │
                      │  - Google OAuth & JWT Verification      │
                      │  - Zod Request Payload Validation       │
                      │  - Bull Board Monitoring Dashboard      │
                      └─────┬─────────────────────────────┬─────┘
                            │                             │
               Store Record │ (Status: SCHEDULED)         │ Delayed Enqueue
                            ▼                             ▼
                 ┌────────────────────┐         ┌────────────────────┐
                 │ PostgreSQL (Prisma)│         │   Redis (BullMQ)   │
                 └──────────▲─────────┘         └─────────┬──────────┘
                            │                             │
                            │ Database                    │ Job Picked Up
                            │ Updates                     │ (with offset)
                            │                             ▼
                            │                   ┌────────────────────┐
                            │                   │ Email Worker Node  │
                            │                   │ (Concurrency: 5)   │
                            │                   └─────────┬──────────┘
                            │                             │
         ┌──────────────────┴───────────────────┬─────────┴─────────────────────┐
         │                                      │                               │
         ▼                                      ▼                               ▼
┌──────────────────┐                  ┌──────────────────┐            ┌──────────────────┐
│ Redis Rate Check │ (Limit Reached)  │  Nodemailer SMTP │            │  Elasticsearch   │
│ (Atomic Sliding) ├─────────────────►│ (Ethereal Email) │            │ (Search Index)   │
└──────────────────┘  - Reschedule    └─────────┬────────┘            └──────────────────┘
                      - Slack Alert             │ Sent & Preview URL
                                                ▼
                                      ┌──────────────────┐
                                      │  User / Recipient│
                                      └──────────────────┘
```

---

## 3. Technology Stack

### Backend
- **Runtime**: Node.js v20+ / TypeScript
- **Web Framework**: Express.js
- **Queue & Scheduling**: BullMQ + Redis
- **ORM & Database**: Prisma ORM with PostgreSQL
- **Search Engine**: Elasticsearch 8.x (with Prisma full-text fallback)
- **Email Delivery**: Nodemailer + Ethereal Email (Dynamic fake SMTP)
- **Real-Time Communication**: Socket.IO
- **Validation**: Zod
- **Queue UI**: Bull Board Express Adapter
- **Testing**: Vitest + Supertest

### Frontend
- **Framework**: React 18 + TypeScript (Vite)
- **Styling**: Tailwind CSS
- **Routing**: React Router DOM v6
- **Icons**: Lucide React
- **Network**: Axios with JWT interceptors
- **Real-Time**: Socket.IO Client

### Infrastructure & Deployment
- **Docker Compose**: Multi-container setup (PostgreSQL, Redis, Elasticsearch, Backend, Worker, Frontend)
- **Nginx**: Production reverse proxy and static asset server for frontend

---

## 4. Repository Structure

```
reachinbox/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma              # Database schema (User, Email, Campaign, Sender, Slack)
│   ├── src/
│   │   ├── config/
│   │   │   ├── env.ts                 # Zod environment variable parsing
│   │   │   ├── prisma.ts              # Prisma singleton client
│   │   │   ├── redis.ts               # IORedis connection configuration
│   │   │   └── elasticsearch.ts       # Elasticsearch client & fallback health check
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts     # Google OAuth & demo session controller
│   │   │   ├── email.controller.ts    # Scheduling, batch dispatch & search controller
│   │   │   ├── queue.controller.ts    # BullMQ statistics, pause/resume/clean
│   │   │   └── slack.controller.ts    # Slack OAuth and alert webhooks
│   │   ├── integrations/
│   │   │   ├── ethereal.service.ts    # Nodemailer Ethereal fake SMTP service
│   │   │   └── slack.service.ts       # Slack Block Kit alert generation
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts     # JWT session verification
│   │   │   └── validation.middleware.ts # Zod request validators
│   │   ├── queues/
│   │   │   └── email.queue.ts         # BullMQ queue instantiation & helper methods
│   │   ├── routes/
│   │   │   ├── auth.routes.ts         # Auth API endpoints
│   │   │   ├── email.routes.ts        # Email scheduling & querying endpoints
│   │   │   ├── queue.routes.ts        # Queue management endpoints
│   │   │   ├── slack.routes.ts        # Slack OAuth endpoints
│   │   │   └── index.ts               # API router index
│   │   ├── services/
│   │   │   ├── elasticsearch.service.ts # Search indexer with DB fallback
│   │   │   └── rate-limit.service.ts  # Atomic Redis sliding window counter
│   │   ├── socket/
│   │   │   └── index.ts               # Socket.IO authenticated user room management
│   │   ├── types/                     # Shared TypeScript interfaces
│   │   ├── workers/
│   │   │   └── email.worker.ts        # Standalone BullMQ email worker process
│   │   └── server.ts                  # Main Express API server entry
│   ├── tests/                         # Vitest test suites (21 unit & integration tests)
│   ├── Dockerfile
│   ├── Dockerfile.worker
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/                # ToastContainer, LoadingSkeleton, EmptyState
│   │   ├── context/                   # AuthContext, SocketContext
│   │   ├── layouts/                   # DashboardLayout (Sidebar, Live status, Topbar)
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx          # Google Sign-In & Demo Engineer entry
│   │   │   ├── DashboardPage.tsx      # Overview metrics, hourly gauge, recent activity
│   │   │   ├── ComposePage.tsx        # CSV upload, deduplication, delay configuration
│   │   │   ├── ScheduledPage.tsx      # Scheduled emails table & cancellation
│   │   │   ├── SentPage.tsx           # Delivered emails & Ethereal preview links
│   │   │   ├── FailedPage.tsx         # Delivery errors & safe retry action
│   │   │   ├── QueuePage.tsx          # Live BullMQ statistics & inspector
│   │   │   └── SettingsPage.tsx       # Profile, rate settings, Slack connection
│   │   ├── services/                  # Axios API clients
│   │   ├── types/                     # Frontend TypeScript types
│   │   ├── App.tsx                    # Routes & protected routes
│   │   └── main.tsx                   # React root
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
│
├── docker-compose.yml                 # PostgreSQL, Redis, Elasticsearch, Backend, Worker, Frontend
├── .env.example                       # Documented environment variables
└── README.md                          # Production architectural documentation
```

---

## 5. Core Architectural Decisions

### 5.1 BullMQ & Persistence Across Restarts
- **Delayed Jobs**: Scheduled emails are never stored in ephemeral memory or standard cron tables. Every scheduled email is queued in BullMQ with a calculated `delay: Math.max(0, scheduledAt - now)`.
- **Durability**: Redis persists the queue. If the backend, worker, or server crashes or restarts, BullMQ reads the delayed and waiting jobs directly from Redis without dropping a single dispatch.
- **Idempotency**: Every email record has a unique `idempotencyKey` and deterministic BullMQ `jobId = email-{emailId}`. BullMQ automatically prevents duplicate job creation if an identical ID is enqueued.

### 5.2 Atomic Rate Limiting Strategy
- Cold email outreach platforms require strict hourly caps (e.g., max 200 emails/hour) to protect sender domains.
- Rather than in-memory variables (which fail across multiple workers), ReachInbox uses **Redis Lua Scripts**:
  ```lua
  local senderKey = KEYS[1]
  local globalKey = KEYS[2]
  local maxAllowed = tonumber(ARGV[1])
  -- Atomically inspect current counts
  local senderCount = tonumber(redis.call('get', senderKey) or '0')
  if senderCount >= maxAllowed then
      return { 0, senderCount } -- Denied
  end
  -- Increment atomically and set 1-hour expiration
  local newCount = redis.call('incr', senderKey)
  if newCount == 1 then redis.call('expire', senderKey, 3600) end
  return { 1, newCount } -- Allowed
  ```
- **When Hourly Limit is Hit**:
  1. The email is **NOT** failed.
  2. The worker defers the job to the next hourly reset window: `retryAfterMs = nextHour - now + 1000ms`.
  3. The job is re-enqueued with the new delay.
  4. If Slack is connected, a rich notification is sent to the user's Slack channel.
  5. A real-time Socket.IO alert (`email:rate-limited`) is emitted to the user's dashboard.

### 5.3 Elasticsearch with Graceful Fallback
- Scheduled, sent, and failed emails are indexed in Elasticsearch (`reachinbox-emails`) with fields for `recipientEmail`, `subject`, `body`, `senderEmail`, and `status`.
- **Fault-Tolerant Fallback**: If Elasticsearch is stopped, not provisioned, or temporarily unreachable, `ElasticsearchService` detects the cluster state and automatically falls back to PostgreSQL indexed queries (`ILIKE` / `contains`). Users experience zero downtime or broken searches.

### 5.4 Ethereal Fake SMTP & Real Email Previews
- When custom SMTP credentials are not specified, Nodemailer automatically provisions a dynamic Ethereal Email test account via `nodemailer.createTestAccount()`.
- Dispatched emails generate authentic `nodemailer.getTestMessageUrl(info)` preview links stored directly in the database and visible in the **Sent Emails** dashboard tab.

### 5.5 Slack OAuth & Rate-Limit Webhooks
- Users can click **Connect Slack** on the Settings page to authorize Slack via OAuth 2.0.
- When hourly limits are reached, the system formats a Slack Block Kit alert displaying:
  - Sender account
  - Current hourly usage vs. limit
  - Exact UTC resumption timestamp
- If Slack is not connected, the application operates normally with zero errors.

---

## 6. Installation & Quick Start

### Prerequisites
- Node.js 18+ (tested on Node v20/v24)
- npm 9+
- Docker & Docker Compose (optional for containerized deployment)
- Redis and PostgreSQL (or use Docker)

---

### Option A: Running with Docker Compose (Recommended)

1. **Clone the repository**:
   ```bash
   git clone <repo-url>
   cd reachinbox
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```

3. **Start the complete stack**:
   ```bash
   docker compose up --build
   ```

4. **Access the application**:
   - **Frontend Dashboard**: [http://localhost:5173](http://localhost:5173)
   - **Backend API**: [http://localhost:5000](http://localhost:5000)
   - **Bull Board Queue Monitor**: [http://localhost:5000/admin/queues](http://localhost:5000/admin/queues)
   - **Elasticsearch**: [http://localhost:9200](http://localhost:9200)

---

### Option B: Running Locally (Development Mode)

1. **Install backend dependencies & generate Prisma client**:
   ```bash
   cd backend
   npm install
   npm run prisma:generate
   ```

2. **Configure backend `.env`**:
   Ensure `backend/.env` exists (copied from `.env.example`).

3. **Run database migrations (or push schema)**:
   ```bash
   # For PostgreSQL (Docker or local):
   npm run prisma:push

   # Or for instant zero-setup SQLite local dev:
   npm run prisma:sqlite
   ```

4. **Seed initial demo data (Optional but recommended)**:
   Populates rich sample campaigns, scheduled dispatches, delivered emails with Ethereal preview links, and Slack configuration:
   ```bash
   npm run seed
   ```

5. **Start the backend API server**:
   ```bash
   npm run dev
   # Runs on http://localhost:5000
   ```

6. **Start the separate email worker process**:
   ```bash
   # In a separate terminal tab:
   cd backend
   npm run worker
   ```

7. **Install frontend dependencies & start development server**:
   ```bash
   # In a separate terminal tab:
   cd frontend
   npm install
   npm run dev
   # Runs on http://localhost:5173
   ```

8. **Explore the Application**:
   Navigate to [http://localhost:5173](http://localhost:5173). Click **Explore as Demo Engineer** for instant access, or use **Sign in with Google**!
   You can also test recipient upload using the provided files in `samples/recipients-sample.csv` and `samples/recipients-sample.txt` or clicking **Load Sample CSV Data** directly in the Compose tab.

---

## 7. Running Tests

The test suite validates CSV parsing, email regex validation, deduplication, atomic rate-limiting, idempotency, and JWT authentication:

```bash
cd backend
npm test
```

Expected output:
```
✓ tests/rate-limiter.test.ts  (4 tests)
✓ tests/csv-parser.test.ts  (5 tests)
✓ tests/idempotency.test.ts  (4 tests)
✓ tests/scheduling-validation.test.ts  (5 tests)
✓ tests/auth-middleware.test.ts  (3 tests)

Test Files  5 passed (5)
     Tests  21 passed (21)
```

---

## 8. REST API Reference

All protected endpoints require an `Authorization: Bearer <token>` header.

### Authentication
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/auth/google/url` | Generates Google OAuth redirect URL |
| `POST` | `/api/auth/google/callback` | Exchanges authorization code/credential for JWT |
| `POST` | `/api/auth/dev-login` | Instant demo login for testing without Google Cloud setup |
| `GET` | `/api/auth/me` | Returns current authenticated user profile |

### Email Scheduling & Management
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/emails/schedule` | Schedule a single email with future start time |
| `POST` | `/api/emails/batch-schedule` | Schedule multiple emails with staggered delays |
| `POST` | `/api/emails/parse-recipients`| Parse CSV/TXT content and validate emails |
| `GET` | `/api/emails` | Search and filter emails (Elasticsearch + DB fallback) |
| `GET` | `/api/emails/dashboard-overview` | Retrieve aggregate metrics and hourly gauge data |
| `GET` | `/api/emails/:id` | Retrieve single email details and preview URL |
| `POST` | `/api/emails/:id/cancel` | Cancel a scheduled email (removes from BullMQ) |
| `POST` | `/api/emails/:id/retry` | Re-enqueue a failed email safely without duplication |

### BullMQ Queue Management
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/queues/stats` | Live BullMQ job statistics (waiting, active, delayed, failed) |
| `POST` | `/api/queues/pause` | Pause email processing |
| `POST` | `/api/queues/resume` | Resume email processing |
| `POST` | `/api/queues/clean-failed`| Clear failed jobs history |

### Slack Integration
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/slack/auth-url` | Generate Slack OAuth redirect URL |
| `GET` | `/api/slack/callback` | OAuth callback to store access token |
| `GET` | `/api/slack/status` | Current Slack integration state |
| `POST` | `/api/slack/disconnect` | Disconnect Slack integration |
| `POST` | `/api/slack/test` | Dispatch a test alert to Slack |

---

## 9. Assumptions and Trade-offs

1. **Ethereal Email vs. Production SMTP (SendGrid/Amazon SES)**:
   - For evaluation without needing third-party verified sending domains, Ethereal fake SMTP is used. Every email yields an authentic preview link. To switch to production SES/SendGrid, simply update `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASSWORD` in `.env`.
2. **Elasticsearch Fallback**:
   - Elasticsearch requires substantial memory (minimum 512MB RAM). If running in resource-constrained environments where Elasticsearch is stopped, the application detects this seamlessly and routes queries through PostgreSQL indexes.
3. **Google OAuth and Sandbox Evaluation**:
   - Both complete Google OAuth 2.0 (via `OAuth2Client`) and a convenient Sandbox Demo Engineer mode are provided so anyone evaluating the platform can instantly experience all features without having to register a Google Cloud project.

---

## 10. License

ReachInbox Email Scheduler is open-source software built for high-scale cold outreach pipelines.
