import { Module } from '@nestjs/common';
import { PlaylistService } from './services/playlist.service';
import { PlaylistBuilderService } from './services/playlist-builder.service';
import { PlaylistCronService } from './services/playlist-cron.service';
import { PlaylistController } from './controllers/playlist.controller';

@Module({
  controllers: [PlaylistController],
  providers: [PlaylistService, PlaylistBuilderService, PlaylistCronService],
  exports: [PlaylistService, PlaylistBuilderService],
})
export class PlaylistModule {}
