import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../Errors/AppError.js';
import { buildErrorResponse, createError } from '../Helpers/ResponseHelper.js';
import type { ApiError } from '../Models/ApiResponse.js';

function normalizeErrorCollection(error: unknown): ApiError[] {
  if (error && typeof error === 'object' && 'validation' in error) {
    const validation = Array.isArray(error.validation) ? error.validation : [];
    return validation
      .map((issue) => {
        if (!issue || typeof issue !== 'object') {
          return createError('VALIDATION_ERROR', 'Hay errores de validación.');
        }

        const pathValue = 'path' in issue && Array.isArray(issue.path) ? issue.path.join('.') : undefined;
        const messageValue = 'message' in issue && typeof issue.message === 'string' ? issue.message : 'Hay errores de validación.';
        return createError('VALIDATION_ERROR', messageValue, pathValue);
      })
      .filter((item) => Boolean(item.message));
  }

  return [createError('INTERNAL_ERROR', 'Ocurrió un error inesperado.')];
}

function isDatabaseConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error) || typeof error.code !== 'string') {
    return false;
  }

  return [
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EHOSTUNREACH',
    'ECONNRESET',
    'PROTOCOL_CONNECTION_LOST',
  ].includes(error.code);
}

export function handleApiError(error: unknown, request: FastifyRequest, reply: FastifyReply): void {
  const requestId = request.id;

  if (error instanceof AppError) {
    reply.code(error.statusCode).send(
      buildErrorResponse(error.message, [createError(error.code, error.message, error.field)], requestId),
    );
    return;
  }

  const statusCode = isDatabaseConnectionError(error)
    ? 503
    : error && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === 'number'
      ? error.statusCode
      : 500;

  let message = 'Ocurrió un error inesperado.';
  let errors: ApiError[] = [createError('INTERNAL_ERROR', message)];

  if (statusCode === 503) {
    message = 'No se pudo conectar con la base de datos. Verifica que MySQL esté iniciado y que el host y puerto sean correctos.';
    errors = [createError('DATABASE_UNAVAILABLE', message)];
  } else if (error && typeof error === 'object') {
    if ('message' in error && typeof error.message === 'string') {
      message = error.message;
    }

    if (statusCode === 400) {
      message = 'Existen errores de validación.';
      errors = normalizeErrorCollection(error);
    } else if (statusCode === 401) {
      message = 'No autorizado.';
      errors = [createError('UNAUTHORIZED', 'Credenciales no válidas o sesión expirada.')];
    } else if (statusCode === 403) {
      message = 'Acceso denegado.';
      errors = [createError('FORBIDDEN', 'No tienes permisos para realizar esta acción.')];
    } else if (statusCode === 404) {
      message = 'Recurso no encontrado.';
      errors = [createError('NOT_FOUND', 'El recurso solicitado no existe.')];
    } else if (statusCode === 409) {
      message = 'Conflicto de negocio.';
      errors = [createError('CONFLICT', message)];
    } else if (statusCode === 429) {
      message = 'Demasiadas solicitudes.';
      errors = [createError('RATE_LIMIT_EXCEEDED', message)];
    }
  }

  request.log.error({ err: error }, 'request failed');
  reply.code(statusCode).send(buildErrorResponse(message, errors, requestId));
}
