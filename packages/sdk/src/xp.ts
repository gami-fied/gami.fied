import type { HttpClient } from './http.js';
import type {
  AdjustXpParams,
  GetXpLedgerParams,
  GetXpParams,
  XpBalanceResponse,
  XpLedgerEntry,
  XpLedgerResponse,
  XpSummaryResponse,
} from './types.js';

export class XpResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get user's current total XP balance.
   * Calls GET /api/projects/:projectId/users/:userId/xp
   */
  public async getBalance(params: GetXpParams): Promise<XpBalanceResponse> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.xp.getBalance()');
    }
    if (!params.userId) {
      throw new Error('userId is required for gami.xp.getBalance()');
    }

    return this.http.request<XpBalanceResponse>({
      method: 'GET',
      path: `/api/projects/${params.projectId}/users/${params.userId}/xp`,
    });
  }

  /**
   * Get user's XP ledger transaction history (paginated).
   * Calls GET /api/projects/:projectId/users/:userId/xp/ledger
   */
  public async getLedger(params: GetXpLedgerParams): Promise<XpLedgerResponse> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.xp.getLedger()');
    }
    if (!params.userId) {
      throw new Error('userId is required for gami.xp.getLedger()');
    }

    return this.http.request<XpLedgerResponse>({
      method: 'GET',
      path: `/api/projects/${params.projectId}/users/${params.userId}/xp/ledger`,
      query: {
        page: params.page ?? 1,
        limit: params.limit ?? 20,
      },
    });
  }

  /**
   * Get project XP summary & top user metrics.
   * Calls GET /api/projects/:projectId/xp/summary
   */
  public async getSummary(params: { projectId: string }): Promise<XpSummaryResponse> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.xp.getSummary()');
    }

    return this.http.request<XpSummaryResponse>({
      method: 'GET',
      path: `/api/projects/${params.projectId}/xp/summary`,
    });
  }

  /**
   * Manually adjust XP for a user (Admin/Owner API Key scope).
   * Calls POST /api/projects/:projectId/users/:userId/xp/adjust
   * Automatically generates ONE Idempotency-Key per invocation if not provided,
   * reusing the exact same key across automatic retries.
   */
  public async adjust(params: AdjustXpParams): Promise<XpLedgerEntry> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.xp.adjust()');
    }
    if (!params.userId) {
      throw new Error('userId is required for gami.xp.adjust()');
    }
    if (params.amount === undefined || params.amount === 0) {
      throw new Error('Non-zero amount is required for gami.xp.adjust()');
    }
    if (!params.reason) {
      throw new Error('reason is required for gami.xp.adjust()');
    }

    // Generate ONE idempotency key if not provided by caller, and reuse across retries
    const idempotencyKey =
      params.idempotencyKey ||
      `gami_idem_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    return this.http.request<XpLedgerEntry>({
      method: 'POST',
      path: `/api/projects/${params.projectId}/users/${params.userId}/xp/adjust`,
      body: {
        amount: params.amount,
        reason: params.reason,
        metadata: params.metadata || {},
        idempotencyKey,
      },
      idempotencyKey,
    });
  }
}
