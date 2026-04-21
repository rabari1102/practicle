# DESIGN.md — Conversation Session Service

## 1. How did you ensure idempotency?

### Session Creation (`POST /sessions`)
I use MongoDB's `findOneAndUpdate` with `{ upsert: true }` and `$setOnInsert`. The key insight is **`$setOnInsert`** — it only applies fields when the document is being *created*, never on an update. This means:
- If the session doesn't exist → it is created atomically with the provided fields.
- If it already exists → the document is returned untouched, regardless of what the caller sent.

This is a single atomic MongoDB operation. No application-layer locking, no retry loops, no race conditions.

### Event Creation (`POST /sessions/:sessionId/events`)
The idempotency guarantee lives at the **database layer** via a unique compound index:
```
{ sessionId: 1, eventId: 1 } — unique: true
```
The service attempts a clean `Model.create()`. If MongoDB returns error code `11000` (duplicate key), the repository catches it, fetches and returns the existing document, and flags it as a duplicate. The service layer then surfaces a `409 Conflict` to the caller so they know the request was a no-op.

Events are **immutable** by design — no upsert is used here. An upsert would silently overwrite payload differences on retransmission, hiding bugs in callers.

### Complete Session (`POST /sessions/:sessionId/complete`)
The service first reads the current status:
- If already `completed` → returns the document as-is (idempotent, HTTP 200).
- If `failed` → returns 409 (terminal state, cannot transition).
- Otherwise → issues `findOneAndUpdate` with a conditional filter `{ status: { $nin: ['completed', 'failed'] } }` to prevent racing concurrent completions from both applying.

---

## 2. How does your design behave under concurrent requests?

### Concurrent session creation
Two simultaneous `POST /sessions` requests with the same `sessionId` both hit `findOneAndUpdate` with `upsert: true`. MongoDB's document-level locking ensures **exactly one insert** occurs. The "loser" of the race gets back the document the "winner" created. Both callers receive the same response. No application-level mutex required.

### Concurrent event insertion
Two simultaneous `POST /sessions/:sessionId/events` with the same `eventId` both attempt `Model.create()`. Only one succeeds; the other receives error `E11000`. The unique index is the single source of truth — no two concurrent writes can both succeed.

### Concurrent session completion
Two simultaneous `POST /sessions/:sessionId/complete` requests both pass the status check (session is `active`). Both issue `findOneAndUpdate` with `{ status: { $nin: ['completed', 'failed'] } }`. MongoDB's document-level locking ensures only one update applies. The second returns `null`, at which point the repository re-fetches and returns the now-completed document. Both callers receive the same completed session.

**No optimistic locking, retry loops, or distributed locks are needed** — all concurrency is handled by MongoDB's atomic operations and unique constraints.

---

## 3. What MongoDB indexes did you choose and why?

### `sessions` collection

| Index | Type | Reason |
|---|---|---|
| `{ sessionId: 1 }` | Unique | Primary lookup key for all session operations. Auto-created by `unique: true` on the field. |
| `{ status: 1, startedAt: -1 }` | Compound | Supports operational queries like "find all active sessions sorted by start time" — useful for dashboards and cleanup jobs without a collection scan. |

### `conversation_events` collection

| Index | Type | Reason |
|---|---|---|
| `{ sessionId: 1, eventId: 1 }` | Unique Compound | **Idempotency guard.** Enforces one eventId per session at the storage level. The DB enforces this, not the application. |
| `{ sessionId: 1, timestamp: 1 }` | Compound | Supports the `GET /sessions/:id` query: `find({ sessionId }).sort({ timestamp: 1 }).skip(offset).limit(limit)`. The compound index covers the filter AND sort, making it index-only (no in-memory sort, no fetch-and-sort). |

The order `(sessionId, timestamp)` matters — MongoDB can use a compound index for a filter on the first field plus a sort on the second. Reversing it would break this optimization.

---

## 4. How would you scale this system for millions of sessions per day?

### Database Layer
- **MongoDB Replica Set** (minimum 3 nodes): enables read scaling by routing reads to secondaries for non-critical reads like `GET /sessions/:id`. Write concern `majority` already configured.
- **MongoDB Sharding** when a single replica set becomes a bottleneck. Shard key: `sessionId` (high cardinality, evenly distributed, already the primary lookup key). This distributes both read and write load horizontally.
- **TTL Index** on `sessions.startedAt` to auto-expire old sessions after retention period, keeping the working set in memory:
  ```js
  db.sessions.createIndex({ startedAt: 1 }, { expireAfterSeconds: 7776000 }) // 90 days
  ```
- **Event archival**: move old events to cold storage (e.g. S3 / Data Lake) and keep only recent events in MongoDB.

### Application Layer
- **Horizontal scaling**: NestJS is stateless. Multiple instances behind a load balancer (Kubernetes / ECS) with session stickiness disabled.
- **Connection pooling**: `maxPoolSize` and `minPoolSize` are configurable per-instance. At scale, tune based on observed p99 query times.
- **Read replicas**: route `GET` requests to MongoDB secondaries via `readPreference: secondaryPreferred` to offload the primary.
- **Caching** (not in scope here but next step): Add Redis to cache hot sessions (e.g. active calls). Cache-aside pattern: on `GET /sessions/:id`, check Redis first; on `POST .../complete`, invalidate.

### Observability (prerequisite for scaling confidently)
- Structured JSON logs (replace NestJS Logger with Winston/Pino).
- Distributed tracing (OpenTelemetry + Jaeger/Datadog).
- MongoDB slow query monitoring (Atlas Performance Advisor, or `explain()` on critical paths).
- Alerting on: p99 latency, error rate, MongoDB connection pool exhaustion.

### Queue-Based Event Ingestion (beyond this scope)
At very high event rates (e.g. 10k events/sec), the write path becomes the bottleneck. The production pattern would be:
1. `POST /sessions/:id/events` → publish to Kafka/SQS (sub-ms response).
2. A consumer service batch-writes events to MongoDB.
3. This decouples the API from DB write throughput.

---

## 5. What did you intentionally keep out of scope, and why?

| Omission | Reason |
|---|---|
| **Authentication / Authorization** | Explicitly excluded by requirements. In production: JWT Bearer + NestJS Guards. |
| **Background jobs / queues** | Explicitly excluded. See scaling section above for how they'd fit. |
| **External services** | Explicitly excluded. |
| **Database migrations / seeding** | Not needed for MongoDB schema-less design; indexes are auto-created on startup via Mongoose `autoIndex: true` (default). |
| **Rate limiting** | Production-ready addition (`@nestjs/throttler`). Not in assignment scope. |
| **Redis caching** | Valuable at scale, out of scope for this assignment. |
| **Cursor-based pagination** | Offset-based pagination is sufficient per FAQ Q5. Cursor-based would replace `skip()` (which degrades at high offsets) with a `timestamp > lastSeen` filter. |
| **End-to-end / integration tests** | Unit tests covering all service branches are included. E2E tests would need a live MongoDB (testcontainers or local Docker) — straightforward to add. |
| **OpenTelemetry tracing** | Critical for production. Omitted to keep setup minimal. |

---

## Key Design Decisions Summary

1. **Repository pattern**: Controllers → Service → Repository. The service owns all business logic; repositories are thin data-access wrappers. Swapping MongoDB for another database only requires changing the repository layer.

2. **Unique DB indexes as the idempotency layer**: Application-level deduplication alone is insufficient under concurrency. The database constraint is the ultimate arbiter.

3. **`$setOnInsert` for upsert**: Safer than `$set` for idempotent creation — it guarantees the document is only written once and never partially overwritten by a concurrent caller with different data.

4. **`toJSON` transform on schemas**: Internal `_id` is stripped from all responses. The API surface uses `sessionId` / `eventId` exclusively, keeping the contract clean and portable.

5. **Structured error responses**: Every error carries `statusCode`, `errorCode` (machine-readable), `message` (human-readable), `path`, `method`, and `timestamp`. Callers can handle errors programmatically without parsing message strings.

6. **Swagger UI via `@nestjs/swagger`**: `@ApiProperty` / `@ApiPropertyOptional` decorators are applied to all DTOs and Mongoose schema classes. `@ApiOperation`, `@ApiParam`, `@ApiBody`, and `@ApiResponse` decorators document every route in the controller. The Swagger document is built in `main.ts` and served at `/api/docs` automatically on server start — no separate documentation step needed. `@ApiExtraModels` ensures `Session` and `ConversationEvent` schema refs resolve correctly in the generated OpenAPI spec.
