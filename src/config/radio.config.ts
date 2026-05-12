import { registerAs } from '@nestjs/config';
import { Logger } from '@nestjs/common';

const logger = new Logger('RadioConfig');

export const RadioConfig = registerAs('radio', () => {
  const pipePath = process.env.RADIO_PIPE_PATH;
  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  const audioBitrate = process.env.FFMPEG_AUDIO_BITRATE || '128k';

  const sampleRate = Number(process.env.FFMPEG_SAMPLE_RATE || 44100);

  if (!pipePath) {
    logger.error('RADIO_PIPE_PATH is missing');
    throw new Error('Invalid Radio config: RADIO_PIPE_PATH is required');
  }

  if (Number.isNaN(sampleRate) || sampleRate <= 0) {
    logger.error(
      `Invalid FFMPEG_SAMPLE_RATE: ${process.env.FFMPEG_SAMPLE_RATE}`,
    );

    throw new Error(
      'Invalid Radio config: FFMPEG_SAMPLE_RATE must be a valid number',
    );
  }

  return {
    pipePath,
    ffmpegPath,
    audioBitrate,
    sampleRate,
  };
});
