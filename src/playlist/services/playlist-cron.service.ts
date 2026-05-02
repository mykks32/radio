import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PlaylistBuilderService } from './playlist-builder.service';
// import { PlaylistService } from './playlist.service';
import { BuildStrategy } from '../playlist.types';

@Injectable()
export class PlaylistCronService {
  private readonly logger = new Logger(PlaylistCronService.name);

  constructor(
    private readonly builder: PlaylistBuilderService,
    // private readonly playlist: PlaylistService,
  ) {}

  /**
   * 6-hour playlist refresh job
   *
   * Schedule: 00:00, 06:00, 12:00, 18:00
   * Cron: '0 0,6,12,18 * * *'
   *
   * Behavior:
   * - Rebuilds playlist using WEIGHTED_SHUFFLE strategy
   * - Immediately swaps into active playlist
   * - Completely replaces existing queue (no merging)
   *
   * Use case:
   * Keeps radio stream content fresh throughout the day.
   */
  @Cron('0 0,6,12,18 * * *')
  async sixHourRefresh(): Promise<void> {
    this.logger.log('[CRON] 6-hour playlist refresh started');

    try {
      // Rebuild playlist using weighted shuffle algorithm
      const count = await this.builder.build({
        strategy: BuildStrategy.WEIGHTED_SHUFFLE,
        swapImmediately: true,
      });

      // Log successful refresh with track count
      this.logger.log(`[CRON] Active playlist replaced — ${count} tracks`);
    } catch (err: unknown) {
      // Ensure cron failure does not crash service
      this.logger.error(
        `[CRON] 6-hour refresh failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Weekly top-played refresh job
   *
   * Schedule: Every Monday at 08:00
   * Cron: '0 8 * * 1'
   *
   * Behavior:
   * - Builds playlist from most played tracks
   * - Limits result to top 100 tracks
   * - Immediately activates new playlist
   *
   * Use case:
   * Provides weekly curated "popular hits" playlist.
   */
  @Cron('0 8 * * 1')
  async weeklyTopPlayed(): Promise<void> {
    this.logger.log('[CRON] Weekly top-played refresh started');

    try {
      // Build playlist based on play count ranking
      const count = await this.builder.build({
        strategy: BuildStrategy.TOP_PLAYED,
        limit: 100,
        swapImmediately: true,
      });

      this.logger.log(`[CRON] Weekly top-played loaded — ${count} tracks`);
    } catch (err: unknown) {
      // Prevent cron crash propagation
      this.logger.error(
        `[CRON] Weekly refresh failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
