import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { RedisRepository } from '../../redis/redis.repository';
import { v4 as uuidv4 } from 'uuid';

const KEY = {
  LEADER_KEY: 'radio:leader',
  // leader lease duration
  LEADER_TTL_MS: 8_000,
  // how often the leader renews its lease
  HEARTBEAT_MS: 3_000,
  // how often a follower tries to become leader
  RETRY_MS: 4_000,
};

type LeaderKey = (typeof KEY)[keyof typeof KEY];

function key<K extends LeaderKey>(k: K): K {
  return k;
}

/**
 * Distributed leader election using a Redis TTL key.
 *
 * Only ONE pod should stream audio to Icecast at a time.
 * The leader holds `radio:leader` with its podId as value and a short TTL.
 * It renews the TTL via heartbeat. If the pod dies the TTL expires and the
 * other pod wins the next election attempt.
 *
 * Usage:
 *   if (await this.leaderService.isLeader()) { ...stream... }
 */
@Injectable()
export class RadioLeaderService implements OnModuleInit, OnModuleDestroy {
  /**
   * START
   *
   * Pod A → tries leader
   * Pod B → tries leader
   *
   * Redis:
   * radio:leader = podA
   *
   * --------------------------------
   *
   * Pod A streams audio
   *
   * Pod B waits
   *
   * --------------------------------
   *
   * Pod A crashes
   *
   * No heartbeat
   *
   * TTL expires
   *
   * Redis deletes key
   *
   * --------------------------------
   *
   * Pod B retries
   *
   * Pod B becomes leader
   *
   * Pod B starts streaming
   */
  private readonly logger = new Logger(RadioLeaderService.name);

  /** Stable identity for this process/pod */
  readonly podId = uuidv4();

  private heartbeatTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private _isLeader = false;

  /** Callbacks registered by RadioService */
  private onBecomeLeaderCb: (() => Promise<void>) | null = null;
  private onLoseLeadershipCb: (() => Promise<void>) | null = null;

  constructor(private readonly redis: RedisRepository) {}

  onModuleInit() {
    this.logger.log(`Pod ID: ${this.podId}`);
    void this.tryElect();
  }

  onModuleDestroy() {
    this.clearTimers();
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  get isLeader(): boolean {
    return this._isLeader;
  }

  onBecomeLeader(cb: () => Promise<void>) {
    this.onBecomeLeaderCb = cb;
  }

  onLoseLeadership(cb: () => Promise<void>) {
    this.onLoseLeadershipCb = cb;
  }

  // ─── Election logic ────────────────────────────────────────────────────────

  /**
   * Attempt to win the election using SET NX PX (atomic).
   * If successful → become leader and start heartbeat.
   * If failed    → schedule retry.
   */
  private async tryElect(): Promise<void> {
    try {
      // SET radio:leader <podId> NX PX <ttl>
      // Returns <string> if key was set (we won), null if key already existed
      const result = await this.redis.setNxPx(
        key(KEY.LEADER_KEY),
        this.podId,
        key(KEY.LEADER_TTL_MS),
      );

      if (result === 'OK') {
        await this.becomeLeader();
      } else {
        // Someone else holds the key — schedule a retry
        this.scheduleRetry();
      }
    } catch (err) {
      this.logger.error(`Election error: ${String(err)}`);
      this.scheduleRetry();
    }
  }

  private async becomeLeader(): Promise<void> {
    this._isLeader = true;
    this.logger.log(`[LEADER] This pod is now the stream leader`);
    this.startHeartbeat();

    if (this.onBecomeLeaderCb) {
      await this.onBecomeLeaderCb().catch((e) =>
        this.logger.error(`onBecomeLeader callback failed: ${String(e)}`),
      );
    }
  }

  /**
   * Heartbeat: renew TTL only if we still own the key.
   * If Redis was flushed or another pod somehow took over, we step down.
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      try {
        const owner = await this.redis.get(key(KEY.LEADER_KEY));

        if (owner !== this.podId) {
          // We lost leadership (Redis restart / TTL expired before renewal)
          this.logger.warn('[LEADER] Lost leadership — stepping down');
          await this.stepDown();
          return;
        }

        // Renew TTL
        await this.redis.pexpire(key(KEY.LEADER_KEY), key(KEY.LEADER_TTL_MS));
      } catch (err) {
        this.logger.error(`Heartbeat error: ${String(err)}`);
      }
    }, key(KEY.HEARTBEAT_MS));
  }

  private async stepDown(): Promise<void> {
    this._isLeader = false;
    this.clearTimers();

    if (this.onLoseLeadershipCb) {
      await this.onLoseLeadershipCb().catch((e) =>
        this.logger.error(`onLoseLeadership callback failed: ${String(e)}`),
      );
    }

    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    this.retryTimer = setTimeout(() => void this.tryElect(), key(KEY.RETRY_MS));
  }

  private clearTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
}
