export interface JwtPayload {
  sub: string;
  email: string;
  type: 'platform' | 'laboratory';
  role?: string;
  laboratoryId?: string;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
}

export type OrderStatusType = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type SampleStatusType = 'REGISTERED' | 'COLLECTED' | 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';
export type SampleTestStatusType = 'PENDING' | 'IN_PROGRESS' | 'RESULTED' | 'VALIDATED' | 'REJECTED';
export type ResultFlagType = 'NORMAL' | 'LOW' | 'HIGH' | 'CRITICAL_LOW' | 'CRITICAL_HIGH' | 'ABNORMAL';
