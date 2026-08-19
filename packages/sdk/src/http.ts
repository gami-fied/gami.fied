import {
  GamiAuthenticationError,
  GamiAuthorizationError,
  GamiError,
  GamiNetworkError,
  GamiNotFoundError,
  GamiRateLimitError,
  GamiServerError,
  GamiValidationError,
  sanitizeMessage,
} from './errors.js';
import type { GamiConfig, RetryConfig } from './types.js';

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  headers?: Record<string, string>;
  /** Idempotency key to forward (reused identically across retry attempts) */
  idempotencyKey?: string;
}

export class HttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly customHeaders: Record<string, string>;
  private readonly retryConfig: Required<RetryConfig>;

  constructor(config: GamiConfig) {
    if (!config.apiKey || typeof config.apiKey !== 'string') {
      throw new GamiAuthenticationError(
        'Gami SDK client requires a valid apiKey string. Provide apiKey in GamiConfig.'
      );
    }

    this.apiKey = config.apiKey.trim();
    // Default base URL is configurable and strip trailing slash
    const base = config.baseUrl || 'http://localhost:3001';
    this.baseUrl = base.replace(/\/+$/, '');
    this.timeout = config.timeout ?? 10000;
    this.customHeaders = config.headers || {};

    this.retryConfig = {
      maxRetries: config.retry?.maxRetries ?? 3,
      initialDelayMs: config.retry?.initialDelayMs ?? 300,
      maxDelayMs: config.retry?.maxDelayMs ?? 3000,
    };
  }

  /**
   * Helper to format URL with query parameters
   */
  private buildUrl(path: string, query?: HttpRequestOptions['query']): string {
    const relativePath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${relativePath}`);

    if (query) {
      Object.entries(query).forEach(([key, val]) => {
        if (val !== undefined && val !== null) {
          url.searchParams.append(key, String(val));
        }
      });
    }

    return url.toString();
  }

  /**
   * Safe sleep function for exponential backoff retries
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Determines if an error/status code is transient and eligible for retry.
   */
  private isTransient(status?: number): boolean {
    if (!status) return true; // Network errors / timeouts
    return [408, 429, 500, 502, 503, 504].includes(status);
  }

  /**
   * Executes HTTP request with transient retry logic, reusing the same idempotency key across attempts.
   */
  public async request<T>(options: HttpRequestOptions): Promise<T> {
    const url = this.buildUrl(options.path, options.query);
    const method = options.method || 'GET';

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'x-api-key': this.apiKey,
      ...this.customHeaders,
      ...options.headers,
    };

    if (options.body !== undefined && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    const bodyData = options.body ? JSON.stringify(options.body) : undefined;
    const maxAttempts = Math.max(1, this.retryConfig.maxRetries + 1);

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(url, {
          method,
          headers,
          body: bodyData,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Handle success (2xx)
        if (response.ok) {
          // Parse JSON if response has content
          const text = await response.text();
          if (!text || text.trim() === '') {
            return {} as T;
          }
          try {
            return JSON.parse(text) as T;
          } catch {
            return text as unknown as T;
          }
        }

        // Parse Error Response Body
        let errorData: {
          error?: string | { code?: string; message?: string; requestId?: string; details?: unknown };
          message?: string;
          code?: string;
          details?: unknown;
        } = {};
        try {
          const errText = await response.text();
          if (errText) {
            errorData = JSON.parse(errText);
          }
        } catch {
          // Non-JSON response
        }

        const nestedObj =
          typeof errorData.error === 'object' && errorData.error !== null ? errorData.error : undefined;

        const requestId =
          response.headers.get('x-request-id') ||
          response.headers.get('request-id') ||
          nestedObj?.requestId ||
          undefined;

        const errorCode = nestedObj?.code || errorData.code;

        const rawMsg =
          nestedObj?.message ||
          errorData.message ||
          (typeof errorData.error === 'string' ? errorData.error : undefined) ||
          `HTTP request failed with status ${response.status}`;
        const cleanMsg = sanitizeMessage(rawMsg);

        const details = nestedObj?.details || errorData.details;

        // Map HTTP Status to Typed SDK Error Class
        let sdkError: GamiError;
        if (response.status === 401) {
          sdkError = new GamiAuthenticationError(cleanMsg, {
            requestId,
            code: errorCode || 'UNAUTHORIZED',
            details,
          });
        } else if (response.status === 403) {
          sdkError = new GamiAuthorizationError(cleanMsg, {
            requestId,
            code: errorCode || 'FORBIDDEN',
            details,
          });
        } else if (response.status === 404) {
          sdkError = new GamiNotFoundError(cleanMsg, {
            requestId,
            code: errorCode || 'NOT_FOUND',
            details,
          });
        } else if (response.status === 400 || response.status === 422) {
          sdkError = new GamiValidationError(cleanMsg, {
            status: response.status,
            requestId,
            code: errorCode || 'BAD_REQUEST',
            details,
          });
        } else if (response.status === 429) {
          const retryHeader = response.headers.get('retry-after');
          const retrySecs = retryHeader ? parseInt(retryHeader, 10) : undefined;
          sdkError = new GamiRateLimitError(cleanMsg, {
            requestId,
            details: errorData.details,
            retryAfterSeconds: isNaN(retrySecs!) ? undefined : retrySecs,
          });
        } else if (response.status >= 500) {
          sdkError = new GamiServerError(cleanMsg, {
            status: response.status,
            requestId,
            details: errorData.details,
          });
        } else {
          sdkError = new GamiError(cleanMsg, {
            status: response.status,
            requestId,
            details: errorData.details,
          });
        }

        // Check if transient & retries remaining
        if (this.isTransient(response.status) && attempt < maxAttempts) {
          lastError = sdkError;
          const backoff = Math.min(
            this.retryConfig.maxDelayMs,
            this.retryConfig.initialDelayMs * Math.pow(2, attempt - 1)
          );
          await this.delay(backoff);
          continue;
        }

        throw sdkError;
      } catch (err: unknown) {
        clearTimeout(timeoutId);

        // If it's already an instance of GamiError, check retry eligibility or rethrow
        if (err instanceof GamiError) {
          if (this.isTransient(err.status) && attempt < maxAttempts) {
            lastError = err;
            const backoff = Math.min(
              this.retryConfig.maxDelayMs,
              this.retryConfig.initialDelayMs * Math.pow(2, attempt - 1)
            );
            await this.delay(backoff);
            continue;
          }
          throw err;
        }

        // Handle network/abort/fetch errors
        const isAbort = (err as Error)?.name === 'AbortError';
        const msg = isAbort
          ? `Request timed out after ${this.timeout}ms`
          : (err as Error)?.message || 'Failed to connect to Gami API server';

        const netError = new GamiNetworkError(sanitizeMessage(msg), { details: err });

        if (attempt < maxAttempts) {
          lastError = netError;
          const backoff = Math.min(
            this.retryConfig.maxDelayMs,
            this.retryConfig.initialDelayMs * Math.pow(2, attempt - 1)
          );
          await this.delay(backoff);
          continue;
        }

        throw netError;
      }
    }

    throw lastError || new GamiNetworkError('Request failed after max retries');
  }
}
