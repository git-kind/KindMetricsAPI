export interface ApiError {
  code: string;
  message: string;
  field?: string;
}

export interface ApiResponsePagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiResponseMeta {
  requestId: string;
  pagination?: ApiResponsePagination;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
  errors: ApiError[];
  meta: ApiResponseMeta;
}
