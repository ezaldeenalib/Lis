import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { PanelsService } from './panels.service';
import { CreatePanelDto } from './dto/create-panel.dto';
import { UpdatePanelDto } from './dto/update-panel.dto';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

@ApiTags('panels')
@ApiBearerAuth()
@Controller('api/v1/panels')
@UseGuards(PermissionsGuard)
export class PanelsController {
  constructor(private panelsService: PanelsService) {}

  @Get()
  @ApiOperation({ summary: 'List panels with pagination' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async list(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.panelsService.list({ page, limit });
  }

  @Post()
  @RequirePermissions('manage:panel')
  @ApiOperation({ summary: 'Create a new panel with services' })
  async create(
    @Body() dto: CreatePanelDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const laboratoryId = user?.laboratoryId;
    return this.panelsService.create(dto, laboratoryId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get panel by ID with items' })
  async getById(@Param('id') id: string) {
    return this.panelsService.findById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a panel' })
  async update(@Param('id') id: string, @Body() dto: UpdatePanelDto) {
    return this.panelsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a panel' })
  async delete(@Param('id') id: string) {
    return this.panelsService.delete(id);
  }
}
