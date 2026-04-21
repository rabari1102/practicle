import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @IsOptional()
  MONGODB_URI: string = 'mongodb://localhost:27017/conversation_sessions';

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  MONGODB_POOL_SIZE: number = 10;

  @IsInt()
  @Min(1000)
  @IsOptional()
  MONGODB_CONNECT_TIMEOUT_MS: number = 5000;

  @IsInt()
  @Min(1000)
  @IsOptional()
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: number = 5000;
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Environment validation failed: ${messages}`);
  }

  return validated;
}
