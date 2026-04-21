import { Injectable, Logger } from '@nestjs/common';
import { SessionRepository } from './repositories/session.repository';
import { EventRepository } from './repositories/event.repository';
import { CreateSessionDto } from './dto/create-session.dto';
import { AddEventDto } from './dto/add-event.dto';
import { GetSessionQueryDto } from './dto/get-session-query.dto';
import { Session } from './schemas/session.schema';
import { ConversationEvent } from './schemas/event.schema';
import { SESSION_STATUS } from '../common/constants';
import {
  SessionNotFoundException,
  SessionAlreadyCompletedException,
  DuplicateEventException,
} from '../common/exceptions/domain.exceptions';

export interface SessionWithEvents {
  session: Session;
  events: ConversationEvent[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface AddEventResult {
  event: ConversationEvent;
  isDuplicate: boolean;
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly eventRepository: EventRepository,
  ) {}

  /**
   * Idempotent session creation.
   *
   * Returns the existing session if sessionId already exists,
   * or creates and returns a new one. Safe under concurrent callers.
   */
  async createOrGetSession(dto: CreateSessionDto): Promise<Session> {
    this.logger.log(`createOrGetSession: sessionId=${dto.sessionId}`);

    const session = await this.sessionRepository.upsertSession({
      sessionId: dto.sessionId,
      language: dto.language,
      status: dto.status,
      startedAt: new Date(),
      metadata: dto.metadata ?? null,
    });

    return session;
  }

  /**
   * Adds an event to an existing session.
   *
   * - Verifies session existence first (404 if not found).
   * - Delegates idempotency to the repository / DB unique index.
   * - On duplicate: throws DuplicateEventException (409 Conflict).
   *   Callers that need pure idempotency (i.e. "just ignore it") can
   *   catch 409 themselves; this service surfaces it explicitly so
   *   API consumers know their request was a no-op.
   */
  async addEvent(
    sessionId: string,
    dto: AddEventDto,
  ): Promise<ConversationEvent> {
    this.logger.log(
      `addEvent: sessionId=${sessionId}, eventId=${dto.eventId}`,
    );

    const session = await this.sessionRepository.findBySessionId(sessionId);
    if (!session) {
      throw new SessionNotFoundException(sessionId);
    }

    const { event, isDuplicate } = await this.eventRepository.insertEvent({
      eventId: dto.eventId,
      sessionId,
      type: dto.type,
      payload: dto.payload,
      timestamp: dto.timestamp ? new Date(dto.timestamp) : new Date(),
    });

    if (isDuplicate) {
      throw new DuplicateEventException(dto.eventId, sessionId);
    }

    return event;
  }

  /**
   * Returns session details with paginated, timestamp-ordered events.
   */
  async getSessionWithEvents(
    sessionId: string,
    query: GetSessionQueryDto,
  ): Promise<SessionWithEvents> {
    this.logger.log(
      `getSessionWithEvents: sessionId=${sessionId}, limit=${query.limit}, offset=${query.offset}`,
    );

    const session = await this.sessionRepository.findBySessionId(sessionId);
    if (!session) {
      throw new SessionNotFoundException(sessionId);
    }

    const { events, total, limit, offset } =
      await this.eventRepository.findEventsBySessionId(
        sessionId,
        query.limit,
        query.offset,
      );

    return {
      session,
      events,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    };
  }

  /**
   * Completes a session idempotently.
   *
   * - 404 if session not found.
   * - 409 if session is already in a terminal state (completed / failed).
   *   This is a deliberate choice: we surface the conflict so callers
   *   understand the state rather than silently accepting the request.
   * - Idempotent for the happy path: completing an already-completed session
   *   returns the session unchanged.
   */
  async completeSession(sessionId: string): Promise<Session> {
    this.logger.log(`completeSession: sessionId=${sessionId}`);

    const existing = await this.sessionRepository.findBySessionId(sessionId);
    if (!existing) {
      throw new SessionNotFoundException(sessionId);
    }

    if (existing.status === SESSION_STATUS.FAILED) {
      throw new SessionAlreadyCompletedException(sessionId);
    }

    // Already completed — idempotent, return as-is
    if (existing.status === SESSION_STATUS.COMPLETED) {
      this.logger.log(
        `completeSession: sessionId=${sessionId} already completed, returning existing.`,
      );
      return existing;
    }

    const completed = await this.sessionRepository.completeSession(
      sessionId,
      new Date(),
    );

    if (!completed) {
      throw new SessionNotFoundException(sessionId);
    }

    return completed;
  }
}
