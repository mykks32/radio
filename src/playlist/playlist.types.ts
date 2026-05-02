/**
 * Represents metadata for a single track in the playlist system.
 *
 * This structure is used across:
 * - Playlist storage (Redis)
 * - Playlist playback queue
 * - Kafka events
 * - Builder transformations
 */
export interface TrackMeta {
  /** Unique track identifier (DB ID or UUID) */
  id: string;

  /** Display title of the track */
  title: string;

  /** Artist name associated with the track */
  artist: string;

  /** Absolute or relative file path to audio source */
  filePath: string;
}

/**
 * Strategy used to build playlists from the music library.
 *
 * Each strategy defines a different ranking/filtering algorithm.
 */
export enum BuildStrategy {
  /**
   * Randomized playlist with weighted probability
   * (popular tracks appear more frequently)
   */
  WEIGHTED_SHUFFLE = 'weighted_shuffle',

  /**
   * Highest played tracks based on historical play count
   */
  TOP_PLAYED = 'top_played',

  /**
   * Filter tracks by a specific genre
   */
  GENRE = 'genre',

  /**
   * Entire active library without ranking logic
   */
  FULL_LIBRARY = 'full_library',
}

/**
 * Options used to build a playlist dynamically.
 *
 * Controls:
 * - selection strategy
 * - filtering (genre)
 * - size limits
 * - activation behavior
 */
export interface BuildOptions {
  /**
   * Playlist generation strategy.
   * Defaults to WEIGHTED_SHUFFLE if not provided.
   */
  strategy?: BuildStrategy;

  /**
   * Genre filter (required only for GENRE strategy).
   */
  genre?: string;

  /**
   * Maximum number of tracks to include in playlist.
   */
  limit?: number;

  /**
   * If true, immediately replaces active playlist after building.
   */
  swapImmediately?: boolean;
}
