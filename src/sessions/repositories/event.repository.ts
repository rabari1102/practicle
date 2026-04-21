import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ConversationEvent,
  EventDocument,
} from '../schemas/event.schema';
import { DatabaseException } from '../../common/exceptions/domain.exceptions';
import { EventType } from '../../common/constants';

export interface CreateEventPayload {
  eventId: string;
  sessionId: string;
  type: EventType;
  payload: Record<string, unknown>;
  timestamp: Date;
}

export interface PaginatedEvents {
  events: ConversationEvent[];
  total: number;
  limit: number;
  offset: number;
}

@Injectable()
export class EventRepository {
  private readonly logger = new Logger(EventRepository.name);

  constructor(
    @InjectModel(ConversationEvent.name)
    private readonly eventModel: Model<EventDocument>,
  ) {}

  /**
   * Inserts a new event, idempotent by design.
   *
   * The unique compound index (sessionId, eventId) is the single source of
   * truth for deduplication. If a duplicate is submitted:
   *  - MongoDB throws error code 11000 (duplicate key).
   *  - The caller layer catches this and returns the original event.
   *
   * We do NOT use upsert here because events are immutable. An upsert could
   * silently swallow payload differences on retransmission. Instead we:
   *  1. Attempt a clean insert.
   *  2. On E11000, fetch and return the existing document.
   *  3. Surface a DuplicateEventException only to callers that need to know.
   *
   * This makes the operation safe under concurrent duplicate submissions.
   */
  async insertEvent(
    payload: CreateEventPayload,
  ): Promise<{ event: ConversationEvent; isDuplicate: boolean }> {
    try {
      const doc = await this.eventModel.create(payload);
      return { event: doc.toObject() as ConversationEvent, isDuplicate: false };
    } catch (error: unknown) {
      const mongoError = error as { code?: number };

      // E11000 duplicate key — idempotent: return the original event
      if (mongoError?.code === 11000) {
        this.logger.warn(
          `Duplicate event detected: sessionId=${payload.sessionId}, eventId=${payload.eventId}`,
        );
        const existing = await this.eventModel
          .findOne({ sessionId: payload.sessionId, eventId: payload.eventId })
          .lean<ConversationEvent>()
          .exec();

        if (!existing) {
          throw new DatabaseException(
            'Duplicate key error but existing event not found — race condition.',
          );
        }
        return { event: existing, isDuplicate: true };
      }

      this.logger.error('EventRepository.insertEvent failed', error);
      throw new DatabaseException(String((error as Error).message));
    }
  }

  /**
   * Returns events for a session, ordered by timestamp ASC.
   * Uses the (sessionId, timestamp) compound index — no in-memory sort.
   */
  async findEventsBySessionId(
    sessionId: string,
    limit: number,
    offset: number,
  ): Promise<PaginatedEvents> {
    try {
      const [events, total] = await Promise.all([
        this.eventModel
          .find({ sessionId })
          .sort({ timestamp: 1 })
          .skip(offset)
          .limit(limit)
          .lean<ConversationEvent[]>()
          .exec(),
        this.eventModel.countDocuments({ sessionId }).exec(),
      ]);

      return { events, total, limit, offset };
    } catch (error) {
      this.logger.error('EventRepository.findEventsBySessionId failed', error);
      throw new DatabaseException(String((error as Error).message));
    }
  }
}
