export const SESSION_STATUS = {
  INITIATED: 'initiated',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export const EVENT_TYPE = {
  USER_SPEECH: 'user_speech',
  BOT_SPEECH: 'bot_speech',
  SYSTEM: 'system',
} as const;

export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  DEFAULT_OFFSET: 0,
} as const;

export const ERROR_CODES = {
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_ALREADY_COMPLETED: 'SESSION_ALREADY_COMPLETED',
  SESSION_ALREADY_FAILED: 'SESSION_ALREADY_FAILED',
  DUPLICATE_EVENT: 'DUPLICATE_EVENT',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
} as const;

export type SessionStatus = (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];
export type EventType = (typeof EVENT_TYPE)[keyof typeof EVENT_TYPE];
