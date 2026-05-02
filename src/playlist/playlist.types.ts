export interface TrackMeta {
  id: string;
  title: string;
  artist: string;
  filePath: string;
}

export enum BuildStrategy {
  WEIGHTED_SHUFFLE = 'weighted_shuffle',
  TOP_PLAYED = 'top_played',
  GENRE = 'genre',
  FULL_LIBRARY = 'full_library',
}

export interface BuildOptions {
  strategy?: BuildStrategy;
  genre?: string;
  limit?: number;
  swapImmediately?: boolean;
}
