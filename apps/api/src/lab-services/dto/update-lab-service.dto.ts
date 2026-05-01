import { PartialType } from '@nestjs/swagger';
import { CreateLabServiceDto } from './create-lab-service.dto';

export class UpdateLabServiceDto extends PartialType(CreateLabServiceDto) {}
