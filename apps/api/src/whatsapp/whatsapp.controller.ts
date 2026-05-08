import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { WhatsAppService } from './whatsapp.service';
import { ReportsService } from '../reports/reports.service';
import { SendWhatsAppDto } from './dto/send-whatsapp.dto';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

@ApiTags('whatsapp')
@ApiBearerAuth()
@Controller('api/v1/whatsapp')
@UseGuards(PermissionsGuard)
export class WhatsAppController {
  constructor(
    private readonly whatsAppService: WhatsAppService,
    private readonly reportsService: ReportsService,
  ) {}

  /**
   * Returns current WhatsApp connection status and QR code (base64 data URL)
   * if a scan is needed. The frontend should poll this every 3–5 seconds.
   */
  @Get('status')
  @ApiOperation({ summary: 'Get WhatsApp connection status and QR code' })
  getStatus() {
    return this.whatsAppService.getStatusInfo();
  }

  /**
   * Send a WhatsApp message (text + optional PDF report) to the patient.
   * Requires the `send:whatsapp` permission.
   * If `orderId` is provided the report PDF is generated and attached.
   */
  @Post('send')
  @RequirePermissions('send:whatsapp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send WhatsApp message (+ PDF report if orderId supplied)' })
  async send(
    @Body() dto: SendWhatsAppDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const laboratoryId = user.laboratoryId;
    if (!laboratoryId) throw new BadRequestException('Laboratory context required');

    let pdfBuffer: Buffer | undefined;

    if (dto.orderId) {
      try {
        pdfBuffer = await this.reportsService.generatePdfBuffer(dto.orderId);
      } catch (err) {
        throw new BadRequestException(
          `Failed to generate PDF: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    await this.whatsAppService.sendResult({
      phone: dto.phone,
      message: dto.message,
      pdfBuffer,
      fileName: dto.orderId ? `report-${dto.orderId}.pdf` : 'lab-report.pdf',
      orderId: dto.orderId,
      patientId: dto.patientId,
      laboratoryId,
      userId: user.userId,
    });

    return { success: true, message: 'تم الإرسال عبر واتساب بنجاح' };
  }

  /**
   * Disconnect the WhatsApp session (logs out and clears local auth).
   * After calling this the user must scan a new QR to reconnect.
   */
  @Post('disconnect')
  @RequirePermissions('send:whatsapp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disconnect and logout the WhatsApp session' })
  async disconnect() {
    await this.whatsAppService.disconnect();
    return { success: true, message: 'تم قطع الاتصال بواتساب' };
  }

  /**
   * Paginated list of all WhatsApp send attempts for the current lab.
   * Requires the `read:whatsappLog` permission.
   */
  @Get('logs')
  @RequirePermissions('read:whatsappLog')
  @ApiOperation({ summary: 'List WhatsApp send logs for the current laboratory' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  async getLogs(
    @CurrentUser() user: CurrentUserPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const laboratoryId = user.laboratoryId;
    if (!laboratoryId) throw new BadRequestException('Laboratory context required');

    return this.whatsAppService.getLogs(
      laboratoryId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 50,
    );
  }
}
