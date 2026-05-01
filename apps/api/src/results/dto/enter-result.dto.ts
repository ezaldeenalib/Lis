import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ResultFlagEnum {
  NORMAL = 'NORMAL',
  LOW = 'LOW',
  HIGH = 'HIGH',
  CRITICAL_LOW = 'CRITICAL_LOW',
  CRITICAL_HIGH = 'CRITICAL_HIGH',
  ABNORMAL = 'ABNORMAL',
}

export class EnterResultDto {
  @ApiProperty({ description: 'Sample test ID' })
  @IsUUID()
  sampleTestId!: string;

  @ApiProperty({ example: '12.5' })
  @IsString()
  @MinLength(1)
  value!: string;

  @ApiPropertyOptional({ example: 'mg/dL' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ example: '10-20' })
  @IsOptional()
  @IsString()
  normalRange?: string;

  @ApiPropertyOptional({ enum: ResultFlagEnum })
  @IsOptional()
  @IsEnum(ResultFlagEnum)
  flag?: ResultFlagEnum;

  @ApiPropertyOptional({ example: 'Repeat if clinically indicated' })
  @IsOptional()
  @IsString()
  notes?: string;
}
