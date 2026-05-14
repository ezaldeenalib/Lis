import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, Min } from 'class-validator';

/**
 * Activates a global catalog test for the current laboratory.
 * The system creates a lab_service record linked to the catalog test.
 * Medical identity (code, name, department, unit) comes from the catalog — never from the lab.
 */
export class ActivateLabServiceDto {
  @ApiProperty({ description: 'ID of the global CatalogTest to activate for this laboratory' })
  @IsString()
  @IsNotEmpty()
  catalogTestId!: string;

  @ApiPropertyOptional({ description: 'Local price for this lab', example: 25 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: 'Local reference range', example: '4.5-5.5' })
  @IsOptional()
  @IsString()
  normalRange?: string;
}
