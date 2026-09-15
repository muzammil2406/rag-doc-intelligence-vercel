import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const AUTH_COOKIE = 'auth_token';

async function isAuthed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return false;
  try {
    await jwtVerify(
      token,
      new TextEncoder().encode(process.env.JWT_SECRET ?? ''),
    );
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const authed = await isAuthed(req);
  const { pathname } = req.nextUrl;

  if (pathname === '/auth') {
    if (authed) return NextResponse.redirect(new URL('/', req.url));
    return NextResponse.next();
  }

  if (!authed) {
    const login = new URL('/auth', req.url);
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/auth', '/chat/:path*'],
};