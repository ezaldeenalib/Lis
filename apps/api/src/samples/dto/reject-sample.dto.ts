import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectSampleDto {
  @ApiProperty({ example: 'Sample hemolyzed' })
  @IsString()
  @MinLength(1)
  reason!: string;
}
