import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PlaylistService } from '../services/playlist.service';
import { PlaylistBuilderService } from '../services/playlist-builder.service';
import {
  AddTracksDto,
  RemoveTracksDto,
  BuildPlaylistDto,
} from '../dto/playlist.dto';
import { TrackMeta } from '../playlist.types';

@Controller('playlist')
export class PlaylistController {
  constructor(
    private readonly playlistService: PlaylistService,
    private readonly playlistBuilderService: PlaylistBuilderService,
  ) {}

  @Get()
  async getPlaylist(): Promise<TrackMeta[]> {
    return this.playlistService.getPlaylist();
  }

  @Get('next')
  async getNext(): Promise<TrackMeta | null> {
    return this.playlistService.getNext();
  }

  @Post('build')
  async build(@Body() dto: BuildPlaylistDto): Promise<{ count: number }> {
    const count = await this.playlistBuilderService.build(dto);
    return { count };
  }

  @Post('tracks')
  async addTracks(@Body() dto: AddTracksDto): Promise<{ count: number }> {
    const count = await this.playlistBuilderService.addTracksToActive(
      dto.trackIds,
    );
    return { count };
  }

  @Delete('tracks')
  @HttpCode(HttpStatus.OK)
  async removeTracks(
    @Body() dto: RemoveTracksDto,
  ): Promise<{ removed: number }> {
    await this.playlistService.removeTracks(dto.trackIds);
    return { removed: dto.trackIds.length };
  }

  @Post('swap')
  @HttpCode(HttpStatus.OK)
  async swap(): Promise<{ swapped: boolean }> {
    await this.playlistService.swapToStaged();
    return { swapped: true };
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  async clear(): Promise<{ cleared: boolean }> {
    await this.playlistService.clear();
    return { cleared: true };
  }
}
