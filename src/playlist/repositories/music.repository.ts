import { Injectable } from '@nestjs/common';
import { TrackMeta } from '../playlist.types';

// ── Static track library ──────────────────────────────────────────────────────

const TRACKS: TrackMeta[] = [
  {
    id: '1',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    filePath: '/tracks/blinding-lights.mp3',
  },
  {
    id: '2',
    title: 'Levitating',
    artist: 'Dua Lipa',
    filePath: '/tracks/levitating.mp3',
  },
  {
    id: '3',
    title: 'Stay',
    artist: 'Kid LAROI & Bieber',
    filePath: '/tracks/stay.mp3',
  },
  {
    id: '4',
    title: 'Bad Guy',
    artist: 'Billie Eilish',
    filePath: '/tracks/bad-guy.mp3',
  },
  {
    id: '5',
    title: 'Shape of You',
    artist: 'Ed Sheeran',
    filePath: '/tracks/shape-of-you.mp3',
  },
  {
    id: '6',
    title: 'Watermelon Sugar',
    artist: 'Harry Styles',
    filePath: '/tracks/watermelon-sugar.mp3',
  },
  {
    id: '7',
    title: 'Peaches',
    artist: 'Justin Bieber',
    filePath: '/tracks/peaches.mp3',
  },
  {
    id: '8',
    title: 'good 4 u',
    artist: 'Olivia Rodrigo',
    filePath: '/tracks/good-4-u.mp3',
  },
  {
    id: '9',
    title: 'Montero',
    artist: 'Lil Nas X',
    filePath: '/tracks/montero.mp3',
  },
  {
    id: '10',
    title: 'Kiss Me More',
    artist: 'Doja Cat',
    filePath: '/tracks/kiss-me-more.mp3',
  },
  {
    id: '11',
    title: 'Dynamite',
    artist: 'BTS',
    filePath: '/tracks/dynamite.mp3',
  },
  {
    id: '12',
    title: 'positions',
    artist: 'Ariana Grande',
    filePath: '/tracks/positions.mp3',
  },
  {
    id: '13',
    title: 'drivers license',
    artist: 'Olivia Rodrigo',
    filePath: '/tracks/drivers-license.mp3',
  },
  {
    id: '14',
    title: 'Save Your Tears',
    artist: 'The Weeknd',
    filePath: '/tracks/save-your-tears.mp3',
  },
  {
    id: '15',
    title: 'Happier Than Ever',
    artist: 'Billie Eilish',
    filePath: '/tracks/happier-than-ever.mp3',
  },
];

const PLAY_COUNTS: Record<string, number> = {
  '1': 980,
  '2': 870,
  '3': 760,
  '4': 910,
  '5': 1100,
  '6': 650,
  '7': 540,
  '8': 720,
  '9': 430,
  '10': 380,
  '11': 810,
  '12': 490,
  '13': 930,
  '14': 670,
  '15': 560,
};

const GENRES: Record<string, string> = {
  '1': 'pop',
  '2': 'pop',
  '3': 'pop',
  '4': 'alt-pop',
  '5': 'pop',
  '6': 'pop',
  '7': 'r&b',
  '8': 'pop',
  '9': 'hip-hop',
  '10': 'r&b',
  '11': 'kpop',
  '12': 'r&b',
  '13': 'pop',
  '14': 'r&b',
  '15': 'alt-pop',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class MusicRepository {
  findWeightedShuffle(limit?: number): TrackMeta[] {
    const shuffled = shuffle(TRACKS);
    return limit ? shuffled.slice(0, limit) : shuffled;
  }

  findTopPlayed(limit: number): TrackMeta[] {
    return [...TRACKS]
      .sort((a, b) => (PLAY_COUNTS[b.id] ?? 0) - (PLAY_COUNTS[a.id] ?? 0))
      .slice(0, limit);
  }

  findByGenre(genre: string): TrackMeta[] {
    return TRACKS.filter(
      (t) => GENRES[t.id]?.toLowerCase() === genre.toLowerCase(),
    );
  }

  findAllActive(): TrackMeta[] {
    return [...TRACKS];
  }

  findByIds(ids: string[]): TrackMeta[] {
    const set = new Set(ids);
    return TRACKS.filter((t) => set.has(t.id));
  }

  findById(id: string): TrackMeta | null {
    return TRACKS.find((t) => t.id === id) ?? null;
  }

  findByArtist(artist: string): TrackMeta[] {
    return TRACKS.filter((t) =>
      t.artist.toLowerCase().includes(artist.toLowerCase()),
    );
  }

  getPlayCount(id: string): number {
    return PLAY_COUNTS[id] ?? 0;
  }

  getGenre(id: string): string | null {
    return GENRES[id] ?? null;
  }

  listGenres(): string[] {
    return [...new Set(Object.values(GENRES))].sort();
  }
}
