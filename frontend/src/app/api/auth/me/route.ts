import { NextResponse } from 'next/server';
import { backendUrl, getVerifiedToken } from '@/lib/auth-server';

export async function GET() {
  const token = await getVerifiedToken();
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const res = await fetch(`${backendUrl()}/auth/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const user = await res.json();
  return NextResponse.json({ user });
}