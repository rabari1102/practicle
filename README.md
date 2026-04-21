# Conversation Session Service

A production-grade backend service for a Voice AI platform, built with **NestJS · TypeScript · MongoDB**.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 10 |
| Language | TypeScript 5 |
| Database | MongoDB 7 (Mongoose 8) |
| Runtime | Node.js 20 |
| Container | Docker + Docker Compose |
| API Docs | Swagger UI (`@nestjs/swagger`) |

---

## Project Structure

```
conversation-session-service/
├── src/
│   ├── common/
│   │   ├── constants/
│   │   │   └── index.ts                                  # SessionStatus & EventType enums
│   │   ├── exceptions/
│   │   │   └── domain.exceptions.ts                      # Domain-specific HTTP exceptions
│   │   ├── filters/
│   │   │   └── all-exceptions.filter.ts                  # Global exception filter — structured error responses
│   │   ├── interceptors/
│   │   │   ├── logging.interceptor.ts                    # Request/response logging
│   │   │   └── transform.interceptor.ts                  # Response envelope wrapper
│   │   └── pipes/
│   │       └── validation.pipe.ts                        # Global validation pipe with detailed error messages
│   ├── config/
│   │   ├── configuration.ts                              # Typed config factory
│   │   └── env.validation.ts                             # Startup env var validation (Joi)
│   ├── sessions/
│   │   ├── dto/
│   │   │   ├── create-session.dto.ts                     # POST /sessions request body
│   │   │   ├── add-event.dto.ts                          # POST /sessions/:id/events request body
│   │   │   └── get-session-query.dto.ts                  # GET /sessions/:id query params (limit/offset)
│   │   ├── repositories/            
│   │   │   ├── session.repository.ts                     # Session CRUD + upsert logic
│   │   │   └── event.repository.ts                       # Event insert + duplicate detection
│   │   ├── schemas/
│   │   │   ├── session.schema.ts                         # Mongoose Session schema + indexes
│   │   │   └── event.schema.ts                           # Mongoose Event schema + indexes
│   │   ├── sessions.controller.ts                        # REST endpoints
│   │   ├── sessions.controller.spec.ts                   # Controller unit tests
│   │   ├── sessions.service.ts                           # Business logic / orchestration
│   │   ├── sessions.service.spec.ts                      # Service unit tests
│   │   └── sessions.module.ts                            # Sessions feature module
│   ├── app.module.ts                                     # Root application module
│   └── main.ts                                           # Bootstrap, Swagger setup, global pipes/filters
├── .env.example                                          # Environment variable template
├── .gitignore
├── conversation_session_service.postman_collection.json  # Ready-to-import Postman collection
├── DESIGN.md                                             # Architecture & design decisions
├── Dockerfile
├── docker-compose.yml                                    # App + MongoDB stack
├── nest-cli.json
├── package.json
├── README.md
└── tsconfig.json
```

---

## Prerequisites

- Node.js >= 20
- npm >= 9
- MongoDB 6+ (local install or Docker)

---

## Setup & Run

### Option 1 — Docker Compose (Recommended)

Starts both MongoDB and the app with a single command:

```bash
# Clone / unzip the project
cd conversation-session-service

# Copy env file (defaults work out of the box with Docker Compose)
cp .env.example .env

# Start everything
docker compose up --build
```

The API will be available at:
- **REST API:** `http://localhost:3000`
- **Swagger UI:** `http://localhost:3000/api/docs`

---

### Option 2 — Local Development

**1. Install dependencies**
```bash
npm install
```

**2. Start MongoDB locally**

Either use a local MongoDB installation or spin up just the DB via Docker:
```bash
docker compose up mongodb -d
```

**3. Configure environment**
```bash
cp .env.example .env
# Edit .env if needed — defaults point to localhost:27017
```

**4. Run in development mode (with hot reload)**
```bash
npm run start:dev
```

The server will log:
```
🚀 Application is running in [development] mode
🌐 Listening on: http://localhost:3000
📖 Swagger UI:   http://localhost:3000/api/docs
```

**5. Run in production mode**
```bash
npm run build
npm run start:prod
```

---

## Running Tests

```bash
# Unit tests
npm run test

# Unit tests with coverage report
npm run test:cov

# Watch mode during development
npm run test:watch
```

---

## Swagger UI (Interactive API Docs)

Swagger UI loads **automatically** when the server starts. No extra setup required.

```
http://localhost:3000/api/docs
```

It provides:
- Full request/response schema for every endpoint
- Live **Try it out** — send real requests from the browser
- Request duration display
- Enum dropdowns for `status` and `type` fields
- Detailed error response documentation (400 / 404 / 409 / 500)

---

## API Reference

> 💡 **Tip:** Use the [Swagger UI](http://localhost:3000/api/docs) when the server is running for an interactive version of these docs.

All responses are wrapped in an envelope:
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2024-01-01T10:00:00.000Z",
  "path": "/sessions"
}
```

Errors follow a consistent structure:
```json
{
  "statusCode": 404,
  "errorCode": "SESSION_NOT_FOUND",
  "message": "Session with ID 'abc' was not found.",
  "path": "/sessions/abc",
  "method": "GET",
  "timestamp": "2024-01-01T10:00:00.000Z"
}
```

---

### POST /sessions
Create a new session or return the existing one (idempotent).

**Request body:**
```json
{
  "sessionId": "call-abc-123",
  "language": "en",
  "metadata": { "callerId": "+1234567890" }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `sessionId` | string | ✅ | Caller-supplied unique ID (max 128 chars) |
| `language` | string | ✅ | BCP-47 tag: `en`, `fr`, `en-US` |
| `status` | string | ❌ | Only `initiated` or `active` allowed on creation. Defaults to `initiated`. Terminal states (`completed`, `failed`) are reached via lifecycle transitions. |
| `metadata` | object | ❌ | Arbitrary key-value bag |

**Response: 200 OK**
```json
{
  "sessionId": "call-abc-123",
  "status": "initiated",
  "language": "en",
  "startedAt": "2024-01-01T10:00:00.000Z",
  "endedAt": null,
  "metadata": { "callerId": "+1234567890" }
}
```

---

### POST /sessions/:sessionId/events
Add an event to a session. Duplicate `eventId` returns 409.

**Request body:**
```json
{
  "eventId": "evt-001",
  "type": "user_speech",
  "payload": { "text": "Hello, how are you?", "confidence": 0.97 },
  "timestamp": "2024-01-01T10:01:00.000Z"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `eventId` | string | ✅ | Unique per session |
| `type` | string | ✅ | `user_speech`, `bot_speech`, `system` |
| `payload` | object | ✅ | Arbitrary event data |
| `timestamp` | string | ❌ | ISO 8601; defaults to server time |

**Response: 201 Created**

---

### GET /sessions/:sessionId?limit=20&offset=0
Retrieve session with paginated events (ordered by timestamp ASC).

**Query params:**

| Param | Default | Max | Description |
|---|---|---|---|
| `limit` | 20 | 100 | Events per page |
| `offset` | 0 | — | Skip N events |

**Response: 200 OK**
```json
{
  "session": { ... },
  "events": [ ... ],
  "pagination": {
    "total": 42,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

---

### POST /sessions/:sessionId/complete
Mark a session as completed. Idempotent.

**Response: 200 OK** — the updated session object.
**409 Conflict** — if session is in `failed` state.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |
| `NODE_ENV` | `development` | `development`, `production`, `test` |
| `MONGODB_URI` | `mongodb://localhost:27017/conversation_sessions` | MongoDB connection string |
| `MONGODB_POOL_SIZE` | `10` | Max connections in pool |
| `MONGODB_CONNECT_TIMEOUT_MS` | `5000` | Connection timeout |
| `MONGODB_SERVER_SELECTION_TIMEOUT_MS` | `5000` | Server selection timeout |

---

## Assumptions

1. **`sessionId` is caller-owned**: The service does not generate session IDs. Callers provide them (e.g. a telephony platform's call ID). This is intentional — it makes the upsert idempotency simple and natural.

2. **Events are immutable**: Once written, an event cannot be updated or deleted. A duplicate `eventId` per session is a conflict (409), not a silent overwrite.

3. **`startedAt` is set by the server**: On creation, `startedAt` is always the server timestamp. Callers cannot retroactively set a session start time. This prevents clock skew issues.

4. **`timestamp` on events defaults to server time**: If the caller omits `timestamp`, the server uses `new Date()`. Callers should prefer to send explicit timestamps for accuracy.

5. **No authentication**: As specified in the requirements.

6. **Offset-based pagination**: Sufficient per the assignment FAQ. At very high event counts (100k+ per session), cursor-based pagination on `timestamp` would be more efficient (avoids `skip()` cost).

7. **`toJSON` strips `_id`**: The MongoDB internal `_id` is never exposed. The API surface uses `sessionId`/`eventId` exclusively.
