import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { WhatsAppSendStatus } from '@prisma/client';
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import * as qrcode from 'qrcode';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import {
  DEFAULT_WHATSAPP_RESULTS_TEMPLATE,
  WHATSAPP_RESULTS_TEMPLATE_SETTINGS_KEY,
  WHATSAPP_TEMPLATE_PLACEHOLDERS,
} from './whatsapp-template.constants';

export type WAStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'DISABLED';

@Injectable()
export class WhatsAppService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppService.name);

  /** Root directory where whatsapp-web.js stores LocalAuth payloads (outside git in prod). */
  private readonly whatsappAuthDataPath: string;
  /** When false (WHATSAPP_ENABLED=0|false|no|off): no Puppeteer / session on this instance. */
  private readonly whatsappEnabled: boolean;

  private client: Client | null = null;
  private _status: WAStatus = 'DISCONNECTED';
  private _qrDataUrl: string | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Kills a CONNECTING→stuck scenario: if no qr/ready/error within 90 s, treat as failed. */
  private _connectTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly config: ConfigService,
  ) {
    const rawEnable = (
      this.config.get<string>('WHATSAPP_ENABLED', 'true') ?? 'true'
    ).trim()
      .toLowerCase();
    this.whatsappEnabled = !['0', 'false', 'no', 'off'].includes(rawEnable);

    const fromEnv =
      this.config.get<string>('WHATSAPP_AUTH_DATA_PATH', '') ?? '';
    this.whatsappAuthDataPath =
      fromEnv.trim() !== ''
        ? path.resolve(fromEnv.trim())
        : path.join(process.cwd(), '.wwebjs_auth');
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async onModuleInit() {
    if (!this.whatsappEnabled) {
      this._status = 'DISABLED';
      this.logger.log(
        'WHATSAPP_ENABLED is off — wa.me session not started on this replica.',
      );
      return;
    }

    try {
      fs.mkdirSync(this.whatsappAuthDataPath, { recursive: true, mode: 0o700 });
    } catch {
      /* non-fatal: LocalAuth may still create subdirs */
    }

    this.startClient();
  }

  async onModuleDestroy() {
    this.clearReconnectTimer();
    this.clearConnectTimeout();
    try { await this.client?.destroy(); } catch { /* ignore on shutdown */ }
  }

  // ── Public accessors ───────────────────────────────────────────────────────

  get status(): WAStatus { return this._status; }
  get qrDataUrl(): string | null { return this._qrDataUrl; }

  getStatusInfo() {
    return {
      enabled: this.whatsappEnabled,
      status: this._status,
      qr: this._qrDataUrl,
    };
  }

  // ── Client lifecycle ───────────────────────────────────────────────────────

  /**
   * Prefer a real Chrome/Edge binary on Windows/macOS — bundled Chromium often hangs/fails silently.
   * Set `WHATSAPP_CHROME_EXECUTABLE` or `PUPPETEER_EXECUTABLE_PATH` if auto-detect misses.
   */
  private resolvePuppeteerExecutablePath(): string | undefined {
    const tryConfigured = (
      cfgKey: 'WHATSAPP_CHROME_EXECUTABLE' | 'PUPPETEER_EXECUTABLE_PATH',
      envKey: string,
    ): string | undefined => {
      const raw = (
        this.config.get<string>(cfgKey, '') ||
        process.env[envKey] ||
        ''
      ).trim();
      if (!raw) return undefined;
      const candidates = path.isAbsolute(raw)
        ? [raw]
        : [path.resolve(process.cwd(), raw), raw];
      for (const p of candidates) {
        if (fs.existsSync(p)) return path.normalize(p);
      }
      this.logger.warn(`WhatsApp: ${cfgKey} path not found on disk (${raw}). Falling back.`);
      return undefined;
    };

    return (
      tryConfigured('WHATSAPP_CHROME_EXECUTABLE', 'WHATSAPP_CHROME_EXECUTABLE') ??
      tryConfigured('PUPPETEER_EXECUTABLE_PATH', 'PUPPETEER_EXECUTABLE_PATH')
    );

    if (process.platform === 'win32') {
      const fromLocal: string[] = [];
      const rawLocalAppData = process.env.LOCALAPPDATA ?? '';
      if (rawLocalAppData.length > 0) {
        fromLocal.push(
          path.join(rawLocalAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
          path.join(rawLocalAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        );
      }
      const candidates = [
        ...fromLocal,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env['ProgramFiles'] ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env['ProgramFiles(x86)'] ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env['ProgramFiles'] ?? '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ];

      for (const p of candidates) {
        try {
          if (fs.existsSync(p)) return path.normalize(p);
        } catch {
          /* ignore */
        }
      }
    }

    if (process.platform === 'darwin') {
      const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      if (fs.existsSync(mac)) return mac;
      const macEdge =
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
      if (fs.existsSync(macEdge)) return macEdge;
    }

    return undefined;
  }

  /** Launch options forwarded to Puppeteer (`whatsapp-web.js`). */
  private buildPuppeteerOptions() {
    /** Linux/container flags only — avoid `--no-zygote` on Windows (known hangs). */
    const linuxSandbox =
      process.platform === 'linux'
        ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        : ['--disable-dev-shm-usage'];

    const exe = this.resolvePuppeteerExecutablePath();
    const opts = {
      // `new` headless behaves better with WhatsApp Web than legacy headless.
      headless: 'new' as const,
      args: [
        ...linuxSandbox,
        '--no-first-run',
        '--disable-blink-features=AutomationControlled',
        '--disable-extensions',
        '--disable-gpu',
      ],
      ...(exe ? { executablePath: exe as string } : {}),
    };

    if (exe) {
      this.logger.log(`WhatsApp: launching browser at ${exe}`);
    } else if (process.platform === 'win32' || process.platform === 'darwin') {
      this.logger.warn(
        'WhatsApp: no Chrome/Edge binary found — using Puppeteer Chromium. Install Chrome or set WHATSAPP_CHROME_EXECUTABLE.',
      );
    }

    return opts;
  }

  private clearConnectTimeout() {
    if (this._connectTimeoutTimer) {
      clearTimeout(this._connectTimeoutTimer);
      this._connectTimeoutTimer = null;
    }
  }

  private startConnectTimeout(timeoutMs = 120_000) {
    this.clearConnectTimeout();
    this._connectTimeoutTimer = setTimeout(() => {
      if (this._status === 'CONNECTING') {
        this.logger.error(
          `WhatsApp stuck in CONNECTING for ${timeoutMs / 1000}s — forcing reconnect.`,
        );
        this.logger.warn(
          'Tips: delete .wwebjs_auth/session if the profile is corrupted; on Windows ensure Google Chrome is installed or set WHATSAPP_CHROME_EXECUTABLE.',
        );
        this._status = 'DISCONNECTED';
        this._qrDataUrl = null;
        try { void this.client?.destroy(); } catch { /* ignore */ }
        this.client = null;
        this.scheduleReconnect();
      }
    }, timeoutMs);
  }

  private startClient() {
    this.clearReconnectTimer();
    this.clearConnectTimeout();
    this._status = 'CONNECTING';
    this._qrDataUrl = null;
    this.logger.log('WhatsApp: starting client (Puppeteer/Chrome initializing)...');

    try {
      const sessionId = (
        this.config.get<string>('WHATSAPP_SESSION_ID', '') ?? ''
      ).trim();
      const localOpts: { dataPath: string; clientId?: string } = {
        dataPath: this.whatsappAuthDataPath,
      };
      if (sessionId) localOpts.clientId = sessionId;

      this.client = new Client({
        authStrategy: new LocalAuth(localOpts),
        puppeteer: this.buildPuppeteerOptions(),
      });

      this.client.on('authenticated', () => {
        // Extend watchdog: authenticated → ready/sync can legitimately take a while.
        this.startConnectTimeout(120_000);
        this.logger.log('WhatsApp: authenticated (waiting for sync / ready)');
      });

      this.client.on('qr', async (qr: string) => {
        this.clearConnectTimeout(); // QR received — Chrome is alive
        try {
          this._qrDataUrl = await qrcode.toDataURL(qr);
          this._status = 'CONNECTING';
          this.logger.log('WhatsApp QR code generated — awaiting scan');
        } catch (err) {
          this.logger.error('Failed to generate QR data URL', err);
        }
      });

      this.client.on('ready', () => {
        this.clearConnectTimeout();
        this._status = 'CONNECTED';
        this._qrDataUrl = null;
        this.logger.log('WhatsApp client is ready and connected');
      });

      this.client.on('auth_failure', (msg: string) => {
        this.clearConnectTimeout();
        this.logger.error(`WhatsApp authentication failure: ${msg}`);
        this._status = 'DISCONNECTED';
        this._qrDataUrl = null;
        this.scheduleReconnect();
      });

      this.client.on('disconnected', (reason: string) => {
        this.clearConnectTimeout();
        this.logger.warn(`WhatsApp disconnected: ${reason}`);
        this._status = 'DISCONNECTED';
        this._qrDataUrl = null;
        this.scheduleReconnect();
      });

      // Start the 90-second connect watchdog
      this.startConnectTimeout();

      this.client.initialize().catch((err: Error) => {
        this.clearConnectTimeout();
        this.logger.error('WhatsApp initialize() threw:', err.message);
        this._status = 'DISCONNECTED';
        this.scheduleReconnect();
      });
    } catch (err) {
      this.clearConnectTimeout();
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

  /**
   * User-initiated logout: destroy session on disk so a fresh pairing is required.
   * Must schedule `startClient()` afterwards — otherwise the client never restarts
   * and `/status` stays DISCONNECTED with no QR (user cannot scan again).
   */
  async disconnect() {
    if (!this.whatsappEnabled) {
      this.logger.warn('disconnect() ignored — WhatsApp is disabled on this instance.');
      return;
    }
    this.clearReconnectTimer();
    try { await this.client?.logout(); } catch { /* ignore */ }
    try { await this.client?.destroy(); } catch { /* ignore */ }
    this._status = 'DISCONNECTED';
    this._qrDataUrl = null;
    this.client = null;
    // Restart the client so WhatsApp can emit a new QR for re-linking (same as auth_failure path).
    this.scheduleReconnect(2_000);
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
    if (!this.whatsappEnabled) {
      throw new Error('واتساب معطّل على هذا الخادم (WHATSAPP_ENABLED).');
    }
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

  // ── Lab-scoped message template (Laboratory.settings JSON) ─────────────────

  private mergeLabSettings(
    current: Prisma.JsonValue,
    patch: Record<string, unknown>,
  ): Prisma.InputJsonValue {
    const obj =
      typeof current === 'object' && current !== null && !Array.isArray(current)
        ? { ...(current as Record<string, unknown>) }
        : {};
    return { ...obj, ...patch } as Prisma.InputJsonValue;
  }

  async getResultsMessageTemplate(laboratoryId: string) {
    const lab = await this.prisma.laboratory.findUnique({
      where: { id: laboratoryId },
      select: { name: true, settings: true },
    });
    if (!lab) throw new NotFoundException('المختبر غير موجود');

    const s =
      typeof lab.settings === 'object' && lab.settings !== null && !Array.isArray(lab.settings)
        ? (lab.settings as Record<string, unknown>)
        : {};
    const custom =
      typeof s[WHATSAPP_RESULTS_TEMPLATE_SETTINGS_KEY] === 'string'
        ? (s[WHATSAPP_RESULTS_TEMPLATE_SETTINGS_KEY] as string)
        : null;
    const trimmed = custom?.trim() ?? '';
    const usingCustom = trimmed.length > 0;
    const template = usingCustom ? trimmed : DEFAULT_WHATSAPP_RESULTS_TEMPLATE;

    return {
      template,
      defaultTemplate: DEFAULT_WHATSAPP_RESULTS_TEMPLATE,
      usingCustom,
      labName: lab.name,
      placeholders: WHATSAPP_TEMPLATE_PLACEHOLDERS,
    };
  }

  async setResultsMessageTemplate(laboratoryId: string, template: string): Promise<void> {
    const trimmed = template.trim();
    const lab = await this.prisma.laboratory.findUnique({
      where: { id: laboratoryId },
      select: { settings: true },
    });
    if (!lab) throw new NotFoundException('المختبر غير موجود');

    await this.prisma.laboratory.update({
      where: { id: laboratoryId },
      data: {
        settings: this.mergeLabSettings(lab.settings, {
          [WHATSAPP_RESULTS_TEMPLATE_SETTINGS_KEY]: trimmed,
        }),
      },
    });
  }

  async clearResultsMessageTemplate(laboratoryId: string): Promise<void> {
    const lab = await this.prisma.laboratory.findUnique({
      where: { id: laboratoryId },
      select: { settings: true },
    });
    if (!lab) throw new NotFoundException('المختبر غير موجود');

    const s =
      typeof lab.settings === 'object' && lab.settings !== null && !Array.isArray(lab.settings)
        ? ({ ...(lab.settings as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    delete s[WHATSAPP_RESULTS_TEMPLATE_SETTINGS_KEY];

    await this.prisma.laboratory.update({
      where: { id: laboratoryId },
      data: { settings: s as Prisma.InputJsonValue },
    });
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
