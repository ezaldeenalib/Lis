import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsUUID,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePanelDto {
  @ApiProperty({ example: 'LIPID' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty({ example: 'Lipid Panel' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ example: 'Complete lipid profile' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 75.0 })
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiProperty({
    example: ['uuid-1', 'uuid-2'],
    description: 'Array of lab service IDs to include in the panel',
  })
  @IsArray()
  @IsUUID('4', { each: true })
  serviceIds!: string[];
}
