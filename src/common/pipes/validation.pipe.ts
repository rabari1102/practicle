import {
  BadRequestException,
  ValidationPipe as NestValidationPipe,
} from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { ERROR_CODES } from '../constants';

/**
 * Globally-configured validation pipe that:
 *  - Strips unknown properties (whitelist)
 *  - Rejects requests with unknown properties (forbidNonWhitelisted)
 *  - Transforms primitives to their declared types (transform)
 *  - Returns structured, developer-friendly error messages
 */
export function buildValidationPipe(): NestValidationPipe {
  return new NestValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
    exceptionFactory: (errors: ValidationError[]) => {
      const messages = flattenErrors(errors);
      return new BadRequestException({
        statusCode: 400,
        errorCode: ERROR_CODES.VALIDATION_FAILED,
        message: 'Request validation failed.',
        details: messages,
        timestamp: new Date().toISOString(),
      });
    },
  });
}

function flattenErrors(
  errors: ValidationError[],
  parentField = '',
): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  for (const error of errors) {
    const field = parentField
      ? `${parentField}.${error.property}`
      : error.property;

    if (error.constraints) {
      result[field] = Object.values(error.constraints);
    }

    if (error.children && error.children.length > 0) {
      const nested = flattenErrors(error.children, field);
      Object.assign(result, nested);
    }
  }

  return result;
}
