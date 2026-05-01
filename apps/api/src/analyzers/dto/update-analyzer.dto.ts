import { PartialType } from '@nestjs/swagger';
import { CreateAnalyzerDto } from './create-analyzer.dto';

export class UpdateAnalyzerDto extends PartialType(CreateAnalyzerDto) {}
