import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsString, IsNotEmpty } from 'class-validator';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ToggleActiveDto } from './dto/toggle-active.dto';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

class UpdateRoleDto {
  @IsString()
  @IsNotEmpty()
  role!: string;
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('api/v1/users')
@UseGuards(PermissionsGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List laboratory users' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async list(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.usersService.list({ page, limit });
  }

  @Post()
  @RequirePermissions('manage:user')
  @ApiOperation({ summary: 'Create a new laboratory user' })
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.usersService.create(dto, user?.laboratoryId);
  }

  @Put(':id/toggle-active')
  @RequirePermissions('manage:user')
  @ApiOperation({ summary: 'Enable or disable a user' })
  async toggleActive(
    @Param('id') id: string,
    @Body() dto: ToggleActiveDto,
  ) {
    return this.usersService.toggleActive(id, dto.isActive);
  }

  @Put(':id/role')
  @RequirePermissions('manage:user')
  @ApiOperation({ summary: 'Change the role of a laboratory user' })
  async updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.usersService.updateRole(id, dto.role, user?.laboratoryId);
  }

  @Get('roles')
  @RequirePermissions('manage:user')
  @ApiOperation({ summary: 'List roles with their permissions' })
  async listRoles(@CurrentUser() user: CurrentUserPayload) {
    return this.usersService.listRoles(user?.laboratoryId);
  }
}
