import { Test, TestingModule } from '@nestjs/testing';
import { SessionsService } from './sessions.service';
import { SessionRepository } from './repositories/session.repository';
import { EventRepository } from './repositories/event.repository';
import {
  SessionNotFoundException,
  SessionAlreadyCompletedException,
  DuplicateEventException,
} from '../common/exceptions/domain.exceptions';
import { SESSION_STATUS, EVENT_TYPE } from '../common/constants';
import { Session } from './schemas/session.schema';
import { ConversationEvent } from './schemas/event.schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'sess-001',
    status: SESSION_STATUS.INITIATED,
    language: 'en',
    startedAt: new Date('2024-01-01T10:00:00Z'),
    endedAt: null,
    metadata: null,
    ...overrides,
  } as Session;
}

function makeEvent(overrides: Partial<ConversationEvent> = {}): ConversationEvent {
  return {
    eventId: 'evt-001',
    sessionId: 'sess-001',
    type: EVENT_TYPE.USER_SPEECH,
    payload: { text: 'Hello' },
    timestamp: new Date('2024-01-01T10:01:00Z'),
    ...overrides,
  } as ConversationEvent;
}

// ─── Mock factories ───────────────────────────────────────────────────────────

const mockSessionRepo = () => ({
  upsertSession: jest.fn(),
  findBySessionId: jest.fn(),
  completeSession: jest.fn(),
});

const mockEventRepo = () => ({
  insertEvent: jest.fn(),
  findEventsBySessionId: jest.fn(),
});

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('SessionsService', () => {
  let service: SessionsService;
  let sessionRepo: ReturnType<typeof mockSessionRepo>;
  let eventRepo: ReturnType<typeof mockEventRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: SessionRepository, useFactory: mockSessionRepo },
        { provide: EventRepository, useFactory: mockEventRepo },
      ],
    }).compile();

    service = module.get(SessionsService);
    sessionRepo = module.get(SessionRepository);
    eventRepo = module.get(EventRepository);
  });

  afterEach(() => jest.clearAllMocks());

  // ── createOrGetSession ─────────────────────────────────────────────────────

  describe('createOrGetSession', () => {
    it('creates a new session when none exists', async () => {
      const session = makeSession();
      sessionRepo.upsertSession.mockResolvedValue(session);

      const result = await service.createOrGetSession({
        sessionId: 'sess-001',
        language: 'en',
      });

      expect(sessionRepo.upsertSession).toHaveBeenCalledTimes(1);
      expect(result.sessionId).toBe('sess-001');
    });

    it('returns existing session when sessionId already exists (idempotent)', async () => {
      const existing = makeSession({ status: SESSION_STATUS.ACTIVE });
      sessionRepo.upsertSession.mockResolvedValue(existing);

      const result = await service.createOrGetSession({
        sessionId: 'sess-001',
        language: 'en',
      });

      expect(result.status).toBe(SESSION_STATUS.ACTIVE);
    });
  });

  // ── addEvent ───────────────────────────────────────────────────────────────

  describe('addEvent', () => {
    it('adds a new event successfully', async () => {
      const session = makeSession();
      const event = makeEvent();
      sessionRepo.findBySessionId.mockResolvedValue(session);
      eventRepo.insertEvent.mockResolvedValue({ event, isDuplicate: false });

      const result = await service.addEvent('sess-001', {
        eventId: 'evt-001',
        type: EVENT_TYPE.USER_SPEECH,
        payload: { text: 'Hello' },
      });

      expect(result.eventId).toBe('evt-001');
    });

    it('throws SessionNotFoundException when session does not exist', async () => {
      sessionRepo.findBySessionId.mockResolvedValue(null);

      await expect(
        service.addEvent('missing-session', {
          eventId: 'evt-001',
          type: EVENT_TYPE.USER_SPEECH,
          payload: {},
        }),
      ).rejects.toThrow(SessionNotFoundException);
    });

    it('throws DuplicateEventException on duplicate eventId', async () => {
      const session = makeSession();
      const event = makeEvent();
      sessionRepo.findBySessionId.mockResolvedValue(session);
      eventRepo.insertEvent.mockResolvedValue({ event, isDuplicate: true });

      await expect(
        service.addEvent('sess-001', {
          eventId: 'evt-001',
          type: EVENT_TYPE.USER_SPEECH,
          payload: {},
        }),
      ).rejects.toThrow(DuplicateEventException);
    });
  });

  // ── getSessionWithEvents ───────────────────────────────────────────────────

  describe('getSessionWithEvents', () => {
    it('returns session with paginated events', async () => {
      const session = makeSession();
      const events = [makeEvent(), makeEvent({ eventId: 'evt-002' })];
      sessionRepo.findBySessionId.mockResolvedValue(session);
      eventRepo.findEventsBySessionId.mockResolvedValue({
        events,
        total: 2,
        limit: 20,
        offset: 0,
      });

      const result = await service.getSessionWithEvents('sess-001', {
        limit: 20,
        offset: 0,
      });

      expect(result.events).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.hasMore).toBe(false);
    });

    it('throws SessionNotFoundException when session does not exist', async () => {
      sessionRepo.findBySessionId.mockResolvedValue(null);

      await expect(
        service.getSessionWithEvents('missing', { limit: 20, offset: 0 }),
      ).rejects.toThrow(SessionNotFoundException);
    });
  });

  // ── completeSession ────────────────────────────────────────────────────────

  describe('completeSession', () => {
    it('completes an active session', async () => {
      const session = makeSession({ status: SESSION_STATUS.ACTIVE });
      const completed = makeSession({
        status: SESSION_STATUS.COMPLETED,
        endedAt: new Date(),
      });
      sessionRepo.findBySessionId.mockResolvedValue(session);
      sessionRepo.completeSession.mockResolvedValue(completed);

      const result = await service.completeSession('sess-001');

      expect(result.status).toBe(SESSION_STATUS.COMPLETED);
      expect(result.endedAt).toBeDefined();
    });

    it('is idempotent — returns already-completed session without error', async () => {
      const completed = makeSession({
        status: SESSION_STATUS.COMPLETED,
        endedAt: new Date(),
      });
      sessionRepo.findBySessionId.mockResolvedValue(completed);

      const result = await service.completeSession('sess-001');

      expect(result.status).toBe(SESSION_STATUS.COMPLETED);
      expect(sessionRepo.completeSession).not.toHaveBeenCalled();
    });

    it('throws SessionNotFoundException when session does not exist', async () => {
      sessionRepo.findBySessionId.mockResolvedValue(null);

      await expect(service.completeSession('missing')).rejects.toThrow(
        SessionNotFoundException,
      );
    });

    it('throws SessionAlreadyCompletedException when session is failed', async () => {
      const failed = makeSession({ status: SESSION_STATUS.FAILED });
      sessionRepo.findBySessionId.mockResolvedValue(failed);

      await expect(service.completeSession('sess-001')).rejects.toThrow(
        SessionAlreadyCompletedException,
      );
    });
  });
});
