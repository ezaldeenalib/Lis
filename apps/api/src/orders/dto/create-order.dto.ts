import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum OrderPriorityEnum {
  STAT = 'STAT',
  URGENT = 'URGENT',
  ROUTINE = 'ROUTINE',
}

export enum SampleTypeEnum {
  BLOOD = 'BLOOD',
  URINE = 'URINE',
  SERUM = 'SERUM',
  PLASMA = 'PLASMA',
  CSF = 'CSF',
  STOOL = 'STOOL',
  SWAB = 'SWAB',
  TISSUE = 'TISSUE',
  OTHER = 'OTHER',
}

export class SampleInputDto {
  @ApiPropertyOptional({ enum: SampleTypeEnum, default: SampleTypeEnum.BLOOD })
  @IsOptional()
  @IsEnum(SampleTypeEnum)
  sampleType?: SampleTypeEnum;

  @ApiPropertyOptional({ example: ['550e8400-e29b-41d4-a716-446655440001'], description: 'Lab service IDs for this sample' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  serviceIds?: string[];

  @ApiPropertyOptional({ example: ['550e8400-e29b-41d4-a716-446655440002'], description: 'Panel IDs to expand into services for this sample' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  panelIds?: string[];
}

export class CreateOrderDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  patientId!: string;

  @ApiPropertyOptional({ enum: OrderPriorityEnum })
  @IsOptional()
  @IsEnum(OrderPriorityEnum)
  priority?: OrderPriorityEnum;

  @ApiPropertyOptional({ example: 'Fasting sample required' })
  @IsOptional()
  @IsString()
  clinicalNotes?: string;

  @ApiPropertyOptional({ example: 'Dr. Smith' })
  @IsOptional()
  @IsString()
  physicianName?: string;

  @ApiPropertyOptional({
    description: 'Laboratory user (Specialist or LabAdmin) linked as referring physician; used to scope orders for Specialist logins.',
  })
  @IsOptional()
  @IsUUID()
  physicianUserId?: string;

  /**
   * New: multiple samples, each with its own sample type and services.
   * Preferred over the legacy flat services/panels fields.
   */
  @ApiPropertyOptional({ type: [SampleInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SampleInputDto)
  samples?: SampleInputDto[];

  /**
   * Legacy: flat list of service IDs (single sample).
   * Used when `samples` is not provided.
   */
  @ApiPropertyOptional({ example: ['550e8400-e29b-41d4-a716-446655440001'] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  services?: string[];

  /** Legacy: flat panel IDs (single sample). */
  @ApiPropertyOptional({ example: ['550e8400-e29b-41d4-a716-446655440002'] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  panels?: string[];
}
