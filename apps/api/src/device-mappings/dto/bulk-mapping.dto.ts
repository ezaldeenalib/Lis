import {
  IsString,
  IsArray,
  IsUUID,
  ValidateNested,
  MinLength,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class MappingItemDto {
  @ApiProperty({ example: 'WBC', description: 'Device analyte code sent by the analyzer' })
  @IsString()
  @MinLength(1)
  deviceCode!: string;

  @ApiProperty({ description: 'Lab service UUID to map this code to' })
  @IsUUID()
  labServiceId!: string;
}

export class BulkMappingDto {
  @ApiProperty({ example: 'XP-300', description: 'Device identifier (model name / serial) used by the helper app' })
  @IsString()
  @MinLength(1)
  deviceId!: string;

  @ApiProperty({ type: [MappingItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MappingItemDto)
  mappings!: MappingItemDto[];
}
