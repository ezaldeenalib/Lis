import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LinkTestDto {
  @ApiProperty({ example: 'uuid-of-lab-service' })
  @IsUUID()
  labServiceId!: string;
}
