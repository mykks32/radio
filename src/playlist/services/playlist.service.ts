import { Injectable, Logger } from '@nestjs/common';
import { TrackMeta } from '../playlist.types';
import { RedisRepository } from '../../redis/redis.repository';

/**
 * Redis keys used for playlist storage.
 * These represent active queue, staged queue, and metadata maps.
 */
const KEY = {
  ACTIVE: 'playlist:active',
  STAGED: 'playlist:staged',
  IDX: 'playlist:idx',
  META: 'playlist:meta',
  STAGED_META: 'playlist:staged:meta',
} as const;

type PlaylistKey = (typeof KEY)[keyof typeof KEY];

function key<K extends PlaylistKey>(k: K): K {
  return k;
}

/**
 * PlaylistService
 *
 * Core service managing playlist state in Redis.
 *
 * Responsibilities:
 * - Maintain active playback queue
 * - Handle staged playlist preparation
 * - Store and retrieve track metadata
 * - Manage playback index for sequential streaming
 *
 * Designed for real-time audio/radio streaming systems.
 */
@Injectable()
export class PlaylistService {
  private readonly logger = new Logger(PlaylistService.name);

  constructor(private readonly redis: RedisRepository) {}

  // ─────────────────────────────────────────────
  // INTERNAL UTILITIES
  // ─────────────────────────────────────────────
  /**
   * Safely parse JSON stored in Redis.
   * Prevents service crash from corrupted Redis data.
   */
  private safeParse<T>(value: string | null): T | null {
    if (!value) return null;

    try {
      return JSON.parse(value) as T;
    } catch (error: unknown) {
      // Log and ignore invalid JSON instead of crashing service
      this.logger.warn(`JSON parse failed: ${String(error)}`);
      return null;
    }
  }

  /**
   * Fetch all track IDs from active playlist queue.
   */
  private async getIds(): Promise<string[]> {
    return this.redis.lrange(key(KEY.ACTIVE), 0, -1);
  }

  /**
   * Get current playback index safely.
   * Falls back to 0 if missing or invalid.
   */
  private async getIndex(): Promise<number> {
    const raw = await this.redis.get(key(KEY.IDX));

    // Convert string → number safely
    const parsed = raw !== null ? Number.parseInt(raw, 10) : 0;

    // Prevent NaN corruption in index state
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  // ─────────────────────────────────────────────
  // READ OPERATIONS
  // ─────────────────────────────────────────────
  /**
   * Get full active playlist with resolved metadata.
   *
   * Flow:
   * 1. Fetch track IDs from Redis list
   * 2. Resolve metadata from Redis hash
   * 3. Filter invalid/corrupted entries
   *
   * @returns Ordered list of TrackMeta objects
   */
  async getPlaylist(): Promise<TrackMeta[]> {
    const ids = await this.getIds();

    // Early return for empty playlist
    if (ids.length === 0) return [];

    const result: TrackMeta[] = [];

    for (const id of ids) {
      // Fetch serialized metadata from Redis hash
      const raw = await this.redis.hget(key(KEY.META), id);

      // Convert JSON → object safely
      const meta = this.safeParse<TrackMeta>(raw);

      // Only push valid tracks
      if (meta !== null) result.push(meta);
    }

    return result;
  }

  /**
   * Get next track in playlist rotation.
   *
   * Behavior:
   * - Uses circular index (modulo playlist length)
   * - Advances index after selecting current track
   *
   * @returns Next TrackMeta or null if playlist empty
   */
  async getNext(): Promise<TrackMeta | null> {
    const ids = await this.getIds();

    // No tracks available
    if (ids.length === 0) return null;

    const idx = await this.getIndex();

    // Ensure index never exceeds bounds
    const safeIdx = idx % ids.length;

    // Pre-calculate next index for persistence
    const nextIdx = (safeIdx + 1) % ids.length;

    // Persist updated index immediately
    await this.redis.set(key(KEY.IDX), String(nextIdx));

    const currentId = ids[safeIdx];

    // Fetch metadata for current track
    const raw = await this.redis.hget(key(KEY.META), currentId);

    return this.safeParse<TrackMeta>(raw);
  }

  // ─────────────────────────────────────────────
  // WRITE OPERATIONS
  // ─────────────────────────────────────────────
  /**
   * Replace entire active playlist.
   *
   * Steps:
   * 1. Clear existing playlist
   * 2. Insert new track IDs
   * 3. Store metadata
   * 4. Reset playback index
   */
  async setPlaylist(tracks: readonly TrackMeta[]): Promise<void> {
    if (tracks.length === 0) throw new Error('Playlist cannot be empty');

    await this.redis.del(key(KEY.ACTIVE));

    for (const track of tracks) {
      // Push track ID into active queue
      await this.redis.rpush(key(KEY.ACTIVE), track.id);

      // Store metadata separately for fast lookup
      await this.redis.hset(key(KEY.META), track.id, JSON.stringify(track));
    }

    // Reset playback position
    await this.redis.set(key(KEY.IDX), '0');

    this.logger.log(`Playlist set (${tracks.length} tracks)`);
  }

  /**
   * Append tracks to active playlist without resetting state.
   */
  async addTracks(tracks: readonly TrackMeta[]): Promise<void> {
    if (tracks.length === 0) return;

    for (const track of tracks) {
      await this.redis.rpush(key(KEY.ACTIVE), track.id);
      await this.redis.hset(key(KEY.META), track.id, JSON.stringify(track));
    }

    this.logger.log(`Added ${tracks.length} tracks`);
  }

  /**
   * Remove tracks from active playlist.
   */
  async removeTracks(trackIds: readonly string[]): Promise<void> {
    if (trackIds.length === 0) return;

    for (const id of trackIds) {
      // Remove all occurrences of track ID
      await this.redis.lrem(key(KEY.ACTIVE), 0, id);
    }

    this.logger.log(`Removed ${trackIds.length} tracks`);
  }

  /**
   * Create staged playlist (not active yet).
   *
   * Used for previewing or preparing next playlist batch.
   */
  async stagePlaylist(tracks: readonly TrackMeta[]): Promise<void> {
    if (tracks.length === 0) throw new Error('Staged playlist cannot be empty');

    await this.redis.del(key(KEY.STAGED));

    for (const track of tracks) {
      await this.redis.rpush(key(KEY.STAGED), track.id);
      await this.redis.hset(
        key(KEY.STAGED_META),
        track.id,
        JSON.stringify(track),
      );
    }

    this.logger.log(`Staged ${tracks.length} tracks`);
  }

  /**
   * Swap staged playlist into active playlist.
   *
   * Flow:
   * 1. Validate staged playlist exists
   * 2. Replace active queue
   * 3. Copy metadata
   * 4. Reset index
   * 5. Clear staged data
   */
  async swapToStaged(): Promise<void> {
    const stagedIds = await this.redis.lrange(key(KEY.STAGED), 0, -1);

    if (!stagedIds.length) {
      throw new Error('No staged playlist to swap in');
    }

    await this.redis.del(key(KEY.ACTIVE));

    for (const id of stagedIds) {
      await this.redis.rpush(key(KEY.ACTIVE), id);

      // Copy staged metadata into active metadata
      const raw = await this.redis.hget(key(KEY.STAGED_META), id);
      if (raw) await this.redis.hset(key(KEY.META), id, raw);
    }

    await this.redis.set(key(KEY.IDX), '0');
    await this.redis.del(key(KEY.STAGED));

    this.logger.log('Swapped staged playlist to active');
  }

  /**
   * Append tracks without modifying current queue state.
   */
  async appendToActive(tracks: readonly TrackMeta[]): Promise<void> {
    if (tracks.length === 0) return;

    for (const track of tracks) {
      await this.redis.rpush(key(KEY.ACTIVE), track.id);
      await this.redis.hset(key(KEY.META), track.id, JSON.stringify(track));
    }

    this.logger.log(`Appended ${tracks.length} tracks to active`);
  }

  /**
   * Clear active playlist and reset playback state.
   */
  async clear(): Promise<void> {
    await this.redis.del(key(KEY.ACTIVE), key(KEY.IDX));

    this.logger.warn('Playlist cleared');
  }
}
