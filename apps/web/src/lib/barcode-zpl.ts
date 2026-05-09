/**
 * ZPL barcode label generator for Zebra printers.
 * Label: 50 mm × 30 mm  (400 × 240 dots @ 203 DPI)
 *
 * Arabic rendering notes:
 *   ^CI28 activates UTF-8.  On modern Zebra firmware (Link-OS, ZD/ZT series)
 *   Arabic text in ^FD renders correctly.  On older firmware it appears blank.
 *   We therefore always print MRN (numeric, guaranteed ASCII) prominently under
 *   the barcode so staff can identify the sample on any printer model.
 *   The patient name in Row-1 shows on capable printers.
 *
 * Barcode value: numeric YYXXXXXXXX — compatible with ASTM / all analyzers.
 */

export interface BarcodeLabelData {
  patientName: string;
  patientId: string;    // MRN
  sampleType: string;
  date: string;
  barcode: string;
  age?: string | null;
  sex?: string | null;
  testNames?: string[];
}

/** Remove ZPL control characters that would break a field. */
function safe(s: string): string {
  return (s ?? '').replace(/[\^~\\]/g, ' ').trim();
}

/** Truncate with ".." if longer than max chars. */
function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '..' : s;
}

/**
 * Layout (400 × 240 dots):
 * ┌─────────────────────────────────────────┐
 * │  Patient Name (Arabic/Latin)   MRN      │  y=8   ← shows on modern Zebra
 * │  SampleType | Age | Sex        Date     │  y=34
 * ├─────────────────────────────────────────┤  y=57
 * │  ║║║║║║  BARCODE  ║║║║║║               │  y=65
 * │  2600000001  (auto from ^BC)            │
 * │  MRN: 000123   (large, always visible)  │  y=138
 * │  Tests: CBC, WBC, ...                   │  y=162
 * └─────────────────────────────────────────┘
 */
export function generateBarcodeZPL(data: BarcodeLabelData): string {
  const patientName = safe(data.patientName);
  const mrn         = safe(data.patientId);
  const sampleType  = safe(data.sampleType);
  const dateStr     = safe(data.date);
  const barcodeVal  = safe(data.barcode);

  // Row-1: truncate to fit 400-dot width at font size 22
  const nameRow1 = trunc(patientName, 20);
  const mrnRow1  = trunc(mrn, 14);

  // Row-2: meta
  const metaParts = [sampleType];
  if (data.age) metaParts.push(safe(data.age));
  if (data.sex) metaParts.push(safe(data.sex));
  const metaStr = trunc(metaParts.join(' | '), 26);

  // Tests line (ASCII codes like CBC, WBC — always visible)
  const testsStr = data.testNames && data.testNames.length > 0
    ? trunc(data.testNames.map(safe).join(', '), 40)
    : '';

  // MRN displayed below barcode in large text — works on ALL printers
  const mrnLine = mrn.length > 0 ? `MRN: ${mrn}` : '';

  const lines: string[] = [
    '^XA',
    '^PW400',
    '^LL240',

    // UTF-8 — Arabic renders on modern Zebra firmware (Link-OS)
    '^CI28',

    // ── Row 1: اسم المريض (left, large) + MRN (right, smaller) ──────────
    `^FO8,8^A0N,22,22^FD${nameRow1}^FS`,
    `^FO260,10^A0N,18,18^FD${mrnRow1}^FS`,

    // ── Row 2: نوع العينة | التاريخ ───────────────────────────────────────
    `^FO8,34^A0N,17,17^FD${metaStr}^FS`,
    `^FO270,34^A0N,17,17^FD${dateStr}^FS`,

    // ── Divider ────────────────────────────────────────────────────────────
    '^FO8,57^GB384,1,1^FS',

    // ── Barcode (Code 128, height 50, human-readable line printed by ^BC) ─
    '^FO30,65^BY2',
    `^BCN,50,Y,N,N^FD${barcodeVal}^FS`,

    // ── MRN in large bold text below barcode (ASCII → always visible) ──────
    ...(mrnLine ? [`^FO8,138^A0N,20,20^FD${mrnLine}^FS`] : []),

    // ── Test codes (ASCII lab codes like CBC, WBC → always visible) ────────
    ...(testsStr ? [`^FO8,162^A0N,14,14^FD${testsStr}^FS`] : []),

    // ── Bottom divider ─────────────────────────────────────────────────────
    '^FO8,198^GB384,1,1^FS',

    '^XZ',
  ];

  return lines.join('\n');
}

/** Generate ZPL for N identical copies of one label. */
export function generateMultiCopyZPL(
  data: BarcodeLabelData,
  copies: number,
): string {
  const single = generateBarcodeZPL(data);
  return Array.from({ length: copies }, () => single).join('\n');
}
