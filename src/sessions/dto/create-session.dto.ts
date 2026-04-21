import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { SESSION_STATUS } from '../../common/constants';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSessionDto {
  @ApiProperty({
    description: 'Unique external identifier for this session (business key).',
    example: 'sess-abc-123',
    maxLength: 128,
  })
  @IsString({ message: 'sessionId must be a string.' })
  @IsNotEmpty({ message: 'sessionId must not be empty.' })
  @MaxLength(128, { message: 'sessionId must not exceed 128 characters.' })
  sessionId!: string;

  /**
   * BCP-47 language tag: one or more subtags separated by hyphens.
   * Examples: "en", "fr", "en-US", "zh-Hans"
   */
  @ApiProperty({
    description: 'BCP-47 language tag for the session (e.g. "en", "fr", "en-US").',
    example: 'en',
  })
  @IsString({ message: 'language must be a string.' })
  @IsNotEmpty({ message: 'language must not be empty.' })
  @Matches(/^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{1,8})*$/, {
    message:
      'language must be a valid BCP-47 language tag (e.g. "en", "fr", "en-US").',
  })
  language!: string;

  /**
   * Optional initial status.
   * Restricted to non-terminal states only — a session cannot be born
   * already completed or failed. Those states are reached via lifecycle
   * transitions (e.g. POST /sessions/:id/complete).
   *
   * Defaults to 'initiated' if omitted.
   */
  @ApiPropertyOptional({
    description:
      "Initial session status. Only 'initiated' or 'active' are allowed on creation. Defaults to 'initiated'.",
    enum: [SESSION_STATUS.INITIATED, SESSION_STATUS.ACTIVE],
    example: SESSION_STATUS.INITIATED,
  })
  @IsOptional()
  @IsIn([SESSION_STATUS.INITIATED, SESSION_STATUS.ACTIVE], {
    message: `status on creation must be '${SESSION_STATUS.INITIATED}' or '${SESSION_STATUS.ACTIVE}'.`,
  })
  status?: typeof SESSION_STATUS.INITIATED | typeof SESSION_STATUS.ACTIVE;

  @ApiPropertyOptional({
    description: 'Arbitrary key-value metadata to store alongside the session.',
    example: { userId: 'u-001', channel: 'mobile' },
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject({ message: 'metadata must be a plain object.' })
  @Type(() => Object)
  metadata?: Record<string, unknown>;
}
