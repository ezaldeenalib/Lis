import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ValidateResultDto {
  @ApiProperty({ description: 'Sample test ID' })
  @IsUUID()
  sampleTestId!: string;

  @ApiPropertyOptional({ example: 'Validation notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
