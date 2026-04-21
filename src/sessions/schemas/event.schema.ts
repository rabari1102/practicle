import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { EVENT_TYPE, EventType } from '../../common/constants';
import { ApiProperty } from '@nestjs/swagger';

export type EventDocument = HydratedDocument<ConversationEvent>;

@Schema({
  collection: 'conversation_events',
  timestamps: false,
  versionKey: false,
  toJSON: {
    virtuals: false,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret['_id'];
      return ret;
    },
  },
  toObject: {
    virtuals: false,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret['_id'];
      return ret;
    },
  },
})
export class ConversationEvent {
  /**
   * Unique per session (idempotency key)
   */
  @ApiProperty({ description: 'Unique event identifier (idempotency key within the session).', example: 'evt-001' })
  @Prop({
    type: String,
    required: true,
    trim: true,
  })
  eventId!: string;

  /**
   * Parent session reference
   */
  @ApiProperty({ description: 'The sessionId this event belongs to.', example: 'sess-abc-123' })
  @Prop({
    type: String,
    required: true,
    index: true,
    trim: true,
  })
  sessionId!: string;

  @ApiProperty({
    description: 'Type of conversation event.',
    enum: Object.values(EVENT_TYPE),
    example: EVENT_TYPE.USER_SPEECH,
  })
  @Prop({
    type: String,
    enum: Object.values(EVENT_TYPE),
    required: true,
  })
  type!: EventType;

  @ApiProperty({
    description: 'Arbitrary event payload.',
    example: { text: 'Hello, how can I help you?' },
    type: 'object',
    additionalProperties: true,
  })
  @Prop({
    type: Object,
    required: true,
  })
  payload!: Record<string, unknown>;

  @ApiProperty({ description: 'Timestamp of when the event occurred.', example: '2024-01-15T10:30:00.000Z' })
  @Prop({
    type: Date,
    required: true,
  })
  timestamp!: Date;
}

export const ConversationEventSchema =
  SchemaFactory.createForClass(ConversationEvent);

/**
 * UNIQUE INDEX → prevents duplicate events (idempotency)
 */
ConversationEventSchema.index(
  { sessionId: 1, eventId: 1 },
  { unique: true, name: 'idx_session_event_unique' },
);

/**
 * SORT INDEX → efficient event retrieval
 */
ConversationEventSchema.index(
  { sessionId: 1, timestamp: 1 },
  { name: 'idx_session_timestamp' },
);