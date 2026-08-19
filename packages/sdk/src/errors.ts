export function sanitizeMessage(input: string): string {
  if (!input) return input;
  return input.replace(/gami_live_[a-zA-Z0-9_-]+/g, '[REDACTED_API_KEY]');
}

export class GamiError extends Error {
  public readonly status?: number;
  public readonly code?: string;
  public readonly requestId?: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    options?: {
      status?: number;
      code?: string;
      requestId?: string;
      details?: unknown;
    }
  ) {
    const cleanMsg = sanitizeMessage(message);
    super(cleanMsg);
    this.name = 'GamiError';
    this.status = options?.status;
    this.code = options?.code;
    this.requestId = options?.requestId;
    this.details = options?.details;

    // Maintain proper prototype chain for custom Error subclass
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class GamiAuthenticationError extends GamiError {
  constructor(
    message = 'Authentication failed. Check your API key.',
    options?: { code?: string; requestId?: string; details?: unknown }
  ) {
    super(message, { status: 401, code: options?.code || 'UNAUTHORIZED', ...options });
    this.name = 'GamiAuthenticationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class GamiAuthorizationError extends GamiError {
  constructor(
    message = 'Forbidden. Insufficient permissions for this resource.',
    options?: { code?: string; requestId?: string; details?: unknown }
  ) {
    super(message, { status: 403, code: options?.code || 'FORBIDDEN', ...options });
    this.name = 'GamiAuthorizationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class GamiValidationError extends GamiError {
  constructor(
    message = 'Validation failed for request parameters.',
    options?: { status?: number; code?: string; requestId?: string; details?: unknown }
  ) {
    super(message, { status: options?.status || 400, code: options?.code || 'BAD_REQUEST', ...options });
    this.name = 'GamiValidationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class GamiNotFoundError extends GamiError {
  constructor(
    message = 'Resource not found.',
    options?: { code?: string; requestId?: string; details?: unknown }
  ) {
    super(message, { status: 404, code: options?.code || 'NOT_FOUND', ...options });
    this.name = 'GamiNotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class GamiRateLimitError extends GamiError {
  public readonly retryAfterSeconds?: number;

  constructor(
    message = 'Rate limit exceeded. Too many requests.',
    options?: { requestId?: string; details?: unknown; retryAfterSeconds?: number }
  ) {
    super(message, { status: 429, code: 'TOO_MANY_REQUESTS', ...options });
    this.name = 'GamiRateLimitError';
    this.retryAfterSeconds = options?.retryAfterSeconds;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class GamiServerError extends GamiError {
  constructor(
    message = 'Internal server error occurred on Gami server.',
    options?: { status?: number; requestId?: string; details?: unknown }
  ) {
    super(message, { status: options?.status || 500, code: 'INTERNAL_SERVER_ERROR', ...options });
    this.name = 'GamiServerError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class GamiNetworkError extends GamiError {
  constructor(
    message = 'Network error occurred while connecting to Gami API.',
    options?: { details?: unknown }
  ) {
    super(message, { status: 0, code: 'NETWORK_ERROR', ...options });
    this.name = 'GamiNetworkError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
