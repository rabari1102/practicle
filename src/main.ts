import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { buildValidationPipe } from './common/pipes/validation.pipe';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    /**
     * Buffer logs until the logger is attached; avoids losing early startup logs.
     */
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') ?? 3000;
  const nodeEnv = configService.get<string>('app.nodeEnv') ?? 'development';

  // ── Global Pipes ───────────────────────────────────────────────────────────
  app.useGlobalPipes(buildValidationPipe());

  // ── Global Filters ─────────────────────────────────────────────────────────
  // Must be applied after pipes so validation errors bubble through correctly.
  app.useGlobalFilters(new AllExceptionsFilter());

  // ── Global Interceptors ────────────────────────────────────────────────────
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  // ── Security Hardening ─────────────────────────────────────────────────────
  // Disable X-Powered-By header to avoid exposing stack information.
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  // ── CORS ───────────────────────────────────────────────────────────────────
  // Disabled by default; enable and configure if a browser client is needed.
  // app.enableCors({ origin: configService.get('ALLOWED_ORIGINS') });

  // ── Graceful Shutdown ──────────────────────────────────────────────────────
  app.enableShutdownHooks();

  // ── Swagger / OpenAPI ──────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Conversation Session Service')
    .setDescription(
      'REST API for managing voice-AI conversation sessions and events.\n\n' +
      '**Idempotency**: `POST /sessions` and `POST /sessions/:id/complete` are fully idempotent.\n\n' +
      '**Event deduplication**: duplicate `eventId` submissions return 409 Conflict.',
    )
    .setVersion('1.0.0')
    .addTag('Sessions', 'Session lifecycle and event management')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'list',
      filter: true,
      showExtensions: true,
      tryItOutEnabled: true,
    },
    customSiteTitle: 'Conversation Session Service — API Docs',
  });

  await app.listen(port);

  logger.log(`🚀 Application is running in [${nodeEnv}] mode`);
  logger.log(`🌐 Listening on: http://localhost:${port}`);
  logger.log(`📖 Swagger UI:   http://localhost:${port}/api/docs`);
  logger.log(`📦 MongoDB URI: ${configService.get<string>('mongo.uri')}`);
}

bootstrap().catch((error: Error) => {
  const logger = new Logger('Bootstrap');
  logger.error(`Fatal error during bootstrap: ${error.message}`, error.stack);
  process.exit(1);
});
