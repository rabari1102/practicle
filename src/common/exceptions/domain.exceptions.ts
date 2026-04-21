import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CODES } from '../constants';

export class SessionNotFoundException extends HttpException {
  constructor(sessionId: string) {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        errorCode: ERROR_CODES.SESSION_NOT_FOUND,
        message: `Session with ID '${sessionId}' was not found.`,
        timestamp: new Date().toISOString(),
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class SessionAlreadyCompletedException extends HttpException {
  constructor(sessionId: string) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        errorCode: ERROR_CODES.SESSION_ALREADY_COMPLETED,
        message: `Session '${sessionId}' is already in a terminal state (completed/failed) and cannot be modified.`,
        timestamp: new Date().toISOString(),
      },
      HttpStatus.CONFLICT,
    );
  }
}

export class DuplicateEventException extends HttpException {
  constructor(eventId: string, sessionId: string) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        errorCode: ERROR_CODES.DUPLICATE_EVENT,
        message: `Event '${eventId}' already exists for session '${sessionId}'. Events are immutable and idempotent.`,
        timestamp: new Date().toISOString(),
      },
      HttpStatus.CONFLICT,
    );
  }
}

export class DatabaseException extends HttpException {
  constructor(message: string) {
    super(
      {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        errorCode: ERROR_CODES.DATABASE_ERROR,
        message: `A database error occurred: ${message}`,
        timestamp: new Date().toISOString(),
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
