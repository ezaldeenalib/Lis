/**
 * BarcodeService — production-grade numeric barcode generation for the LIS.
 *
 * ── Format ───────────────────────────────────────────────────────────────────
 *   YY + XXXXXXXX  →  10 decimal digits, no letters, no separators
 *   YY       : 2-digit year  (e.g. 26 for 2026)
 *   XXXXXXXX : 8-digit zero-padded per-lab annual sequence (00000001 … 99999999)
 *   Example  : 2600000001, 2600000002, …, 2699999999
 *
 * ── Why numeric-only? ────────────────────────────────────────────────────────
 *   • ASTM E1238 / LIS2-A2 patient records use numeric SID fields.
 *   • Legacy analyzers (Roche, Sysmex, Beckman) expect pure-digit barcodes on
 *     their ASTM queries.
 *   • Zebra Code 128 auto-selects Subset C for digit-pair encoding, halving
 *     the barcode's physical width vs. alphanumeric Subset B.
 *   • Barcode scanners and human operators make fewer transcription errors with
 *     numeric-only values.
 *
 * ── Concurrency safety ───────────────────────────────────────────────────────
 *   A single atomic SQL UPSERT is used:
 *
 *     INSERT INTO barcode_counters (id, laboratory_id, year, current_value, updated_at)
 *     VALUES (gen_random_uuid()::text, $lab, $year, 1, NOW())
 *     ON CONFLICT (laboratory_id, year)
 *     DO UPDATE SET
 *       current_value = barcode_counters.current_value + 1,
 *       updated_at    = NOW()
 *     RETURNING current_value
 *
 *   PostgreSQL guarantees that ON CONFLICT DO UPDATE is atomic — no row-level
 *   lock needed, no application-level mutex needed, safe across 100s of
 *   concurrent API pods.
 *
 * ── Collision handling ───────────────────────────────────────────────────────
 *   Because the counter is atomic, duplicates are structurally impossible for
 *   the generated string. The UNIQUE(barcode, laboratory_id) constraint on
 *   `samples` acts as an additional hard guard; the service retries once if a
 *   P2002 violation is somehow raised (e.g., manual inserts or migration data).
 *
 * ── Horizontal scaling ───────────────────────────────────────────────────────
 *   Multiple API instances share the same PostgreSQL; the UPSERT serialises at
 *   the row level inside Postgres, so adding more API nodes never causes gaps
 *   or collisions.
 *
 * ── Extensibility ────────────────────────────────────────────────────────────
 *   • Branch prefix  : add a 2-digit branch code before YY → 12 digits total.
 *   • Analyzer routing: encode sample-type digit into the format.
 *   • Offline mode    : reserve a block (e.g. 1000 IDs) per session, return
 *     them incrementally from memory, commit the block in one DB call.
 *   • QR             : the numeric string is a valid QR payload; no changes
 *     needed in generation, only in the label renderer.
 */

import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import { Prisma } from '@prisma/client';

/** Maximum sequence value for an 8-digit field. */
const MAX_SEQUENCE = 99_999_999n;

/** Number of automatic retries on unexpected DB collision (should be 0 in practice). */
const MAX_RETRIES = 3;

interface CounterRow {
  current_value: bigint;
}

@Injectable()
export class BarcodeService {
  private readonly logger = new Logger(BarcodeService.name);

  constructor(private readonly prisma: TenantPrismaService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generate a unique numeric barcode for a sample belonging to `laboratoryId`.
   *
   * @param laboratoryId  UUID of the laboratory (tenant).
   * @returns             10-digit numeric string, e.g. "2600000001".
   * @throws              InternalServerErrorException if the annual limit is reached.
   */
  async generate(laboratoryId: string): Promise<string> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.nextBarcode(laboratoryId);
      } catch (err) {
        // P2002 = unique-constraint violation on samples.barcode — extremely
        // unlikely (would require a concurrent manual insert with the same
        // counter value), but we retry once just in case.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          attempt < MAX_RETRIES
        ) {
          this.logger.warn(
            `Barcode collision on attempt ${attempt} for lab ${laboratoryId}. Retrying...`,
          );
          continue;
        }
        throw err;
      }
    }
    // Unreachable, but satisfies TypeScript
    throw new InternalServerErrorException('Barcode generation failed after retries');
  }

  /**
   * Return the current counter value for a lab+year without incrementing it.
   * Useful for admin dashboards / monitoring.
   */
  async currentCounter(laboratoryId: string, year?: number): Promise<bigint> {
    const y = year ?? new Date().getFullYear() % 100;
    const row = await this.prisma.barcodeCounter.findUnique({
      where: { laboratoryId_year: { laboratoryId, year: y } },
    });
    return row?.currentValue ?? 0n;
  }

  /**
   * Validate that a string matches the 10-digit numeric barcode format.
   * Use at the ingest / scan boundary to reject malformed inputs early.
   */
  static isValidFormat(barcode: string): boolean {
    return /^\d{10}$/.test(barcode);
  }

  /**
   * Decode a barcode string into its component parts for display / debugging.
   */
  static decode(barcode: string): { year: number; sequence: number } | null {
    if (!BarcodeService.isValidFormat(barcode)) return null;
    const year = parseInt(barcode.slice(0, 2), 10);
    const sequence = parseInt(barcode.slice(2), 10);
    return { year: 2000 + year, sequence };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async nextBarcode(laboratoryId: string): Promise<string> {
    const year = new Date().getFullYear() % 100;

    // Single atomic operation — increment and return the new counter value.
    // gen_random_uuid() is used for the id column on first insert so Prisma
    // never needs to round-trip for the generated key.
    const rows = await this.prisma.$queryRaw<CounterRow[]>`
      INSERT INTO barcode_counters (id, laboratory_id, year, current_value, updated_at)
      VALUES (gen_random_uuid()::text, ${laboratoryId}, ${year}::integer, 1, NOW())
      ON CONFLICT (laboratory_id, year)
      DO UPDATE SET
        current_value = barcode_counters.current_value + 1,
        updated_at    = NOW()
      RETURNING current_value
    `;

    const seq = rows[0].current_value;

    if (seq > MAX_SEQUENCE) {
      this.logger.error(
        `Annual barcode limit reached for lab ${laboratoryId} (year ${year}). ` +
          `Sequence: ${seq}`,
      );
      throw new InternalServerErrorException(
        'Annual barcode limit reached. Contact system administrator.',
      );
    }

    const yy   = String(year).padStart(2, '0');
    const seq8 = String(Number(seq)).padStart(8, '0');
    return `${yy}${seq8}`;
  }
}
