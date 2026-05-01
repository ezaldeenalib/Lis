import { BadRequestException } from '@nestjs/common';

export interface InvoiceItemInput {
  price: number;
  quantity: number;
}

export interface InvoiceCalcInput {
  items: InvoiceItemInput[];
  discountType: 'NONE' | 'PERCENTAGE' | 'FIXED';
  discountValue: number;
  taxAmount: number;
  paidAmount: number;
}

export interface InvoiceCalcResult {
  subtotal: number;
  discountAmount: number;
  total: number;
  remaining: number;
  status: 'PENDING' | 'PAID' | 'PARTIAL';
}

/**
 * Pure, stateless invoice calculation — easy to unit-test and reuse.
 * Extendable: add coupon / insurance deductions before the tax step.
 */
export function calculateInvoice(input: InvoiceCalcInput): InvoiceCalcResult {
  for (const item of input.items) {
    if (item.price < 0) {
      throw new BadRequestException('السعر يجب أن يكون أكبر من أو يساوي 0');
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new BadRequestException('الكمية يجب أن تكون عدد صحيح >= 1');
    }
  }

  const subtotal = round2(
    input.items.reduce((sum, i) => sum + i.price * i.quantity, 0),
  );

  let discountAmount = 0;
  if (input.discountType === 'PERCENTAGE') {
    if (input.discountValue < 0 || input.discountValue > 100) {
      throw new BadRequestException('نسبة الخصم يجب أن تكون بين 0 و 100');
    }
    discountAmount = round2(subtotal * (input.discountValue / 100));
  } else if (input.discountType === 'FIXED') {
    discountAmount = round2(input.discountValue);
  }

  if (discountAmount > subtotal) {
    throw new BadRequestException('الخصم لا يمكن أن يتجاوز المبلغ الفرعي');
  }

  if (input.taxAmount < 0) {
    throw new BadRequestException('الضريبة يجب أن تكون >= 0');
  }

  const total = round2(Math.max(0, subtotal - discountAmount + input.taxAmount));
  const paidAmount = round2(Math.max(0, input.paidAmount));
  const remaining = round2(Math.max(0, total - paidAmount));

  let status: InvoiceCalcResult['status'];
  if (remaining <= 0 && total > 0) {
    status = 'PAID';
  } else if (paidAmount <= 0) {
    status = 'PENDING';
  } else {
    status = 'PARTIAL';
  }

  return { subtotal, discountAmount, total, remaining, status };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
