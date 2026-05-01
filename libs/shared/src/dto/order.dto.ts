export interface CreateOrderDto {
  patientId: string;
  priority?: 'STAT' | 'URGENT' | 'ROUTINE';
  clinicalNotes?: string;
  physicianName?: string;
  services: string[];
  panels?: string[];
}

export interface CreateSampleDto {
  orderId: string;
  sampleType?: 'BLOOD' | 'URINE' | 'SERUM' | 'PLASMA' | 'CSF' | 'STOOL' | 'SWAB' | 'TISSUE' | 'OTHER';
  notes?: string;
}

export interface EnterResultDto {
  sampleTestId: string;
  value: string;
  unit?: string;
  normalRange?: string;
  flag?: 'NORMAL' | 'LOW' | 'HIGH' | 'CRITICAL_LOW' | 'CRITICAL_HIGH' | 'ABNORMAL';
  notes?: string;
}

export interface ValidateResultDto {
  sampleTestId: string;
  notes?: string;
}
