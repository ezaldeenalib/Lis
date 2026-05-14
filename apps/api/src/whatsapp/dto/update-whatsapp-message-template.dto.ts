import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateWhatsAppMessageTemplateDto {
  @ApiProperty({
    example: 'مرحباً {firstName} {lastName}، نتائج طلب {orderNumber} جاهزة…',
    description:
      'نص القالب مع العناصر النائبة: {firstName} {lastName} {patientName} {orderNumber} {mrn} {labName}',
    maxLength: 4000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  template!: string;
}
