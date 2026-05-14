import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
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
import { UpdateWhatsAppMessageTemplateDto } from './dto/update-whatsapp-message-template.dto';
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
   * قالب رسالة نتائج التحاليل المخزَّن للمختبر (أو النص الافتراضي).
   */
  @Get('message-template')
  @RequirePermissions('send:whatsapp')
  @ApiOperation({ summary: 'Get WhatsApp results message template for this laboratory' })
  async getMessageTemplate(@CurrentUser() user: CurrentUserPayload) {
    const laboratoryId = user.laboratoryId;
    if (!laboratoryId) throw new BadRequestException('Laboratory context required');
    return this.whatsAppService.getResultsMessageTemplate(laboratoryId);
  }

  /**
   * حفظ قالب مخصص. يتطلب إدارة إعدادات المختبر (أو manage:all).
   */
  @Put('message-template')
  @RequirePermissions('manage:settings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save custom WhatsApp results message template' })
  async putMessageTemplate(
    @Body() dto: UpdateWhatsAppMessageTemplateDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const laboratoryId = user.laboratoryId;
    if (!laboratoryId) throw new BadRequestException('Laboratory context required');
    await this.whatsAppService.setResultsMessageTemplate(laboratoryId, dto.template);
    return { success: true as const, message: 'تم حفظ قالب الرسالة' };
  }

  /**
   * حذف القالب المخصص والعودة للنص الافتراضي للنظام.
   */
  @Delete('message-template')
  @RequirePermissions('manage:settings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear custom template (use default message)' })
  async deleteMessageTemplate(@CurrentUser() user: CurrentUserPayload) {
    const laboratoryId = user.laboratoryId;
    if (!laboratoryId) throw new BadRequestException('Laboratory context required');
    await this.whatsAppService.clearResultsMessageTemplate(laboratoryId);
    return { success: true as const, message: 'تم استخدام القالب الافتراضي' };
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
