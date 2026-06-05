import type { PublicShuanQStatus } from './types';

export type ShuanQAuthAction = 'login' | 'register' | 'card';

export function shouldBypassShuanQAuth(status: Pick<PublicShuanQStatus, 'authenticated' | 'verifyMode'>): boolean {
  return status.authenticated || Number(status.verifyMode) === 0;
}

export function shuanQAuthEndpoint(kind: ShuanQAuthAction): string {
  switch (kind) {
    case 'login':
      return '/api/auth/shuanq/login';
    case 'register':
      return '/api/auth/shuanq/register';
    case 'card':
      return '/api/auth/shuanq/use-card';
  }
}

export function shouldRefreshAfterShuanQAction(kind: ShuanQAuthAction): boolean {
  return kind === 'card';
}
