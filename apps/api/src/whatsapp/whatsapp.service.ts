import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WhatsAppSendStatus } from '@prisma/client';
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import * as qrcode from 'qrcode';
import { TenantPrismaService } from '../database/tenant-prisma.service';

export type WAStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';

@Injectable()
export class WhatsAppService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppService.name);

  private client: Client | null = null;
  private _status: WAStatus = 'DISCONNECTED';
  private _qrDataUrl: string | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly prisma: TenantPrismaService) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async onModuleInit() {
    this.startClient();
  }

  async onModuleDestroy() {
    this.clearReconnectTimer();
    try { await this.client?.destroy(); } catch { /* ignore on shutdown */ }
  }

  // ── Public accessors ───────────────────────────────────────────────────────

  get status(): WAStatus { return this._status; }
  get qrDataUrl(): string | null { return this._qrDataUrl; }

  getStatusInfo() {
    return { status: this._status, qr: this._qrDataUrl };
  }

  // ── Client lifecycle ───────────────────────────────────────────────────────

  private startClient() {
    this.clearReconnectTimer();
    this._status = 'CONNECTING';
    this._qrDataUrl = null;

    try {
      this.client = new Client({
        authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
          ],
        },
      });

      this.client.on('qr', async (qr: string) => {
        try {
          this._qrDataUrl = await qrcode.toDataURL(qr);
          this._status = 'CONNECTING';
          this.logger.log('WhatsApp QR code generated — awaiting scan');
        } catch (err) {
          this.logger.error('Failed to generate QR data URL', err);
        }
      });

      this.client.on('ready', () => {
        this._status = 'CONNECTED';
        this._qrDataUrl = null;
        this.logger.log('WhatsApp client is ready and connected');
      });

      this.client.on('auth_failure', (msg: string) => {
        this.logger.error(`WhatsApp authentication failure: ${msg}`);
        this._status = 'DISCONNECTED';
        this._qrDataUrl = null;
        this.scheduleReconnect();
      });

      this.client.on('disconnected', (reason: string) => {
        this.logger.warn(`WhatsApp disconnected: ${reason}`);
        this._status = 'DISCONNECTED';
        this._qrDataUrl = null;
        this.scheduleReconnect();
      });

      this.client.initialize().catch((err: Error) => {
        this.logger.error('WhatsApp initialize() threw:', err.message);
        this._status = 'DISCONNECTED';
        this.scheduleReconnect();
      });
    } catch (err) {
      this.logger.error('Failed to create WhatsApp client', err);
      this._status = 'DISCONNECTED';
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(delayMs = 12_000) {
    this.clearReconnectTimer();
    this.logger.log(`WhatsApp: reconnect scheduled in ${delayMs / 1000}s`);
    this._reconnectTimer = setTimeout(() => this.startClient(), delayMs);
  }

  private clearReconnectTimer() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  async disconnect() {
    this.clearReconnectTimer();
    try { await this.client?.logout(); } catch { /* ignore */ }
    try { await this.client?.destroy(); } catch { /* ignore */ }
    this._status = 'DISCONNECTED';
    this._qrDataUrl = null;
    this.client = null;
  }

  // ── Phone normalisation ────────────────────────────────────────────────────

  /**
   * Normalises an Iraqi phone number to the WhatsApp chat-ID format (9647XXXXXXXX).
   * Accepts: 07XXXXXXXXX, 7XXXXXXXXX, +9647XXXXXXXXX, 009647XXXXXXXXX, 9647XXXXXXXXX.
   */
  normalizePhone(raw: string): string {
    let num = raw.replace(/\D/g, '');

    if (num.startsWith('00964')) num = num.slice(2);          // 009647...
    else if (num.startsWith('+')) num = num.slice(1);          // +9647...

    if (num.startsWith('07') && num.length === 11) {
      num = '964' + num.slice(1);                              // 07... → 9647...
    } else if (num.startsWith('7') && num.length === 10) {
      num = '964' + num;                                       // 7... → 9647...
    } else if (!num.startsWith('964')) {
      num = '964' + num;                                       // fallback prefix
    }

    return num;
  }

  // ── Sending ────────────────────────────────────────────────────────────────

  async sendResult(params: {
    phone: string;
    message: string;
    pdfBuffer?: Buffer;
    fileName?: string;
    orderId?: string;
    patientId?: string;
    laboratoryId: string;
    userId: string;
  }): Promise<void> {
    if (this._status !== 'CONNECTED' || !this.client) {
      throw new Error('واتساب غير متصل. يرجى مسح رمز QR أولاً.');
    }

    const normalizedPhone = this.normalizePhone(params.phone);
    const chatId = `${normalizedPhone}@c.us`;

    try {
      await this.client.sendMessage(chatId, params.message);

      if (params.pdfBuffer) {
        const media = new MessageMedia(
          'application/pdf',
          params.pdfBuffer.toString('base64'),
          params.fileName ?? 'lab-report.pdf',
        );
        await this.client.sendMessage(chatId, media, { sendMediaAsDocument: true } as object);
      }

      await this.writeLog({
        laboratoryId: params.laboratoryId,
        patientId: params.patientId,
        orderId: params.orderId,
        userId: params.userId,
        phone: normalizedPhone,
        messagePreview: params.message.slice(0, 500),
        status: WhatsAppSendStatus.SUCCESS,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      await this.writeLog({
        laboratoryId: params.laboratoryId,
        patientId: params.patientId,
        orderId: params.orderId,
        userId: params.userId,
        phone: normalizedPhone,
        messagePreview: params.message.slice(0, 500),
        status: WhatsAppSendStatus.FAILED,
        errorMessage,
      });

      throw err;
    }
  }

  // ── Logging ────────────────────────────────────────────────────────────────

  private async writeLog(data: {
    laboratoryId: string;
    patientId?: string;
    orderId?: string;
    userId: string;
    phone: string;
    messagePreview?: string;
    status: WhatsAppSendStatus;
    errorMessage?: string;
  }) {
    try {
      await this.prisma.whatsAppSendLog.create({
        data: {
          laboratoryId: data.laboratoryId,
          patientId: data.patientId ?? null,
          orderId: data.orderId ?? null,
          userId: data.userId,
          phone: data.phone,
          messagePreview: data.messagePreview ?? null,
          status: data.status,
          errorMessage: data.errorMessage ?? null,
        },
      });
    } catch (err) {
      this.logger.error('Failed to write WhatsApp send log', err);
    }
  }

  async getLogs(laboratoryId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.whatsAppSendLog.findMany({
        where: { laboratoryId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          patient: { select: { firstName: true, lastName: true, mrn: true } },
          user: { select: { firstName: true, lastName: true } },
          order: { select: { orderNumber: true } },
        },
      }),
      this.prisma.whatsAppSendLog.count({ where: { laboratoryId } }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
