import type { HttpClient } from './http.js';

export interface CreateEndUserTokenParams {
  /** Your own ID for the user, or their Gami.Fied ID. */
  userId: string;
  /** How long the token lasts, from 60 to 3600 seconds. Defaults to 900. */
  expiresInSeconds?: number;
}

export interface EndUserTokenResponse {
  token: string;
  expiresAt: string;
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
}
