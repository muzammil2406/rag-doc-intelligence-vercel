import { NextResponse } from 'next/server';
import { clearAuthCookie } from '@/lib/auth-server';

export async function POST() {
  clearAuthCookie();
  return NextResponse.json({ ok: true });
}