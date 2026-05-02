import { Injectable, Logger } from '@nestjs/common';
import { TrackMeta } from '../playlist.types';
import { RedisRepository } from '../../redis/redis.repository';

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

  // Logics
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

  async setPlaylist(tracks: readonly TrackMeta[]): Promise<void> {
    if (tracks.length === 0) throw new Error('Playlist cannot be empty');

    await this.redis.del(key(KEY.ACTIVE));

    for (const track of tracks) {
      await this.redis.rpush(key(KEY.ACTIVE), track.id);
      await this.redis.hset(key(KEY.META), track.id, JSON.stringify(track));
    }

    await this.redis.set(key(KEY.IDX), '0');

    this.logger.log(`Playlist set (${tracks.length} tracks)`);
  }

  async addTracks(tracks: readonly TrackMeta[]): Promise<void> {
    if (tracks.length === 0) return;

    for (const track of tracks) {
      await this.redis.rpush(key(KEY.ACTIVE), track.id);
      await this.redis.hset(key(KEY.META), track.id, JSON.stringify(track));
    }

    this.logger.log(`Added ${tracks.length} tracks`);
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

    await this.redis.del(key(KEY.ACTIVE));

    for (const id of stagedIds) {
      await this.redis.rpush(key(KEY.ACTIVE), id);

      const raw = await this.redis.hget(key(KEY.STAGED_META), id);
      if (raw) await this.redis.hset(key(KEY.META), id, raw);
    }

    await this.redis.set(key(KEY.IDX), '0');
    await this.redis.del(key(KEY.STAGED));

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
    await this.redis.del(key(KEY.ACTIVE), key(KEY.IDX));
    this.logger.warn('Playlist cleared');
  }
}
