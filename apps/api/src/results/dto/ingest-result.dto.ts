import {
  IsString,
  IsArray,
  IsOptional,
  ValidateNested,
  MinLength,
  ArrayMinSize,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IngestItemDto {
  @ApiProperty({ example: 'WBC', description: 'Analyte code as sent by the device' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty({ example: '7.6' })
  @IsString()
  @MinLength(1)
  value!: string;

  @ApiPropertyOptional({ example: '10*3/uL' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ example: 'N', description: 'Device flag: N, H, L, HH, LL, A' })
  @IsOptional()
  @IsString()
  flag?: string;
}

export class IngestResultDto {
  @ApiProperty({ example: '2600000001', description: '10-digit numeric sample barcode from the label (format: YYXXXXXXXX)' })
  @IsString()
  @MinLength(1)
  barcode!: string;

  @ApiProperty({ example: 'XP-300', description: 'Device identifier matching the mapping config' })
  @IsString()
  @MinLength(1)
  deviceId!: string;

  @ApiProperty({ type: [IngestItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => IngestItemDto)
  results!: IngestItemDto[];

  @ApiPropertyOptional({
    description:
      'Laboratory UUID. If omitted, use X-Lab-Id header or INGEST_DEFAULT_LAB_ID in server .env (see DEVICE_INGEST_AUTH_DISABLED).',
  })
  @IsOptional()
  @IsUUID('4')
  laboratoryId?: string;
}
