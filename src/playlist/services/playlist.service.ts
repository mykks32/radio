import { Injectable, Logger } from '@nestjs/common';
import { TrackMeta } from '../playlist.types';
import { RedisRepository } from '../../redis/redis.repository';
import * as fs from 'node:fs';

const KEY = {
  ACTIVE: 'playlist:active',
  STAGED: 'playlist:staged',
  IDX: 'playlist:idx',
  META: 'playlist:meta',
  STAGED_META: 'playlist:staged:meta',
  // CHANGED: global clock so every server instance knows the current
  // track and when it started — used for HLS timestamp alignment
  CLOCK: 'playlist:clock',
} as const;

type PlaylistKey = (typeof KEY)[keyof typeof KEY];

function key<K extends PlaylistKey>(k: K): K {
  return k;
}

// CHANGED: new exported type — RadioStreamService reads this to seek
export interface PlaylistClock {
  trackId: string;
  startedAt: number; // epoch ms, written the moment streaming starts
}

@Injectable()
export class PlaylistService {
  private readonly logger = new Logger(PlaylistService.name);

  // CHANGED: path where Liquidsoap reads the active playlist.
  // NestJS writes this file; Liquidsoap polls it every 10 s.
  private readonly m3uPath = '/tmp/radio_playlist.m3u';

  constructor(private readonly redis: RedisRepository) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

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

  // ─── CHANGED: write M3U file for Liquidsoap ───────────────────────────────
  //
  // Liquidsoap's playlist() source polls this file.
  // We write to a temp path then rename — atomic on Linux,
  // so Liquidsoap never reads a half-written file.
  private async writeM3uFile(tracks: readonly TrackMeta[]): Promise<void> {
    const tmp = this.m3uPath + '.tmp';
    const lines = ['#EXTM3U', ...tracks.map((t) => t.filePath)];
    fs.writeFileSync(tmp, lines.join('\n') + '\n', 'utf8');
    fs.renameSync(tmp, this.m3uPath);
    this.logger.log(`M3U written → ${this.m3uPath} (${tracks.length} tracks)`);
  }

  // ─── Clock (NEW) ──────────────────────────────────────────────────────────

  // Called by RadioProcessor the moment a track starts streaming.
  // Every server reads this to compute their HLS seek offset.
  async setNowPlaying(trackId: string): Promise<void> {
    const clock: PlaylistClock = { trackId, startedAt: Date.now() };
    await this.redis.set(key(KEY.CLOCK), JSON.stringify(clock));
  }

  async getNowPlaying(): Promise<PlaylistClock | null> {
    const raw = await this.redis.get(key(KEY.CLOCK));
    return this.safeParse<PlaylistClock>(raw);
  }

  // ─── Existing logic (unchanged API, M3U side-effect added) ───────────────

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

  // CHANGED: also writes M3U so Liquidsoap picks up the new playlist
  async setPlaylist(tracks: readonly TrackMeta[]): Promise<void> {
    if (tracks.length === 0) throw new Error('Playlist cannot be empty');

    await this.redis.del(key(KEY.ACTIVE));
    for (const track of tracks) {
      await this.redis.rpush(key(KEY.ACTIVE), track.id);
      await this.redis.hset(key(KEY.META), track.id, JSON.stringify(track));
    }
    await this.redis.set(key(KEY.IDX), '0');

    // CHANGED: keep Liquidsoap in sync
    await this.writeM3uFile(tracks);

    this.logger.log(`Playlist set (${tracks.length} tracks)`);
  }

  async addTracks(tracks: readonly TrackMeta[]): Promise<void> {
    if (tracks.length === 0) return;
    for (const track of tracks) {
      await this.redis.rpush(key(KEY.ACTIVE), track.id);
      await this.redis.hset(key(KEY.META), track.id, JSON.stringify(track));
    }
    // CHANGED: refresh M3U after mutation
    const all = await this.getPlaylist();
    await this.writeM3uFile(all);
    this.logger.log(`Added ${tracks.length} tracks`);
  }

  async removeTracks(trackIds: readonly string[]): Promise<void> {
    if (trackIds.length === 0) return;
    for (const id of trackIds) {
      await this.redis.lrem(key(KEY.ACTIVE), 0, id);
    }
    // CHANGED: refresh M3U after mutation
    const all = await this.getPlaylist();
    await this.writeM3uFile(all);
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

  // CHANGED: also writes M3U when the staged playlist becomes active
  async swapToStaged(): Promise<void> {
    const stagedIds = await this.redis.lrange(key(KEY.STAGED), 0, -1);
    if (!stagedIds.length) throw new Error('No staged playlist to swap in');

    await this.redis.del(key(KEY.ACTIVE));
    for (const id of stagedIds) {
      await this.redis.rpush(key(KEY.ACTIVE), id);
      const raw = await this.redis.hget(key(KEY.STAGED_META), id);
      if (raw) await this.redis.hset(key(KEY.META), id, raw);
    }
    await this.redis.set(key(KEY.IDX), '0');
    await this.redis.del(key(KEY.STAGED));

    // CHANGED: write fresh M3U so Liquidsoap picks up swapped playlist
    const all = await this.getPlaylist();
    await this.writeM3uFile(all);

    this.logger.log('Swapped staged playlist to active');
  }

  async appendToActive(tracks: readonly TrackMeta[]): Promise<void> {
    if (tracks.length === 0) return;
    for (const track of tracks) {
      await this.redis.rpush(key(KEY.ACTIVE), track.id);
      await this.redis.hset(key(KEY.META), track.id, JSON.stringify(track));
    }
    const all = await this.getPlaylist();
    await this.writeM3uFile(all);
    this.logger.log(`Appended ${tracks.length} tracks to active`);
  }

  async clear(): Promise<void> {
    await this.redis.del(key(KEY.ACTIVE), key(KEY.IDX));
    // CHANGED: remove the M3U so Liquidsoap goes silent
    if (fs.existsSync(this.m3uPath)) fs.unlinkSync(this.m3uPath);
    this.logger.warn('Playlist cleared');
  }
}
