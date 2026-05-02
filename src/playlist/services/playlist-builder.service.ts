import { Injectable, Logger } from '@nestjs/common';
import { PlaylistService } from './playlist.service';
import { BuildOptions, BuildStrategy, TrackMeta } from '../playlist.types';
import { KafkaService } from '../../kafka/kafka.service';
import { MusicRepository } from '../repositories/music.repository';
import { KAFKA_EVENT, KAFKA_TOPIC } from '../../kafka/kafka.constant';

@Injectable()
export class PlaylistBuilderService {
  private readonly logger = new Logger(PlaylistBuilderService.name);

  constructor(
    private readonly musicRepo: MusicRepository,
    private readonly playlistService: PlaylistService,
    private readonly kafka: KafkaService,
  ) {}

  async build(opts: BuildOptions = {}): Promise<number> {
    const {
      strategy = BuildStrategy.WEIGHTED_SHUFFLE,
      genre,
      limit,
      swapImmediately = false,
    } = opts;

    this.logger.log(`Building playlist — strategy: ${strategy}`);

    let tracks: TrackMeta[] = [];

    switch (strategy) {
      case BuildStrategy.WEIGHTED_SHUFFLE:
        tracks = this.musicRepo.findWeightedShuffle(limit);
        break;

      case BuildStrategy.TOP_PLAYED:
        tracks = this.musicRepo.findTopPlayed(limit ?? 100);
        break;

      case BuildStrategy.GENRE:
        if (!genre) throw new Error('genre is required for GENRE strategy');
        tracks = this.musicRepo.findByGenre(genre);
        if (limit) tracks = tracks.slice(0, limit);
        break;

      case BuildStrategy.FULL_LIBRARY:
        tracks = this.musicRepo.findAllActive();
        if (limit) tracks = tracks.slice(0, limit);
        break;

      default:
        throw new Error(`Unknown build strategy: ${strategy}`);
    }

    if (!tracks.length) {
      this.logger.warn('No active tracks found in DB — skipping build');
      return 0;
    }

    const meta: TrackMeta[] = tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      filePath: t.filePath,
    }));

    await this.playlistService.stagePlaylist(meta);

    if (swapImmediately) {
      await this.playlistService.swapToStaged();
    }

    await this.kafka.send(KAFKA_TOPIC.RADIO_EVENTS, {
      event: KAFKA_EVENT.PLAYLIST_BUILT,
      strategy,
      count: tracks.length,
      swappedImmediately: swapImmediately,
      ts: Date.now(),
    });

    this.logger.log(`Built ${tracks.length} tracks (swap=${swapImmediately})`);

    return tracks.length;
  }

  async addTracksToActive(trackIds: string[]): Promise<number> {
    const tracks = this.musicRepo.findByIds(trackIds);

    if (!tracks.length) {
      this.logger.warn(
        `No active tracks found for IDs: ${trackIds.join(', ')}`,
      );
      return 0;
    }

    const meta: TrackMeta[] = tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      filePath: t.filePath,
    }));

    await this.playlistService.appendToActive(meta);

    await this.kafka.send(KAFKA_TOPIC.RADIO_EVENTS, {
      event: KAFKA_EVENT.TRACKS_ADDED_MANUALLY,
      count: tracks.length,
      trackIds: tracks.map((t) => t.id),
      ts: Date.now(),
    });

    return tracks.length;
  }
}
