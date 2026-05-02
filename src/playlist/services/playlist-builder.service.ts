import { Injectable, Logger } from '@nestjs/common';
import { PlaylistService } from './playlist.service';
import { BuildOptions, BuildStrategy, TrackMeta } from '../playlist.types';
import { KafkaService } from '../../kafka/kafka.service';
import { MusicRepository } from '../repositories/music.repository';

/**
 * PlaylistBuilderService
 *
 * Responsible for generating playlists from the music library
 * using different strategies and pushing them into PlaylistService.
 *
 * Responsibilities:
 * - Build playlists using different selection strategies
 * - Stage or immediately activate playlists
 * - Append tracks manually
 * - Emit Kafka events for system-wide synchronization
 */
@Injectable()
export class PlaylistBuilderService {
  private readonly logger = new Logger(PlaylistBuilderService.name);

  constructor(
    private readonly musicRepo: MusicRepository,
    private readonly playlistService: PlaylistService,
    private readonly kafka: KafkaService,
  ) {}

  /**
   * Build a playlist based on the selected strategy.
   *
   * Flow:
   * 1. Select tracks from repository based on strategy
   * 2. Transform into TrackMeta format
   * 3. Stage playlist in Redis
   * 4. Optionally swap immediately to active
   * 5. Emit Kafka event for system sync
   *
   * @param opts Build configuration options
   * @returns Number of tracks included in playlist
   */
  async build(opts: BuildOptions = {}): Promise<number> {
    const {
      strategy = BuildStrategy.WEIGHTED_SHUFFLE,
      genre,
      limit,
      swapImmediately = false,
    } = opts;

    this.logger.log(`Building playlist — strategy: ${strategy}`);

    let tracks: TrackMeta[] = [];

    // ─────────────────────────────────────────────
    // STRATEGY SELECTION LOGIC
    // ─────────────────────────────────────────────
    switch (strategy) {
      /**
       * Weighted shuffle ensures popular tracks appear more often
       * while still maintaining randomness.
       */
      case BuildStrategy.WEIGHTED_SHUFFLE:
        tracks = this.musicRepo.findWeightedShuffle(limit);
        break;

      /**
       * Top played tracks based on historical play counts.
       */
      case BuildStrategy.TOP_PLAYED:
        tracks = this.musicRepo.findTopPlayed(limit ?? 100);
        break;

      /**
       * Filter tracks by genre (requires genre param).
       */
      case BuildStrategy.GENRE:
        if (!genre) throw new Error('genre is required for GENRE strategy');
        tracks = this.musicRepo.findByGenre(genre);

        // Apply limit if provided
        if (limit) tracks = tracks.slice(0, limit);
        break;

      /**
       * Full library scan of active tracks only.
       */
      case BuildStrategy.FULL_LIBRARY:
        tracks = this.musicRepo.findAllActive();

        if (limit) tracks = tracks.slice(0, limit);
        break;

      default:
        throw new Error(`Unknown build strategy: ${strategy}`);
    }

    // ─────────────────────────────────────────────
    // SAFETY CHECK
    // ─────────────────────────────────────────────
    if (!tracks.length) {
      this.logger.warn('No active tracks found in DB — skipping build');
      return 0;
    }

    // Convert DB model → playlist metadata format
    const meta: TrackMeta[] = tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      filePath: t.filePath,
    }));

    // Store as staged playlist (not active yet)
    await this.playlistService.stagePlaylist(meta);

    // Optional: immediately activate playlist
    if (swapImmediately) {
      await this.playlistService.swapToStaged();
    }

    // Emit system-wide event (useful for microservices / analytics)
    await this.kafka.send('radio.events', {
      event: 'PLAYLIST_BUILT',
      strategy,
      count: tracks.length,
      swappedImmediately: swapImmediately,
      ts: Date.now(),
    });

    this.logger.log(`Built ${tracks.length} tracks (swap=${swapImmediately})`);

    return tracks.length;
  }

  /**
   * Add specific tracks directly into the active playlist.
   *
   * Flow:
   * 1. Fetch tracks from DB by IDs
   * 2. Convert to TrackMeta format
   * 3. Append to active playlist
   * 4. Emit Kafka event for tracking
   *
   * @param trackIds Array of track IDs
   * @returns Number of successfully added tracks
   */
  async addTracksToActive(trackIds: string[]): Promise<number> {
    // Fetch track details from repository
    const tracks = await this.musicRepo.findByIds(trackIds);

    if (!tracks.length) {
      this.logger.warn(
        `No active tracks found for IDs: ${trackIds.join(', ')}`,
      );
      return 0;
    }

    // Map DB entities → playlist metadata
    const meta: TrackMeta[] = tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      filePath: t.filePath,
    }));

    // Append into active playlist queue
    await this.playlistService.appendToActive(meta);

    // Emit event for analytics / sync across services
    await this.kafka.send('radio.events', {
      event: 'TRACKS_ADDED_MANUALLY',
      count: tracks.length,
      trackIds: tracks.map((t) => t.id),
      ts: Date.now(),
    });

    return tracks.length;
  }
}
