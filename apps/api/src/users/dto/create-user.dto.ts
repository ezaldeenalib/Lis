import {
  IsString,
  IsOptional,
  MinLength,
  IsEmail,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'user@lab.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password!: string;

  @ApiProperty({ example: 'أحمد' })
  @IsString()
  @MinLength(1)
  firstName!: string;

  @ApiProperty({ example: 'محمد' })
  @IsString()
  @MinLength(1)
  lastName!: string;

  @ApiPropertyOptional({ example: '+966501234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'Technician', enum: ['LabAdmin', 'Technician', 'Specialist', 'Receptionist'] })
  @IsString()
  @MinLength(1)
  role!: string;
}
