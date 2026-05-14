import { PartialType } from '@nestjs/swagger';
import { CreateCatalogTestDto } from './create-catalog-test.dto';

export class UpdateCatalogTestDto extends PartialType(CreateCatalogTestDto) {}
