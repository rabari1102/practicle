import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ERROR_CODES } from '../constants';

interface ErrorResponse {
  statusCode: number;
  errorCode: string;
  message: string;
  path: string;
  method: string;
  timestamp: string;
  requestId?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let errorBody: Partial<ErrorResponse>;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        errorBody = exceptionResponse as Partial<ErrorResponse>;
      } else {
        errorBody = {
          message: String(exceptionResponse),
          errorCode: ERROR_CODES.INTERNAL_ERROR,
        };
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      const err = exception as Error;

      this.logger.error(
        `Unhandled exception: ${err?.message ?? 'Unknown error'}`,
        err?.stack,
      );

      errorBody = {
        message: 'An unexpected internal server error occurred.',
        errorCode: ERROR_CODES.INTERNAL_ERROR,
      };
    }

    const errorResponse: ErrorResponse = {
      statusCode: status,
      errorCode: errorBody.errorCode ?? ERROR_CODES.INTERNAL_ERROR,
      message: errorBody.message ?? 'An error occurred.',
      path: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
    };

    // Log 5xx errors as errors, 4xx as warnings
    if (status >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} → ${status}: ${errorResponse.message}`,
      );
    } else {
      this.logger.warn(
        `[${request.method}] ${request.url} → ${status}: ${errorResponse.message}`,
      );
    }

    response.status(status).json(errorResponse);
  }
}
