import { Module } from '@nestjs/common';
import { PlaylistService } from './services/playlist.service';
import { PlaylistBuilderService } from './services/playlist-builder.service';
import { PlaylistCronService } from './services/playlist-cron.service';
import { PlaylistController } from './controllers/playlist.controller';
import { RedisModule } from '../redis/redis.module';
import { KafkaModule } from '../kafka/kafka.module';
import { MusicRepository } from './repositories/music.repository';

@Module({
  imports: [RedisModule, KafkaModule],
  controllers: [PlaylistController],
  providers: [
    PlaylistService,
    PlaylistBuilderService,
    PlaylistCronService,
    MusicRepository,
  ],
  exports: [PlaylistService, PlaylistBuilderService],
})
export class PlaylistModule {}
