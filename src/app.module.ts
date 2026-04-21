import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { SessionsModule } from './sessions/sessions.module';
import { appConfig, mongoConfig } from './config/configuration';
import { validate } from './config/env.validation';

@Module({
  imports: [
    /**
     * ConfigModule: loads .env, validates env vars at startup.
     * isGlobal: true — no need to import ConfigModule in every feature module.
     */
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, mongoConfig],
      validate,
      cache: true,
    }),

    /**
     * MongooseModule: async factory uses ConfigService to read validated env.
     * Connection options are tuned for reliability and observability.
     */
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('mongo.uri'),
        // Connection pool — keep alive, reasonable pool size
        maxPoolSize: config.get<number>('mongo.poolSize') ?? 10,
        minPoolSize: 2,
        // Timeouts
        connectTimeoutMS: config.get<number>('mongo.connectTimeoutMs') ?? 5000,
        serverSelectionTimeoutMS:
          config.get<number>('mongo.serverSelectionTimeoutMs') ?? 5000,
        socketTimeoutMS: 45000,
        // Automatically retry writes on transient network errors
        retryWrites: true,
        retryReads: true,
        // Write concern — majority ensures durability
        w: 'majority',
      }),
    }),

    SessionsModule,
  ],
})
export class AppModule {}
