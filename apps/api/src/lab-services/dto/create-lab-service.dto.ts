import {
  IsString,
  IsOptional,
  IsNumber,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLabServiceDto {
  @ApiProperty({ example: 'CBC' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty({ example: 'Complete Blood Count' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ example: 'Standard CBC test' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Hematology' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ example: 25.5 })
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiPropertyOptional({ example: 'each' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ example: '4.5-11.0 x10^9/L' })
  @IsOptional()
  @IsString()
  normalRange?: string;
}
