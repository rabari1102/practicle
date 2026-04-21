import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { EVENT_TYPE, EventType } from '../../common/constants';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddEventDto {
  @ApiProperty({
    description: 'Unique identifier for this event (idempotency key per session).',
    example: 'evt-001',
    maxLength: 128,
  })
  @IsString({ message: 'eventId must be a string.' })
  @IsNotEmpty({ message: 'eventId must not be empty.' })
  @MaxLength(128, { message: 'eventId must not exceed 128 characters.' })
  eventId!: string;

  @ApiProperty({
    description: 'Type of conversation event.',
    enum: Object.values(EVENT_TYPE),
    example: EVENT_TYPE.USER_SPEECH,
  })
  @IsIn(Object.values(EVENT_TYPE), {
    message: `type must be one of: ${Object.values(EVENT_TYPE).join(', ')}.`,
  })
  type!: EventType;

  @ApiProperty({
    description: 'Arbitrary event payload data.',
    example: { text: 'Hello, how can I help you?' },
    type: 'object',
    additionalProperties: true,
  })
  @IsObject({ message: 'payload must be a plain object.' })
  @Type(() => Object)
  payload!: Record<string, unknown>;

  /**
   * ISO 8601 timestamp. If omitted, the service uses the current server time.
   */
  @ApiPropertyOptional({
    description:
      'ISO 8601 timestamp of when the event occurred. Defaults to current server time if omitted.',
    example: '2024-01-15T10:30:00.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'timestamp must be a valid ISO 8601 date string.' })
  timestamp?: string;
}
