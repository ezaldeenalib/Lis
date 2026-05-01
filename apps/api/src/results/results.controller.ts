import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiHeader,
} from '@nestjs/swagger';
import { ResultsService } from './results.service';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { DeviceApiKeyGuard } from '../auth/guards/device-api-key.guard';
import { EnterResultDto } from './dto/enter-result.dto';
import { ValidateResultDto } from './dto/validate-result.dto';
import { IngestResultDto } from './dto/ingest-result.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('results')
@ApiBearerAuth()
@Controller('api/v1/results')
@UseGuards(PermissionsGuard)
export class ResultsController {
  constructor(private resultsService: ResultsService) {}

  @Get('pending')
  @ApiOperation({ summary: 'List pending sample tests (technician workbench)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getPending(
    @CurrentUser() user: CurrentUserPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const laboratoryId = user?.laboratoryId ?? this.resultsService.getTenantId();
    return this.resultsService.getPendingSampleTests(laboratoryId ?? '', {
      page,
      limit,
    });
  }

  @Post('enter')
  @RequirePermissions('create:result')
  @ApiOperation({ summary: 'Enter a test result' })
  async enterResult(@Body() dto: EnterResultDto) {
    return this.resultsService.enterResult({
      sampleTestId: dto.sampleTestId,
      value: dto.value,
      unit: dto.unit,
      normalRange: dto.normalRange,
      flag: dto.flag,
      notes: dto.notes,
    });
  }

  @Post('validate')
  @RequirePermissions('validate:result')
  @ApiOperation({ summary: 'Validate a result' })
  async validateResult(
    @Body() dto: ValidateResultDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.resultsService.validateResult(
      dto.sampleTestId,
      user.userId,
      dto.notes,
    );
  }

  @Get('validation-queue')
  @ApiOperation({ summary: 'List results awaiting validation' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getValidationQueue(
    @CurrentUser() user: CurrentUserPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const laboratoryId = user?.laboratoryId ?? this.resultsService.getTenantId();
    return this.resultsService.getValidationQueue(
      laboratoryId ?? '',
      {
        page,
        limit,
      },
      user,
    );
  }

  /**
   * External helper app — no JWT. Lab scope: X-Lab-Id, body `laboratoryId`, or INGEST_DEFAULT_LAB_ID.
   * Auth: X-Device-Api-Key unless DEVICE_INGEST_AUTH_DISABLED=1 in .env (dev only; re-enable for prod).
   */
  @Post('ingest')
  @Public()
  @UseGuards(DeviceApiKeyGuard)
  @ApiOperation({
    summary: 'Ingest parsed device results (helper app only)',
    description:
      '**Dev:** set `DEVICE_INGEST_AUTH_DISABLED=1` and `INGEST_DEFAULT_LAB_ID=<lab uuid>` in .env to skip X-Device-Api-Key and X-Lab-Id. **Production:** remove those and require headers + `DEVICE_API_KEY`.',
  })
  @ApiHeader({
    name: 'X-Device-Api-Key',
    required: false,
    description: 'Pre-shared key (optional when DEVICE_INGEST_AUTH_DISABLED=1)',
  })
  @ApiHeader({
    name: 'X-Lab-Id',
    required: false,
    description: 'Laboratory UUID (optional if body.laboratoryId or INGEST_DEFAULT_LAB_ID is set)',
  })
  async ingestResults(
    @Body() dto: IngestResultDto,
    @Headers('x-lab-id') labIdHeader: string | undefined,
  ) {
    const fromEnv = process.env.INGEST_DEFAULT_LAB_ID?.trim();
    const labId = (labIdHeader || dto.laboratoryId || fromEnv || '').trim();
    if (!labId) {
      throw new BadRequestException(
        'Laboratory is required: set X-Lab-Id, or body.laboratoryId, or INGEST_DEFAULT_LAB_ID in .env',
      );
    }
    return this.resultsService.ingestResults(dto, labId);
  }
}
