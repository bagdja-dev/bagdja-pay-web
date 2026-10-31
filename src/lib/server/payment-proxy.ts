import { NextRequest, NextResponse } from 'next/server';

/**
 * Cookie sesi pay-web untuk halaman PIN & withdraw: HttpOnly, sehingga token
 * user tidak bisa dibaca JavaScript di halaman (berbeda dengan cookie lama
 * `bagdja_auth_token` milik checkout yang diset lewat document.cookie).
 */
export const PAY_SESSION_COOKIE = 'bagdja_pay_session';
const LEGACY_AUTH_COOKIE = 'bagdja_auth_token';
export const PAY_SESSION_MAX_AGE_SECONDS = 60 * 60;

/**
 * Tolak request pengubah data dari origin lain (login CSRF / submit lintas
 * situs). Browser selalu mengirim `Origin` untuk fetch POST/PUT.
 */
export function rejectCrossOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (!origin || !host) {
    return NextResponse.json({ message: 'Origin header is required' }, { status: 403 });
  }
  try {
    if (new URL(origin).host === host) return null;
  } catch {
    /* origin tidak valid */
  }
  return NextResponse.json({ message: 'Cross-origin request rejected' }, { status: 403 });
}

export function getPaymentApiUrl(): string | null {
  const url = process.env.PAYMENT_API_URL || process.env.NEXT_PUBLIC_PAYMENT_API_URL;
  return url ? url.replace(/\/$/, '') : null;
}

/** Token user: cookie HttpOnly baru dulu, lalu cookie lama checkout. */
export function getUserToken(request: NextRequest): string | null {
  return (
    request.cookies.get(PAY_SESSION_COOKIE)?.value ||
    request.cookies.get(LEGACY_AUTH_COOKIE)?.value ||
    null
  );
}

/**
 * Teruskan request ke payment-service dengan token user dan kembalikan
 * status + body JSON apa adanya — termasuk `code` & `remainingAttempts`
 * pada error PIN/OTP yang dipakai UI untuk menentukan langkah berikutnya.
 */
export async function proxyToPayment(
  request: NextRequest,
  path: string,
  init: { method?: string; body?: unknown; requireUser?: boolean } = {},
): Promise<NextResponse> {
  const base = getPaymentApiUrl();
  if (!base) {
    return NextResponse.json({ message: 'Payment service URL is not configured' }, { status: 500 });
  }

  const method = init.method ?? 'GET';
  if (method !== 'GET') {
    const rejected = rejectCrossOrigin(request);
    if (rejected) return rejected;
  }

  const token = getUserToken(request);
  if (init.requireUser !== false && !token) {
    return NextResponse.json(
      { code: 'AUTH_REQUIRED', message: 'Please log in to your Bagdja account.' },
      { status: 401 },
    );
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
    });
    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { message: text || response.statusText };
    }
    if (response.status === 401) {
      return NextResponse.json(
        { code: 'AUTH_REQUIRED', message: 'Your session has expired. Please log in again.' },
        { status: 401 },
      );
    }
    return NextResponse.json(payload, { status: response.status });
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Payment service is unreachable' },
      { status: 502 },
    );
  }
}

export async function readJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
