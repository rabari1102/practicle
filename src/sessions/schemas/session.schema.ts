import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { SESSION_STATUS, SessionStatus } from '../../common/constants';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type SessionDocument = HydratedDocument<Session>;

@Schema({
  collection: 'sessions',
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
export class Session {
  /**
   * External unique identifier (business key)
   */
  @ApiProperty({ description: 'External unique identifier (business key).', example: 'sess-abc-123' })
  @Prop({
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true,
  })
  sessionId!: string;

  @ApiProperty({
    description: 'Current state of the session lifecycle.',
    enum: Object.values(SESSION_STATUS),
    example: SESSION_STATUS.INITIATED,
  })
  @Prop({
    type: String,
    enum: Object.values(SESSION_STATUS),
    default: SESSION_STATUS.INITIATED,
    required: true,
    index: true,
  })
  status!: SessionStatus;

  /**
   * Language code (en, hi, fr...)
   */
  @ApiProperty({ description: 'BCP-47 language code for the session.', example: 'en' })
  @Prop({
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  })
  language!: string;

  @ApiProperty({ description: 'Timestamp when the session was started.', example: '2024-01-15T10:00:00.000Z' })
  @Prop({
    type: Date,
    required: true,
  })
  startedAt!: Date;

  @ApiPropertyOptional({ description: 'Timestamp when the session ended. Null if still active.', example: null, nullable: true })
  @Prop({
    type: Date,
    default: null,
  })
  endedAt!: Date | null;

  /**
   * Optional metadata
   */
  @ApiPropertyOptional({
    description: 'Arbitrary key-value metadata attached to the session.',
    example: { userId: 'u-001', channel: 'mobile' },
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  @Prop({
    type: Object,
    default: null,
  })
  metadata?: Record<string, unknown> | null;
}

export const SessionSchema = SchemaFactory.createForClass(Session);

/**
 *  UNIQUE INDEX → ensures no duplicate sessions
 */
SessionSchema.index(
  { sessionId: 1 },
  { unique: true, name: 'idx_session_unique' },
);

/**
 *  QUERY INDEX → useful for dashboards / filtering
 */
SessionSchema.index(
  { status: 1, startedAt: -1 },
  { name: 'idx_status_startedAt' },
);