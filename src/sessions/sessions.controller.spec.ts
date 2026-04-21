import { Test, TestingModule } from '@nestjs/testing';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { SESSION_STATUS, EVENT_TYPE } from '../common/constants';
import { Session } from './schemas/session.schema';
import { ConversationEvent } from './schemas/event.schema';
import { SessionWithEvents } from './sessions.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'sess-ctrl-001',
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
    eventId: 'evt-ctrl-001',
    sessionId: 'sess-ctrl-001',
    type: EVENT_TYPE.USER_SPEECH,
    payload: { text: 'Hello' },
    timestamp: new Date('2024-01-01T10:01:00Z'),
    ...overrides,
  } as ConversationEvent;
}

// ─── Mock service ─────────────────────────────────────────────────────────────

const mockSessionsService = () => ({
  createOrGetSession: jest.fn(),
  addEvent: jest.fn(),
  getSessionWithEvents: jest.fn(),
  completeSession: jest.fn(),
});

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('SessionsController', () => {
  let controller: SessionsController;
  let service: ReturnType<typeof mockSessionsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SessionsController],
      providers: [
        { provide: SessionsService, useFactory: mockSessionsService },
      ],
    }).compile();

    controller = module.get(SessionsController);
    service = module.get(SessionsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── POST /sessions ─────────────────────────────────────────────────────────

  describe('createOrGetSession', () => {
    it('delegates to service and returns its result', async () => {
      const session = makeSession();
      service.createOrGetSession.mockResolvedValue(session);

      const result = await controller.createOrGetSession({
        sessionId: 'sess-ctrl-001',
        language: 'en',
      });

      expect(service.createOrGetSession).toHaveBeenCalledTimes(1);
      expect(service.createOrGetSession).toHaveBeenCalledWith({
        sessionId: 'sess-ctrl-001',
        language: 'en',
      });
      expect(result).toEqual(session);
    });

    it('propagates service errors without wrapping', async () => {
      service.createOrGetSession.mockRejectedValue(new Error('DB error'));

      await expect(
        controller.createOrGetSession({ sessionId: 'x', language: 'en' }),
      ).rejects.toThrow('DB error');
    });
  });

  // ── POST /sessions/:sessionId/events ───────────────────────────────────────

  describe('addEvent', () => {
    it('delegates to service with sessionId and dto', async () => {
      const event = makeEvent();
      service.addEvent.mockResolvedValue(event);

      const result = await controller.addEvent('sess-ctrl-001', {
        eventId: 'evt-ctrl-001',
        type: EVENT_TYPE.USER_SPEECH,
        payload: { text: 'Hello' },
      });

      expect(service.addEvent).toHaveBeenCalledTimes(1);
      expect(service.addEvent).toHaveBeenCalledWith('sess-ctrl-001', {
        eventId: 'evt-ctrl-001',
        type: EVENT_TYPE.USER_SPEECH,
        payload: { text: 'Hello' },
      });
      expect(result).toEqual(event);
    });

    it('propagates service errors without wrapping', async () => {
      service.addEvent.mockRejectedValue(new Error('session not found'));

      await expect(
        controller.addEvent('missing', {
          eventId: 'e1',
          type: EVENT_TYPE.SYSTEM,
          payload: {},
        }),
      ).rejects.toThrow('session not found');
    });
  });

  // ── GET /sessions/:sessionId ───────────────────────────────────────────────

  describe('getSession', () => {
    it('delegates to service with sessionId and query params', async () => {
      const session = makeSession();
      const events = [makeEvent()];
      const response: SessionWithEvents = {
        session,
        events,
        pagination: { total: 1, limit: 20, offset: 0, hasMore: false },
      };
      service.getSessionWithEvents.mockResolvedValue(response);

      const result = await controller.getSession('sess-ctrl-001', {
        limit: 20,
        offset: 0,
      });

      expect(service.getSessionWithEvents).toHaveBeenCalledWith(
        'sess-ctrl-001',
        { limit: 20, offset: 0 },
      );
      expect(result.session.sessionId).toBe('sess-ctrl-001');
      expect(result.events).toHaveLength(1);
      expect(result.pagination.hasMore).toBe(false);
    });

    it('propagates service errors without wrapping', async () => {
      service.getSessionWithEvents.mockRejectedValue(new Error('not found'));

      await expect(
        controller.getSession('missing', { limit: 20, offset: 0 }),
      ).rejects.toThrow('not found');
    });
  });

  // ── POST /sessions/:sessionId/complete ────────────────────────────────────

  describe('completeSession', () => {
    it('delegates to service with sessionId and returns result', async () => {
      const completed = makeSession({
        status: SESSION_STATUS.COMPLETED,
        endedAt: new Date(),
      });
      service.completeSession.mockResolvedValue(completed);

      const result = await controller.completeSession('sess-ctrl-001');

      expect(service.completeSession).toHaveBeenCalledTimes(1);
      expect(service.completeSession).toHaveBeenCalledWith('sess-ctrl-001');
      expect(result.status).toBe(SESSION_STATUS.COMPLETED);
    });

    it('propagates service errors without wrapping', async () => {
      service.completeSession.mockRejectedValue(new Error('conflict'));

      await expect(controller.completeSession('sess-ctrl-001')).rejects.toThrow(
        'conflict',
      );
    });
  });
});
