import { Injectable } from '@nestjs/common';
import { TrackMeta } from '../playlist.types';

// Static track library
const TRACKS: TrackMeta[] = [
  {
    id: '1',
    title: 'Gairi Khet',
    artist: 'Asha Bhogle',
    filePath: '/Users/rock/Desktop/radio/music/song.mp3',
    // filePath: '/Users/srikriydv/Desktop/radio/audio/song.mp3',
    durationSeconds: 275,
  },
  {
    id: '2',
    title: 'Siri ma Siri',
    artist: 'Milan Amatya',
    filePath: '/Users/rock/Desktop/radio/music/song2.mp3',
    // filePath: '/Users/srikriydv/Desktop/radio/audio/song2.mp3',
    durationSeconds: 303,
  },
  {
    id: '3',
    title: 'Bahut Jatate ho',
    artist: 'Alka Yagnik',
    filePath: '/Users/rock/Desktop/radio/music/song3.mp3',
    // filePath: '/Users/srikriydv/Desktop/radio/audio/song3.mp3',
    durationSeconds: 442,
  },
];

const PLAY_COUNTS: Record<string, number> = {
  '1': 980,
  '2': 870,
  '3': 760,
};

const GENRES: Record<string, string> = {
  '1': 'pop',
  '2': 'alt-pop',
  '3': 'r&b',
};

// GLOBAL LIMIT
const DEFAULT_LIMIT = 2;

// Helpers
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

@Injectable()
export class MusicRepository {
  // Random shuffled tracks (limited to 2)
  findWeightedShuffle(limit: number = DEFAULT_LIMIT): TrackMeta[] {
    return shuffle(TRACKS).slice(0, limit);
  }

  // Top played tracks (limited to 2)
  findTopPlayed(limit: number = DEFAULT_LIMIT): TrackMeta[] {
    return [...TRACKS]
      .sort((a, b) => (PLAY_COUNTS[b.id] ?? 0) - (PLAY_COUNTS[a.id] ?? 0))
      .slice(0, limit);
  }

  // Filter by genre (ALWAYS returns max 2)
  findByGenre(genre: string): TrackMeta[] {
    return TRACKS.filter(
      (t) => GENRES[t.id]?.toLowerCase() === genre.toLowerCase(),
    ).slice(0, DEFAULT_LIMIT);
  }

  // Active tracks (always max 2)
  findAllActive(): TrackMeta[] {
    return TRACKS.slice(0, DEFAULT_LIMIT);
  }

  // Fetch by IDs (still limited to 2)
  findByIds(ids: string[]): TrackMeta[] {
    const set = new Set(ids);
    return TRACKS.filter((t) => set.has(t.id)).slice(0, DEFAULT_LIMIT);
  }
}
