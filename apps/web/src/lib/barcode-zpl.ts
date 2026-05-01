/**
 * ZPL barcode label generator for Zebra printers.
 * Targets a 50mm × 25mm (≈ 400 × 200 dots at 203 DPI) label.
 *
 * Uses Code 128 barcode (^BC) which supports full ASCII.
 */

export interface BarcodeLabelData {
  patientName: string;
  patientId: string;       // MRN
  sampleType: string;
  date: string;            // formatted date string
  barcode: string;         // the sample barcode value (e.g. S-20260403-001)
  age?: string | null;
  sex?: string | null;
  testNames?: string[];    // optional list of test names
}

/**
 * Truncate a string to fit within a given character count, appending "…" if truncated.
 */
function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '..' : s;
}

/**
 * Generate a ZPL string for a single barcode label.
 *
 * Layout (50mm × 25mm, 203 DPI → 400 × 200 dots):
 * ┌────────────────────────────────────────┐
 * │ Patient Name          MRN             │  row 1
 * │ Sample Type  | Age/Sex | Date         │  row 2
 * │ ║║║║║║║ BARCODE ║║║║║║║               │  row 3-4
 * │ S-20260403-001                        │  below barcode
 * │ Tests: CBC, ...                       │  row 5 (optional)
 * └────────────────────────────────────────┘
 */
export function generateBarcodeZPL(data: BarcodeLabelData): string {
  const {
    patientName,
    patientId,
    sampleType,
    date,
    barcode,
    age,
    sex,
    testNames,
  } = data;

  const nameStr = trunc(patientName, 22);
  const mrnStr = trunc(patientId, 14);

  const metaParts = [sampleType];
  if (age) metaParts.push(age);
  if (sex) metaParts.push(sex);
  const metaStr = trunc(metaParts.join(' | '), 26);

  const testsStr =
    testNames && testNames.length > 0
      ? trunc(testNames.join(', '), 38)
      : '';

  const zpl = [
    '^XA',
    // Label dimensions: 400 dots wide, 200 dots tall
    '^PW400',
    '^LL200',
    // Use UTF-8 for Arabic/multilingual (CI28)
    '^CI28',

    // Row 1: patient name (left) + MRN (right)
    `^FO10,10^A0N,22,22^FD${nameStr}^FS`,
    `^FO260,10^A0N,20,20^FD${mrnStr}^FS`,

    // Row 2: meta line (sample type | age/sex | date)
    `^FO10,38^A0N,18,18^FD${metaStr}^FS`,
    `^FO280,38^A0N,18,18^FD${date}^FS`,

    // Separator line
    '^FO10,60^GB380,1,1^FS',

    // Row 3-4: Code 128 barcode
    // ^BY2 = module width 2 dots; ^BCN,60,Y,N,N = height 60, interpretation line below
    '^FO30,68^BY2',
    `^BCN,60,Y,N,N^FD${barcode}^FS`,

    // Row 5: tests (optional, below barcode)
    ...(testsStr
      ? [`^FO10,150^A0N,16,16^FD${testsStr}^FS`]
      : []),

    // Separator at bottom
    '^FO10,175^GB380,1,1^FS',

    '^XZ',
  ];

  return zpl.join('\n');
}

/**
 * Generate ZPL for multiple copies of the same label.
 */
export function generateMultiCopyZPL(
  data: BarcodeLabelData,
  copies: number,
): string {
  const single = generateBarcodeZPL(data);
  return Array.from({ length: copies }, () => single).join('\n');
}
