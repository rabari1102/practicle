import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { AddEventDto } from './dto/add-event.dto';
import { GetSessionQueryDto } from './dto/get-session-query.dto';
import { Session } from './schemas/session.schema';
import { ConversationEvent } from './schemas/event.schema';
import { SessionWithEvents } from './sessions.service';

@ApiTags('Sessions')
@ApiExtraModels(Session, ConversationEvent)
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  /**
   * POST /sessions
   *
   * Creates a new session or returns the existing one if sessionId is already
   * registered. Fully idempotent and safe under concurrent duplicate calls.
   *
   * Status: 200 always (avoids confusing 201 vs 200 ambiguity for upsert).
   */
  @ApiOperation({
    summary: 'Create or retrieve a session',
    description:
      'Idempotent upsert — creates a new session or returns the existing one if the `sessionId` is already registered. Safe under concurrent duplicate calls.',
  })
  @ApiBody({ type: CreateSessionDto })
  @ApiResponse({
    status: 200,
    description: 'Session created or returned (idempotent).',
    schema: { $ref: getSchemaPath(Session) },
  })
  @ApiResponse({ status: 400, description: 'Validation failed — invalid request body.' })
  @ApiResponse({ status: 500, description: 'Unexpected server or database error.' })
  @Post()
  @HttpCode(HttpStatus.OK)
  async createOrGetSession(
    @Body() dto: CreateSessionDto,
  ): Promise<Session> {
    return this.sessionsService.createOrGetSession(dto);
  }

  /**
   * POST /sessions/:sessionId/events
   *
   * Adds an event to the given session.
   * Returns 201 on creation, 409 on duplicate eventId.
   */
  @ApiOperation({
    summary: 'Add an event to a session',
    description:
      'Appends a conversation event to the specified session. Returns 201 on success, 409 if the `eventId` already exists for this session (events are immutable once stored).',
  })
  @ApiParam({ name: 'sessionId', description: 'The session to append the event to.', example: 'sess-abc-123' })
  @ApiBody({ type: AddEventDto })
  @ApiResponse({
    status: 201,
    description: 'Event created and stored.',
    schema: { $ref: getSchemaPath(ConversationEvent) },
  })
  @ApiResponse({ status: 400, description: 'Validation failed — invalid request body.' })
  @ApiResponse({ status: 404, description: 'Session not found.' })
  @ApiResponse({ status: 409, description: 'Duplicate eventId — this event already exists for the session.' })
  @ApiResponse({ status: 500, description: 'Unexpected server or database error.' })
  @Post(':sessionId/events')
  @HttpCode(HttpStatus.CREATED)
  async addEvent(
    @Param('sessionId') sessionId: string,
    @Body() dto: AddEventDto,
  ): Promise<ConversationEvent> {
    return this.sessionsService.addEvent(sessionId, dto);
  }

  /**
   * GET /sessions/:sessionId
   *
   * Returns session details plus paginated events ordered by timestamp ASC.
   * Query params: limit (default 20, max 100), offset (default 0).
   */
  @ApiOperation({
    summary: 'Get a session with its events',
    description:
      'Returns the session record along with a paginated list of its events, ordered by timestamp ascending. Use `limit` and `offset` for pagination.',
  })
  @ApiParam({ name: 'sessionId', description: 'The session to retrieve.', example: 'sess-abc-123' })
  @ApiResponse({
    status: 200,
    description: 'Session and paginated events returned.',
    schema: {
      properties: {
        session: { $ref: getSchemaPath(Session) },
        events: { type: 'array', items: { $ref: getSchemaPath(ConversationEvent) } },
        pagination: {
          type: 'object',
          properties: {
            total:   { type: 'number', example: 42 },
            limit:   { type: 'number', example: 20 },
            offset:  { type: 'number', example: 0 },
            hasMore: { type: 'boolean', example: true },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Session not found.' })
  @ApiResponse({ status: 500, description: 'Unexpected server or database error.' })
  @Get(':sessionId')
  @HttpCode(HttpStatus.OK)
  async getSession(
    @Param('sessionId') sessionId: string,
    @Query() query: GetSessionQueryDto,
  ): Promise<SessionWithEvents> {
    return this.sessionsService.getSessionWithEvents(sessionId, query);
  }

  /**
   * POST /sessions/:sessionId/complete
   *
   * Transitions the session to 'completed' state.
   * Idempotent: calling again on an already-completed session returns 200.
   * Returns 409 if the session is in a terminal 'failed' state.
   */
  @ApiOperation({
    summary: 'Mark a session as completed',
    description:
      "Transitions the session to the `completed` state. Idempotent — calling again on an already-completed session returns 200. Returns 409 if the session is in the terminal `failed` state.",
  })
  @ApiParam({ name: 'sessionId', description: 'The session to complete.', example: 'sess-abc-123' })
  @ApiResponse({
    status: 200,
    description: 'Session marked as completed (or was already completed — idempotent).',
    schema: { $ref: getSchemaPath(Session) },
  })
  @ApiResponse({ status: 404, description: 'Session not found.' })
  @ApiResponse({ status: 409, description: 'Session is in terminal failed state and cannot be modified.' })
  @ApiResponse({ status: 500, description: 'Unexpected server or database error.' })
  @Post(':sessionId/complete')
  @HttpCode(HttpStatus.OK)
  async completeSession(
    @Param('sessionId') sessionId: string,
  ): Promise<Session> {
    return this.sessionsService.completeSession(sessionId);
  }
}
