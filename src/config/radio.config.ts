import { registerAs } from '@nestjs/config';
import { Logger } from '@nestjs/common';

const logger = new Logger('RadioConfig');

export const RadioConfig = registerAs('radio', () => {
  /**
   * PIPE
   */
  const pipePath = process.env.RADIO_PIPE_PATH || '/tmp/radio_pipe';

  /**
   * FFMPEG
   */
  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';

  /**
   * AUDIO
   */
  const audioBitrate = process.env.FFMPEG_AUDIO_BITRATE || '128k';

  const sampleRate = Number(process.env.FFMPEG_SAMPLE_RATE || 44100);

  /**
   * Validation
   */
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

  /**
   * Safe startup logs
   */
  logger.log(`Pipe path → ${pipePath}`);
  logger.log(`FFmpeg path → ${ffmpegPath}`);
  logger.log(`Audio bitrate → ${audioBitrate}`);
  logger.log(`Sample rate → ${sampleRate}`);

  return {
    pipePath,
    ffmpegPath,
    audioBitrate,
    sampleRate,
  };
});
