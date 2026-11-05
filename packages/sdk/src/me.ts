import type { HttpClient } from './http.js';

export interface MeResponse {
  externalId: string;
  name: string | null;
  totalXp: number;
  level: { number: number; name: string } | null;
  xpToNextLevel: number | null;
  progressPercent: number | null;
}

/** The signed-in end user's own data. Use with an `endUserToken`, which is safe in a browser. */
export class MeResource {
  constructor(private readonly http: HttpClient) {}

  public get(): Promise<MeResponse> {
    return this.http.request<MeResponse>({ method: 'GET', path: '/v1/me' });
  }

  public achievements() {
    return this.http.request<{
      data: { key: string; name: string; description: string | null; awardedAt: string }[];
    }>({ method: 'GET', path: '/v1/me/achievements' });
  }

  public challenges() {
    return this.http.request<{
      data: { key: string; name: string; target: number; progress: number; completed: boolean }[];
    }>({ method: 'GET', path: '/v1/me/challenges' });
  }

  public notifications() {
    return this.http.request<{
      data: { id: string; type: string; title: string; message: string; createdAt: string }[];
    }>({ method: 'GET', path: '/v1/me/notifications' });
  }

  public rank() {
    return this.http.request<{ rank: number | null; totalUsers: number }>({
      method: 'GET',
      path: '/v1/me/rank',
    });
  }
}
