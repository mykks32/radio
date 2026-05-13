import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE } from '../../queue/queue.constant';
import { RadioStreamService } from './radio-stream.service';
import { PLAY_NEXT_JOB } from '../processors/radio.processor';
import { PlaylistService } from '../../playlist/services/playlist.service';
import { PlaylistBuilderService } from '../../playlist/services/playlist-builder.service';
import { RadioGateway } from '../gateways/radio.gateway';
import { TrackMeta } from '../../playlist/playlist.types';
import { WS_EVENTS } from '../../common/constants/provider.constant';
import { RadioLeaderService } from './radio-leader.service';
import { BuildStrategy } from '../../playlist/playlist.types';

/**
 * When tracksRemaining() falls to this number, begin building the next batch.
 * Set to 2 so the new playlist is staged before the final track starts piping.
 */
const REFILL_THRESHOLD = 2;

@Injectable()
export class RadioService implements OnModuleInit {
  private readonly logger = new Logger(RadioService.name);
  private isRunning = false;

  /** Guards against concurrent refill builds */
  private refillInProgress = false;

  constructor(
    @InjectQueue(QUEUE.RADIO_QUEUE) private readonly queue: Queue,
    private readonly streamService: RadioStreamService,
    private readonly playlistService: PlaylistService,
    private readonly playlistBuilder: PlaylistBuilderService,
    private readonly gateway: RadioGateway,
    private readonly leaderService: RadioLeaderService,
  ) {}

  // Module init
  async onModuleInit() {
    await this.queue.obliterate({ force: true }).catch(() => null);

    // Stream events — only the leader acts on these
    this.streamService.on(WS_EVENTS.TRACK_START, (track: TrackMeta) => {
      if (!this.leaderService.isLeader) return;
      this.gateway.emitTrackStart(track);
    });

    this.streamService.on(WS_EVENTS.TRACK_ENDED, async (track: TrackMeta) => {
      if (!this.leaderService.isLeader) return;

      this.gateway.emitTrackEnded(track);

      // Pre-build next batch when running low — BEFORE enqueuing next track
      await this.maybeRefill();
      await this.enqueueNext();
    });

    // Leader election callbacks
    this.leaderService.onBecomeLeader(async () => {
      this.logger.log('[LEADER] Became leader — starting radio stream');
      this.isRunning = true;
      await this.enqueueNext();
    });

    this.leaderService.onLoseLeadership(async () => {
      this.logger.warn('[LEADER] Lost leadership — stopping stream');
      this.isRunning = false;
      this.streamService.stopCurrent();
      await this.queue.drain();
    });
  }

  // Public API
  get status() {
    return this.isRunning ? 'playing' : 'stopped';
  }

  get nowPlaying() {
    return this.streamService.nowPlaying ?? null;
  }

  async start() {
    if (!this.leaderService.isLeader) {
      this.logger.warn('start() called on non-leader pod — ignored');
      return;
    }
    if (this.isRunning) return;

    this.isRunning = true;
    await this.enqueueNext();
    this.logger.log('Radio started');
  }

  async stop() {
    if (!this.leaderService.isLeader) return;

    this.isRunning = false;
    this.streamService.stopCurrent();
    await this.queue.drain();
    this.logger.log('Radio stopped');
  }

  async skip() {
    if (!this.leaderService.isLeader) return;
    if (!this.isRunning) return;
    this.streamService.stopCurrent();
  }

  // Enqueue
  async enqueueNext() {
    if (!this.isRunning) return;

    const track = await this.playlistService.getNext();

    if (!track) {
      this.logger.warn('[RADIO] Playlist empty — running emergency refill');
      await this.emergencyRefill();
      return;
    }

    await this.queue.add(
      PLAY_NEXT_JOB,
      { track },
      { attempts: 3, backoff: { type: 'fixed', delay: 2_000 }, delay: 0 },
    );
  }

  // Refill logic
  /**
   * Pre-emptive refill — called after each track ends.
   *
   * Flow:
   *  1. Check how many tracks are left in the active list.
   *  2. If ≤ REFILL_THRESHOLD: build a new batch into the STAGED slot.
   *  3. Append staged tracks to ACTIVE without resetting the index.
   *     → The queue keeps incrementing; listeners hear no gap or repeat.
   */
  private async maybeRefill(): Promise<void> {
    if (this.refillInProgress) return;

    try {
      const remaining = await this.playlistService.tracksRemaining();

      if (remaining > REFILL_THRESHOLD) return;

      this.refillInProgress = true;

      this.logger.log(
        `[REFILL] ${remaining} track(s) left — pre-building next batch`,
      );

      // Build into staged slot (swapImmediately: false preserves the idx)
      const built = await this.playlistBuilder.build({
        strategy: BuildStrategy.WEIGHTED_SHUFFLE,
        swapImmediately: false,
      });

      if (!built) {
        this.logger.warn(
          '[REFILL] Builder returned 0 tracks — skipping append',
        );
        return;
      }

      // Append staged tracks to active list without touching the index
      const appended = await this.playlistService.appendStagedToActive();

      this.logger.log(
        `[REFILL] Done — ${appended} new tracks appended to active list`,
      );
    } catch (err) {
      this.logger.error(`[REFILL] Failed: ${String(err)}`);
    } finally {
      this.refillInProgress = false;
    }
  }

  /**
   * Emergency refill — playlist is completely empty.
   * Builds and swaps immediately (hard reset), then retries.
   */
  private async emergencyRefill(): Promise<void> {
    try {
      this.logger.warn('[EMERGENCY REFILL] Rebuilding playlist now');

      await this.playlistBuilder.build({
        strategy: BuildStrategy.WEIGHTED_SHUFFLE,
        swapImmediately: true,
      });

      // Small delay to let Redis writes settle before the next dequeue
      setTimeout(() => void this.enqueueNext(), 500);
    } catch (err) {
      this.logger.error(`[EMERGENCY REFILL] Failed: ${String(err)}`);
    }
  }
}
