export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly field?: string;
  public readonly cause?: unknown;

  constructor(
    message: string,
    options: { statusCode?: number; code?: string; field?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? 'INTERNAL_ERROR';
    this.field = options.field;
    this.cause = options.cause;
  }
}
