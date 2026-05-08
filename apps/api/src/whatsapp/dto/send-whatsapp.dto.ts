import { IsString, IsNotEmpty, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendWhatsAppDto {
  @ApiProperty({ example: '07701234567', description: 'Patient phone number (Iraqi format accepted)' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({ example: 'مرحباً، نتائجك جاهزة.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;

  @ApiPropertyOptional({ description: 'Order ID to attach PDF report' })
  @IsUUID()
  @IsOptional()
  orderId?: string;

  @ApiPropertyOptional({ description: 'Patient ID for log linkage' })
  @IsUUID()
  @IsOptional()
  patientId?: string;
}
