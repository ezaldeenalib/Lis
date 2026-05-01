import { PartialType } from '@nestjs/swagger';
import { CreatePanelDto } from './create-panel.dto';

export class UpdatePanelDto extends PartialType(CreatePanelDto) {}
