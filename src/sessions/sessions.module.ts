import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { SessionRepository } from './repositories/session.repository';
import { EventRepository } from './repositories/event.repository';
import { Session, SessionSchema } from './schemas/session.schema';
import {
  ConversationEvent,
  ConversationEventSchema,
} from './schemas/event.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Session.name, schema: SessionSchema },
      { name: ConversationEvent.name, schema: ConversationEventSchema },
    ]),
  ],
  controllers: [SessionsController],
  providers: [SessionsService, SessionRepository, EventRepository],
  exports: [SessionsService],
})
export class SessionsModule {}
