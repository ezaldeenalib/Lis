import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber, IsString, IsBoolean, Min } from 'class-validator';

/**
 * Updates ONLY the laboratory's operational configuration for an activated test.
 * Medical identity fields (code, name, department, unit) are owned by the global catalog
 * and cannot be modified by laboratory users.
 */
export class UpdateLabServiceConfigDto {
  @ApiPropertyOptional({ description: 'Local price for this lab', example: 30 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: 'Local reference range', example: '4.5-5.5' })
  @IsOptional()
  @IsString()
  normalRange?: string;

  @ApiPropertyOptional({ description: 'Whether this test is active for this lab', example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
