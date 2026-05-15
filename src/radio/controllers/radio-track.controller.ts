import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { RadioTrackService } from '../services/radio-track.service'
import { RadioTrackBuilderService } from '../services/radio-track-builder.service'
import {
  AddTracksDto,
  RemoveTracksDto,
  BuildRadioTrackDto,
} from '../dto/radio.dto'
import { TrackMeta } from '../radio.types'

@Controller('radio-track')
export class RadioTrackController {
  constructor(
    private readonly radioTrackService: RadioTrackService,
    private readonly playlistBuilderService: RadioTrackBuilderService,
  ) {}

  @Get()
  async getRadioTracks(): Promise<TrackMeta[]> {
    return this.radioTrackService.getRadioTracks()
  }

  @Get('next')
  async getNext(): Promise<TrackMeta | null> {
    return this.radioTrackService.getNext()
  }

  @Post('build')
  async build(@Body() dto: BuildRadioTrackDto): Promise<{ count: number }> {
    const count = await this.playlistBuilderService.build(dto)
    return { count }
  }

  @Post('tracks')
  async addTracks(@Body() dto: AddTracksDto): Promise<{ count: number }> {
    const count = await this.playlistBuilderService.addTracksToActive(
      dto.trackIds,
    )
    return { count }
  }

  @Delete('tracks')
  @HttpCode(HttpStatus.OK)
  async removeTracks(
    @Body() dto: RemoveTracksDto,
  ): Promise<{ removed: number }> {
    await this.radioTrackService.removeTracks(dto.trackIds)
    return { removed: dto.trackIds.length }
  }

  @Post('swap')
  @HttpCode(HttpStatus.OK)
  async swap(): Promise<{ swapped: boolean }> {
    await this.radioTrackService.swapToStaged()
    return { swapped: true }
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  async clear(): Promise<{ cleared: boolean }> {
    await this.radioTrackService.clear()
    return { cleared: true }
  }
}
