import { type RedisClientType } from 'redis';
import { Inject, Injectable } from '@nestjs/common';
import { PROVIDER } from '../common/constant';

/**
 * RedisRepository
 *
 * Thin abstraction layer over Redis client.
 *
 * Responsibilities:
 * - Provide safe typed access to Redis operations
 * - Wrap raw Redis commands into reusable methods
 * - Add JSON serialization helpers
 * - Normalize Redis behavior across the application
 *
 * Acts as the single gateway for all Redis interactions in the system.
 */
@Injectable()
export class RedisRepository {
  constructor(
    @Inject(PROVIDER.redis)
    private readonly client: RedisClientType,
  ) {}

  // ─────────────────────────────────────────────
  // STRING OPERATIONS
  // ─────────────────────────────────────────────
  /**
   * Get string value by key.
   */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /**
   * Set string value by key.
   *
   * Optionally supports TTL (expiration in seconds).
   */
  async set(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<string | null> {
    return ttlSeconds
      ? this.client.set(key, value, { EX: ttlSeconds })
      : this.client.set(key, value);
  }

  /**
   * Set value with explicit expiry.
   * Preferred when TTL is always required.
   */
  async setWithExpiry(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<string | null> {
    return this.client.setEx(key, ttlSeconds, value);
  }

  /**
   * Delete one or more keys.
   */
  async del(...keys: [string, ...string[]]): Promise<number> {
    return this.client.del(keys);
  }

  /**
   * Check if a key exists.
   */
  async exists(key: string): Promise<number> {
    return this.client.exists(key);
  }

  /**
   * Set expiration time for a key (in seconds).
   */
  async expire(key: string, seconds: number): Promise<number> {
    return this.client.expire(key, seconds);
  }

  /**
   * Get remaining TTL for a key.
   */
  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  /**
   * Increment numeric value stored at key.
   */
  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  // ─────────────────────────────────────────────
  // JSON HELPERS
  // ─────────────────────────────────────────────
  /**
   * Store JSON-serializable object in Redis.
   *
   * Automatically stringifies value before saving.
   */
  async setJson<T>(
    key: string,
    value: T,
    ttlSeconds?: number,
  ): Promise<string | null> {
    return this.set(key, JSON.stringify(value), ttlSeconds);
  }

  /**
   * Retrieve and parse JSON object from Redis.
   *
   * Returns null if value is missing or invalid JSON.
   */
  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (!value) return null;

    try {
      return JSON.parse(value) as T;
    } catch {
      // Fail-safe: corrupted JSON should not crash app
      return null;
    }
  }

  // ─────────────────────────────────────────────
  // LIST OPERATIONS
  // ─────────────────────────────────────────────
  /**
   * Push values to the left of a Redis list.
   */
  async lpush(key: string, ...values: [string, ...string[]]): Promise<number> {
    return this.client.lPush(key, values);
  }

  /**
   * Push values to the right of a Redis list.
   */
  async rpush(key: string, ...values: [string, ...string[]]): Promise<number> {
    return this.client.rPush(key, values);
  }

  /**
   * Pop value from left side of list.
   */
  async lpop(key: string): Promise<string | null> {
    return this.client.lPop(key);
  }

  /**
   * Pop value from right side of list.
   */
  async rpop(key: string): Promise<string | null> {
    return this.client.rPop(key);
  }

  /**
   * Get range of elements from list.
   *
   * start: inclusive index
   * stop: inclusive index (-1 means end)
   */
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.lRange(key, start, stop);
  }

  /**
   * Remove elements from list.
   *
   * count = 0 removes all occurrences.
   */
  async lrem(key: string, count: number, element: string): Promise<number> {
    return this.client.lRem(key, count, element);
  }

  // ─────────────────────────────────────────────
  // HASH OPERATIONS
  // ─────────────────────────────────────────────
  /**
   * Set field in Redis hash.
   */
  async hset(key: string, field: string, value: string): Promise<number> {
    return this.client.hSet(key, field, value);
  }

  /**
   * Get field from Redis hash.
   */
  async hget(key: string, field: string): Promise<string | null> {
    return (await this.client.hGet(key, field)) ?? null;
  }

  /**
   * Get all fields from Redis hash.
   */
  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hGetAll(key);
  }

  /**
   * Delete fields from Redis hash.
   */
  async hdel(key: string, ...fields: [string, ...string[]]): Promise<number> {
    return this.client.hDel(key, fields);
  }

  // ─────────────────────────────────────────────
  // SET OPERATIONS
  // ─────────────────────────────────────────────

  /**
   * Add members to Redis set.
   */
  async sadd(key: string, ...members: [string, ...string[]]): Promise<number> {
    return this.client.sAdd(key, members);
  }

  /**
   * Get all members of a set.
   */
  async smembers(key: string): Promise<string[]> {
    return this.client.sMembers(key);
  }

  /**
   * Check membership in a set.
   */
  async sismember(key: string, member: string): Promise<number> {
    return this.client.sIsMember(key, member);
  }

  // ─────────────────────────────────────────────
  // UTILITY
  // ─────────────────────────────────────────────
  /**
   * Flush entire Redis database.
   * ⚠ Dangerous in production environments.
   */
  async flushAll(): Promise<string> {
    return this.client.flushAll();
  }

  /**
   * Health check for Redis connection.
   */
  async ping(): Promise<string> {
    return this.client.ping();
  }
}
