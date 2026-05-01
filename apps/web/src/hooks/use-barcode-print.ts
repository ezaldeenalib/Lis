import { useState, useCallback } from 'react';
import {
  type BarcodeLabelData,
  generateBarcodeZPL,
  generateMultiCopyZPL,
} from '@/lib/barcode-zpl';
import { sendZPL, type PrintStatus } from '@/lib/zebra-browser-print';
import { useToast } from './use-toast';

export type PrintState = 'idle' | 'printing' | 'success' | 'error';

interface UseBarcodeReturnPrint {
  state: PrintState;
  lastError: string | null;
  /**
   * Print a single barcode label.
   * @param data Label data
   * @param copies Number of copies (default 1)
   */
  print: (data: BarcodeLabelData, copies?: number) => Promise<PrintStatus>;
  /**
   * Print multiple distinct labels in one batch.
   */
  printBatch: (items: BarcodeLabelData[]) => Promise<PrintStatus>;
}

/**
 * React hook for barcode label printing via Zebra BrowserPrint.
 *
 * Usage:
 *   const { print, state } = useBarcodePrint();
 *   await print({ patientName, patientId, sampleType, date, barcode });
 */
export function useBarcodePrint(): UseBarcodeReturnPrint {
  const { toast } = useToast();
  const [state, setState] = useState<PrintState>('idle');
  const [lastError, setLastError] = useState<string | null>(null);

  const handleResult = useCallback(
    (result: PrintStatus) => {
      if (result.ok) {
        setState('success');
        setLastError(null);
        toast.success('تم إرسال الملصق إلى الطابعة');
        setTimeout(() => setState('idle'), 2000);
      } else {
        setState('error');
        setLastError(result.message);
        toast.error(result.message);
        setTimeout(() => setState('idle'), 4000);
      }
      return result;
    },
    [toast],
  );

  const print = useCallback(
    async (data: BarcodeLabelData, copies = 1): Promise<PrintStatus> => {
      setState('printing');
      setLastError(null);
      const zpl =
        copies > 1
          ? generateMultiCopyZPL(data, copies)
          : generateBarcodeZPL(data);
      const result = await sendZPL(zpl);
      return handleResult(result);
    },
    [handleResult],
  );

  const printBatch = useCallback(
    async (items: BarcodeLabelData[]): Promise<PrintStatus> => {
      setState('printing');
      setLastError(null);
      const zpl = items.map((d) => generateBarcodeZPL(d)).join('\n');
      const result = await sendZPL(zpl);
      return handleResult(result);
    },
    [handleResult],
  );

  return { state, lastError, print, printBatch };
}
