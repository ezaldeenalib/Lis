import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

class UpdateRoleBodyDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds?: string[];
}

@ApiTags('roles')
@ApiBearerAuth()
@Controller('api/v1/roles')
@UseGuards(PermissionsGuard)
export class RolesController {
  constructor(private rolesService: RolesService) {}

  /**
   * GET /api/v1/roles
   * List all roles for the current laboratory with their permissions.
   */
  @Get()
  @RequirePermissions('manage:user')
  @ApiOperation({ summary: 'List all roles for this laboratory' })
  async listRoles() {
    return this.rolesService.listRoles();
  }

  /**
   * GET /api/v1/roles/permissions
   * List every available permission in the system (for building the edit form).
   * NOTE: this route MUST stay above /:id to avoid being swallowed by the param route.
   */
  @Get('permissions')
  @RequirePermissions('manage:user')
  @ApiOperation({ summary: 'List all available permissions' })
  async listPermissions() {
    return this.rolesService.listPermissions();
  }

  /**
   * GET /api/v1/roles/:id
   * Get a single role with its permission list.
   */
  @Get(':id')
  @RequirePermissions('manage:user')
  @ApiOperation({ summary: 'Get role details with permissions' })
  async getRole(@Param('id') id: string) {
    return this.rolesService.getRoleById(id);
  }

  /**
   * PATCH /api/v1/roles/:id
   * Update role name, description, and/or its permission set.
   */
  @Patch(':id')
  @RequirePermissions('manage:user')
  @ApiOperation({ summary: 'Update role name/description and replace its permissions' })
  async updateRole(@Param('id') id: string, @Body() dto: UpdateRoleBodyDto) {
    return this.rolesService.updateRole(id, dto);
  }
}
