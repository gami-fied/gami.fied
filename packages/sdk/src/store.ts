import { projectPath, type HttpClient } from './http.js';

export interface StoreRewardRecord {
  id: string;
  key: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  currency: string;
  cost: number;
  stock: number | null;
  perUserLimit: number | null;
  kind: 'fulfilled_by_you' | 'code';
  enabled: boolean;
}

export interface WalletRecord {
  currency: string;
  name: string;
  symbol: string | null;
  balance: number;
  expiringSoon: number;
}

export interface RedemptionRecord {
  id: string;
  reward: string;
  cost: number;
  status: 'pending' | 'fulfilled' | 'cancelled';
  code: string | null;
  /** True when this idempotency key was used before, so nothing was bought again. */
  duplicate: boolean;
}

export interface RedeemParams {
  userId: string;
  rewardKey: string;
  projectId?: string;
  /** Makes a retry safe: the same key never buys twice. */
  idempotencyKey?: string;
}

/** Points balances and the reward store, from your server. Needs the `wallets:read` and `rewards:*` scopes. */
export class StoreResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Lists the rewards, enabled or not, with stock and cost.
   * Calls GET /v1/rewards
   */
  public async rewards(params: { projectId?: string } = {}): Promise<StoreRewardRecord[]> {
    const res = await this.http.request<{ data: StoreRewardRecord[] }>({ method: 'GET', path: projectPath(params.projectId, '/rewards') });
    return res.data ?? [];
  }

  /**
   * A user's balance in each currency. Expired points are not counted.
   * Calls GET /v1/users/:userId/wallets
   */
  public async wallets(params: { userId: string; projectId?: string }): Promise<WalletRecord[]> {
    if (!params.userId) throw new Error('userId is required for gami.store.wallets()');
    const res = await this.http.request<{ data: WalletRecord[] }>({
      method: 'GET',
      path: projectPath(params.projectId, `/users/${encodeURIComponent(params.userId)}/wallets`),
    });
    return res.data ?? [];
  }

  /**
   * Buys a reward for a user. The points, the stock, the user's limit and any code change together.
   * Rejects with a 409 and a `code` of `INSUFFICIENT_POINTS`, `OUT_OF_STOCK`, `OUT_OF_CODES` or `LIMIT_REACHED`.
   * Calls POST /v1/users/:userId/rewards/:rewardKey/redeem
   */
  public async redeem(params: RedeemParams): Promise<RedemptionRecord> {
    if (!params.userId) throw new Error('userId is required for gami.store.redeem()');
    if (!params.rewardKey) throw new Error('rewardKey is required for gami.store.redeem()');
    return this.http.request<RedemptionRecord>({
      method: 'POST',
      path: projectPath(params.projectId, `/users/${encodeURIComponent(params.userId)}/rewards/${encodeURIComponent(params.rewardKey)}/redeem`),
      body: { idempotencyKey: params.idempotencyKey },
    });
  }
}
