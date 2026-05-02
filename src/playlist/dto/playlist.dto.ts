import {
  IsArray,
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BuildStrategy } from '../playlist.types';

/**
 * DTO for adding multiple tracks to the active playlist.
 *
 * Used when manually appending tracks without rebuilding the playlist.
 */
export class AddTracksDto {
  /**
   * Array of track IDs to be added to the playlist.
   */
  @IsArray()
  @IsString({ each: true })
  trackIds!: string[];
}

/**
 * DTO for removing tracks from the active playlist.
 *
 * Removes matching track IDs from Redis queue.
 */
export class RemoveTracksDto {
  /**
   * Array of track IDs to remove from playlist.
   */
  @IsArray()
  @IsString({ each: true })
  trackIds!: string[];
}

/**
 * DTO for building a playlist using different strategies.
 *
 * Controls:
 * - selection strategy (shuffle, top played, genre, etc.)
 * - filtering (genre)
 * - size limit
 * - whether to activate immediately
 */
export class BuildPlaylistDto {
  /**
   * Strategy used to generate playlist.
   * Defaults to WEIGHTED_SHUFFLE in service layer.
   */
  @IsOptional()
  @IsEnum(BuildStrategy)
  strategy?: BuildStrategy;

  /**
   * Genre filter (required only when using GENRE strategy).
   */
  @IsOptional()
  @IsString()
  genre?: string;

  /**
   * Maximum number of tracks to include in generated playlist.
   * Must be >= 1 if provided.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;

  /**
   * If true, playlist is immediately swapped into active queue
   * after being built (bypasses staging step).
   */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  swapImmediately?: boolean;
}
