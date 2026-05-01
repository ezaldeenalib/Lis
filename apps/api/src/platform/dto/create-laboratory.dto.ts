import { IsString, IsOptional, IsEmail, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLaboratoryDto {
  @ApiProperty({ example: 'Central Lab' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'central-lab' })
  @IsString()
  @MinLength(2)
  slug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Initial admin email' })
  @IsOptional()
  @IsEmail()
  adminEmail?: string;

  @ApiPropertyOptional({ description: 'Initial admin password' })
  @IsOptional()
  @IsString()
  @MinLength(6)
  adminPassword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adminFirstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adminLastName?: string;
}
