import { projectPath, type HttpClient } from './http.js';

export interface CreateEndUserTokenParams {
  /** Your own ID for the user, or their Gami.Fied ID. */
  userId: string;
  /** How long the token lasts, from 60 to 3600 seconds. Defaults to 900. */
  expiresInSeconds?: number;
  /**
   * What the token may do for its user. `read`, the default, only reads their data. `write` also
   * lets them buy rewards, add friends, give kudos, use an invite code and register a device.
   */
  access?: 'read' | 'write';
}

export interface EndUserTokenResponse {
  token: string;
  expiresAt: string;
  access: 'read' | 'write';
}

/** Tokens for your frontend. Call this on your server, then pass the token to the browser. */
export class EndUserTokensResource {
  constructor(private readonly http: HttpClient) {}

  public create(params: CreateEndUserTokenParams): Promise<EndUserTokenResponse> {
    return this.http.request<EndUserTokenResponse>({
      method: 'POST',
      path: '/v1/end-user-tokens',
      body: params,
    });
  }

  /**
   * Ends every token made for this user so far. Call it when they sign out of your app, so a token
   * left in a browser stops working before it expires.
   */
  public revoke(userId: string): Promise<{ revoked: boolean }> {
    return this.http.request<{ revoked: boolean }>({
      method: 'POST',
      path: projectPath(undefined, `/users/${encodeURIComponent(userId)}/tokens/revoke`),
    });
  }
}
