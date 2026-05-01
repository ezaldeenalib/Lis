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
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

@ApiTags('patients')
@ApiBearerAuth()
@Controller('api/v1/patients')
@UseGuards(PermissionsGuard)
export class PatientsController {
  constructor(private patientsService: PatientsService) {}

  @Get()
  @ApiOperation({ summary: 'List patients with pagination' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  async list(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.patientsService.list({ page, limit, search });
  }

  @Get('check-phone')
  @ApiOperation({ summary: 'Check if phone number already belongs to a registered patient' })
  @ApiQuery({ name: 'phone', required: true })
  async checkPhone(@Query('phone') phone: string) {
    return this.patientsService.checkPhone(phone);
  }

  @Post()
  @RequirePermissions('create:patient')
  @ApiOperation({ summary: 'Create a new patient' })
  async create(
    @Body() dto: CreatePatientDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const laboratoryId = user?.laboratoryId;
    return this.patientsService.create(dto, laboratoryId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get patient by ID' })
  async getById(@Param('id') id: string) {
    return this.patientsService.findById(id);
  }

  @Put(':id')
  @RequirePermissions('update:patient')
  @ApiOperation({ summary: 'Update a patient' })
  async update(@Param('id') id: string, @Body() dto: UpdatePatientDto) {
    return this.patientsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('delete:patient')
  @ApiOperation({ summary: 'Delete a patient' })
  async delete(@Param('id') id: string) {
    return this.patientsService.delete(id);
  }
}
