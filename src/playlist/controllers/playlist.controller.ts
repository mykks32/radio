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

  /**
   * GET /playlist
   * Get the current active playlist.
   *
   * @returns Array of track metadata.
   */
  @Get()
  async getPlaylist(): Promise<TrackMeta[]> {
    return this.playlistService.getPlaylist();
  }

  /**
   * GET /playlist/next
   * Get the next track in the queue.
   *
   * @returns Next track metadata or null if empty.
   */
  @Get('next')
  async getNext(): Promise<TrackMeta | null> {
    return this.playlistService.getNext();
  }

  /**
   * POST /playlist/build
   * Build playlist from database using filters/config.
   *
   * @param dto Build playlist configuration
   * @returns Number of tracks added
   */
  @Post('build')
  async build(@Body() dto: BuildPlaylistDto): Promise<{ count: number }> {
    const count = await this.playlistBuilderService.build(dto);
    return { count };
  }

  /**
   * POST /playlist/tracks
   * Add tracks manually to active playlist.
   *
   * @param dto List of track IDs
   * @returns Number of tracks added
   */
  @Post('tracks')
  async addTracks(@Body() dto: AddTracksDto): Promise<{ count: number }> {
    const count = await this.playlistBuilderService.addTracksToActive(
      dto.trackIds,
    );
    return { count };
  }

  /**
   * DELETE /playlist/tracks
   * Remove tracks from active playlist.
   *
   * @param dto List of track IDs to remove
   * @returns Number of tracks removed
   */
  @Delete('tracks')
  @HttpCode(HttpStatus.OK)
  async removeTracks(
    @Body() dto: RemoveTracksDto,
  ): Promise<{ removed: number }> {
    await this.playlistService.removeTracks(dto.trackIds);
    return { removed: dto.trackIds.length };
  }

  /**
   * POST /playlist/swap
   * Swap staged playlist into active playlist.
   *
   * @returns Swap status
   */
  @Post('swap')
  @HttpCode(HttpStatus.OK)
  async swap(): Promise<{ swapped: boolean }> {
    await this.playlistService.swapToStaged();
    return { swapped: true };
  }

  /**
   * DELETE /playlist
   * Clear the active playlist.
   *
   * @returns Clear status
   */
  @Delete()
  @HttpCode(HttpStatus.OK)
  async clear(): Promise<{ cleared: boolean }> {
    await this.playlistService.clear();
    return { cleared: true };
  }
}
