import { NextRequest, NextResponse } from 'next/server';
import {
  PAY_SESSION_COOKIE,
  PAY_SESSION_MAX_AGE_SECONDS,
  readJsonBody,
  rejectCrossOrigin,
} from '../../../../src/lib/server/payment-proxy';

/**
 * Tukar token dari redirect login (`?auth_token=`) menjadi cookie HttpOnly,
 * dipakai halaman /wallet/pin dan /withdraw. Token tidak pernah disimpan di
 * storage yang bisa dibaca JavaScript.
 */
export async function POST(request: NextRequest) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;

  const body = (await readJsonBody(request)) as { authToken?: string } | undefined;
  const authToken = body?.authToken?.trim();
  if (!authToken || authToken.length > 8192) {
    return NextResponse.json({ message: 'authToken is required' }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(PAY_SESSION_COOKIE, authToken, {
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: PAY_SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export async function DELETE(request: NextRequest) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;

  const response = NextResponse.json({ ok: true });
  response.cookies.set(PAY_SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}
