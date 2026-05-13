import { Injectable, Logger } from '@nestjs/common';
import { TrackMeta } from '../playlist.types';
import { RedisRepository } from '../../redis/redis.repository';

const KEY = {
  ACTIVE: 'playlist:active',
  STAGED: 'playlist:staged',
  IDX: 'playlist:idx',
  META: 'playlist:meta',
  STAGED_META: 'playlist:staged:meta',
  NOW_PLAYING_TIME: 'playlist:now_playing_time',
} as const;

type PlaylistKey = (typeof KEY)[keyof typeof KEY];

function key<K extends PlaylistKey>(k: K): K {
  return k;
}

export interface NowPlayingTime {
  trackId: string;
  startedAt: number; // epoch ms
  durationMs: number; // total track duration ms
}

@Injectable()
export class PlaylistService {
  private readonly logger = new Logger(PlaylistService.name);

  constructor(private readonly redis: RedisRepository) {}

  // Helpers
  private safeParse<T>(value: string | null): T | null {
    if (!value) return null;

    try {
      return JSON.parse(value) as T;
    } catch (error: unknown) {
      this.logger.warn(`JSON parse failed: ${String(error)}`);
      return null;
    }
  }

  private async getIds(): Promise<string[]> {
    return this.redis.lrange(key(KEY.ACTIVE), 0, -1);
  }

  private async getIndex(): Promise<number> {
    const raw = await this.redis.get(key(KEY.IDX));
    const parsed = raw !== null ? Number.parseInt(raw, 10) : 0;
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  // Reads
  async getPlaylist(): Promise<TrackMeta[]> {
    const ids = await this.getIds();
    if (ids.length === 0) return [];

    const result: TrackMeta[] = [];

    for (const id of ids) {
      const raw = await this.redis.hget(key(KEY.META), id);
      const meta = this.safeParse<TrackMeta>(raw);
      if (meta !== null) result.push(meta);
    }

    return result;
  }

  async getNext(): Promise<TrackMeta | null> {
    const ids = await this.getIds();
    if (ids.length === 0) return null;

    const idx = await this.getIndex();
    const safeIdx = idx % ids.length;
    const nextIdx = (safeIdx + 1) % ids.length;

    await this.redis.set(key(KEY.IDX), String(nextIdx));

    const currentId = ids[safeIdx];
    const raw = await this.redis.hget(key(KEY.META), currentId);

    return this.safeParse<TrackMeta>(raw);
  }

  /**
   * How many unplayed tracks remain before the playlist wraps around.
   *
   * Example: 5 tracks, currently at idx 3 → 1 track remains (idx 4).
   * Returns 0 when we're on the last track, or when playlist is empty.
   */
  async tracksRemaining(): Promise<number> {
    const ids = await this.getIds();
    if (ids.length === 0) return 0;

    const idx = await this.getIndex();
    const safeIdx = idx % ids.length;

    // safeIdx is the track just handed to the queue;
    // remaining = everything after it before wrap.
    return Math.max(0, ids.length - safeIdx - 1);
  }

  // Track timing
  /**
   * Called by RadioStreamService when it starts streaming a track.
   * Stored in Redis so any pod can inspect remaining play time.
   */
  async recordTrackStart(trackId: string, durationMs: number): Promise<void> {
    const payload: NowPlayingTime = {
      trackId,
      startedAt: Date.now(),
      durationMs,
    };
    await this.redis.set(key(KEY.NOW_PLAYING_TIME), JSON.stringify(payload));
  }

  // Seamless append: staged → active (no idx reset)
  /**
   * Appends all staged tracks to the ACTIVE list WITHOUT resetting the index.
   *
   * This is the auto-refill path. Because we append rather than swap,
   * the index keeps advancing naturally — no gap, no repeat, no idx=0 jump.
   *
   * After the call, the staged list is cleared.
   */
  async appendStagedToActive(): Promise<number> {
    const stagedIds = await this.redis.lrange(key(KEY.STAGED), 0, -1);

    if (!stagedIds.length) {
      this.logger.warn('appendStagedToActive called but staged list is empty');
      return 0;
    }

    for (const id of stagedIds) {
      await this.redis.rpush(key(KEY.ACTIVE), id);

      const raw = await this.redis.hget(key(KEY.STAGED_META), id);
      if (raw) await this.redis.hset(key(KEY.META), id, raw);
    }

    await this.redis.del(key(KEY.STAGED), key(KEY.STAGED_META));

    this.logger.log(
      `[REFILL] Appended ${stagedIds.length} staged tracks to active (no idx reset)`,
    );
    return stagedIds.length;
  }

  async removeTracks(trackIds: readonly string[]): Promise<void> {
    if (trackIds.length === 0) return;

    for (const id of trackIds) {
      await this.redis.lrem(key(KEY.ACTIVE), 0, id);
    }

    this.logger.log(`Removed ${trackIds.length} tracks`);
  }

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

  async swapToStaged(): Promise<void> {
    const stagedIds = await this.redis.lrange(key(KEY.STAGED), 0, -1);

    if (!stagedIds.length) {
      throw new Error('No staged playlist to swap in');
    }

    await this.redis.del(key(KEY.ACTIVE), key(KEY.META));

    for (const id of stagedIds) {
      await this.redis.rpush(key(KEY.ACTIVE), id);

      const raw = await this.redis.hget(key(KEY.STAGED_META), id);
      if (raw) await this.redis.hset(key(KEY.META), id, raw);
    }

    await this.redis.set(key(KEY.IDX), '0');
    await this.redis.del(key(KEY.STAGED), key(KEY.STAGED_META));

    this.logger.log('Swapped staged playlist to active');
  }

  async appendToActive(tracks: readonly TrackMeta[]): Promise<void> {
    if (tracks.length === 0) return;

    for (const track of tracks) {
      await this.redis.rpush(key(KEY.ACTIVE), track.id);
      await this.redis.hset(key(KEY.META), track.id, JSON.stringify(track));
    }

    this.logger.log(`Appended ${tracks.length} tracks to active`);
  }

  async clear(): Promise<void> {
    await this.redis.del(
      key(KEY.ACTIVE),
      key(KEY.STAGED),
      key(KEY.IDX),
      key(KEY.META),
      key(KEY.STAGED_META),
      key(KEY.NOW_PLAYING_TIME),
    );
    this.logger.warn('Playlist cleared');
  }
}
