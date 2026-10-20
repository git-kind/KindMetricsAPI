import type { ApiError, ApiResponse, ApiResponsePagination } from '../Models/ApiResponse.js';

export function createError(code: string, message: string, field?: string): ApiError {
  return field ? { code, message, field } : { code, message };
}

export function buildPagination(page: number, pageSize: number, total: number): ApiResponsePagination {
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  return { page, pageSize, total, totalPages };
}

export function buildSuccessResponse<T>(
  data: T,
  requestId: string,
  message = 'Operación exitosa.',
  pagination?: ApiResponsePagination,
): ApiResponse<T> {
  return {
    success: true,
    message,
    data,
    errors: [],
    meta: {
      requestId,
      ...(pagination ? { pagination } : {}),
    },
  };
}

export function buildErrorResponse(
  message: string,
  errors: ApiError[],
  requestId: string,
): ApiResponse<null> {
  return {
    success: false,
    message,
    data: null,
    errors,
    meta: { requestId },
  };
}
