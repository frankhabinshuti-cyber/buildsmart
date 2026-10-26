/** An error we expect and can safely show to the user. Becomes { error: { code, message, details } }. */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Shorter form used by routes: HttpError(status, message, fieldErrors?) */
export class HttpError extends AppError {
  constructor(status, message, details) {
    super(status, 'ERROR', message, details);
  }
}

export const badRequest = (message, details) => new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Please log in to continue') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have permission to do this') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message) => new AppError(409, 'CONFLICT', message);

export { asyncHandler } from './asyncHandler.js';
