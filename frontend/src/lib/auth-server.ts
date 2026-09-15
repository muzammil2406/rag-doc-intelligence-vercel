import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

export const AUTH_COOKIE = 'auth_token';
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export function backendUrl(): string {
  return (
    process.env.BACKEND_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:3001'
  );
}

function cookieAttrs(extra: { maxAge: number }) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    ...extra,
  };
}

export function setAuthCookie(token: string): void {
  cookies().set(AUTH_COOKIE, token, cookieAttrs({ maxAge: COOKIE_MAX_AGE }));
}

export function clearAuthCookie(): void {
  cookies().set(AUTH_COOKIE, '', cookieAttrs({ maxAge: 0 }));
}

export async function getVerifiedToken(): Promise<string | null> {
  const token = cookies().get(AUTH_COOKIE)?.value;
  if (!token) return null;
  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET!));
    return token;
  } catch {
    return null;
  }
}