import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTemplateDto {
  @ApiProperty({ description: 'Template name' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'HTML template content' })
  @IsString()
  htmlTemplate!: string;

  @ApiPropertyOptional({ description: 'Whether this is the default template' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
