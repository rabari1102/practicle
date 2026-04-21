import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Session, SessionDocument } from '../schemas/session.schema';
import { SESSION_STATUS, SessionStatus } from '../../common/constants';
import { DatabaseException } from '../../common/exceptions/domain.exceptions';

export interface CreateSessionPayload {
  sessionId: string;
  language: string;
  status?: SessionStatus;
  startedAt: Date;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class SessionRepository {
  private readonly logger = new Logger(SessionRepository.name);

  constructor(
    @InjectModel(Session.name)
    private readonly sessionModel: Model<SessionDocument>,
  ) {}

  /**
   * Atomically inserts a new session OR returns the existing one.
   *
   * Strategy: findOneAndUpdate with upsert:true and setOnInsert.
   *  - setOnInsert: only applies on INSERT — concurrent callers with the same
   *    sessionId get back the already-inserted document; no partial overwrites.
   *  - returnDocument: 'after' returns the final state.
   *
   * This is the safest MongoDB pattern for idempotent creation because:
   *  1. It is a single atomic server-side operation.
   *  2. Even under heavy concurrency, exactly one document is created.
   *  3. No optimistic locking / retry loops required.
   */
  async upsertSession(payload: CreateSessionPayload): Promise<Session> {
    try {
      const doc = await this.sessionModel
        .findOneAndUpdate(
          { sessionId: payload.sessionId },
          {
            $setOnInsert: {
              sessionId: payload.sessionId,
              language: payload.language.toLowerCase(),
              status: payload.status ?? SESSION_STATUS.INITIATED,
              startedAt: payload.startedAt,
              endedAt: null,
              metadata: payload.metadata ?? null,
            },
          },
          {
            upsert: true,
            new: true,
            runValidators: true,
          },
        )
        .lean<Session>()
        .exec();

      if (!doc) {
        throw new DatabaseException('Upsert returned null document.');
      }

      return doc;
    } catch (error) {
      this.logger.error('SessionRepository.upsertSession failed', error);
      if (error instanceof DatabaseException) throw error;
      throw new DatabaseException(String((error as Error).message));
    }
  }

  async findBySessionId(sessionId: string): Promise<Session | null> {
    try {
      return await this.sessionModel
        .findOne({ sessionId })
        .lean<Session>()
        .exec();
    } catch (error) {
      this.logger.error('SessionRepository.findBySessionId failed', error);
      throw new DatabaseException(String((error as Error).message));
    }
  }

  /**
   * Marks a session as completed atomically.
   *
   * Single atomic operation: findOneAndUpdate with a $nin status filter.
   *  - Matches ONLY documents not already in a terminal state.
   *  - Returns null when:
   *      a) the session does not exist at all, OR
   *      b) a concurrent request just completed it (both are handled by caller).
   *
   * No pre-read is performed here — the service layer already owns the
   * terminal-state guards (failed → 409, completed → early return).
   * Adding a second read here would create a TOCTOU window and duplicate work.
   */
  async completeSession(sessionId: string, endedAt: Date): Promise<Session | null> {
    try {
      const doc = await this.sessionModel
        .findOneAndUpdate(
          {
            sessionId,
            // Atomic guard: only match if not yet in a terminal state.
            // If another concurrent request completed first, this returns null.
            status: { $nin: [SESSION_STATUS.COMPLETED, SESSION_STATUS.FAILED] },
          },
          {
            $set: {
              status: SESSION_STATUS.COMPLETED,
              endedAt,
            },
          },
          { new: true },
        )
        .lean<Session>()
        .exec();

      // null → either session doesn't exist OR a concurrent request just
      // completed it. The service layer distinguishes these cases.
      return doc;
    } catch (error) {
      this.logger.error('SessionRepository.completeSession failed', error);
      throw new DatabaseException(String((error as Error).message));
    }
  }
}
