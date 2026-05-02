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

export class AddTracksDto {
  @IsArray()
  @IsString({ each: true })
  trackIds!: string[];
}

export class RemoveTracksDto {
  @IsArray()
  @IsString({ each: true })
  trackIds!: string[];
}

export class BuildPlaylistDto {
  @IsOptional()
  @IsEnum(BuildStrategy)
  strategy?: BuildStrategy;

  @IsOptional()
  @IsString()
  genre?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  swapImmediately?: boolean;
}
