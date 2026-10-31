import { NextRequest, NextResponse } from 'next/server';

/**
 * Validasi tautan kembali halaman /wallet/pin yang dibuka dari app lain:
 * `url` wajib https (http hanya localhost) dan berorigin sama dengan salah
 * satu OAuth redirect URI app `clientId` di bagdja-auth — mencegah halaman
 * ini dipakai sebagai open redirect. Mengembalikan nama app untuk tombol.
 */
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId')?.trim();
  const target = request.nextUrl.searchParams.get('url')?.trim();
  const authUrl = process.env.AUTH_API_URL?.replace(/\/$/, '');
  if (!clientId || !target || !authUrl) {
    return NextResponse.json({ valid: false }, { status: 200 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ valid: false });
  }
  const isLocalhost = ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(isLocalhost && parsed.protocol === 'http:')) {
    return NextResponse.json({ valid: false });
  }

  try {
    const response = await fetch(`${authUrl}/auth/client/public/${encodeURIComponent(clientId)}`, {
      next: { revalidate: 300 },
    });
    if (!response.ok) return NextResponse.json({ valid: false });
    const app = (await response.json()) as { appName?: string; oauthRedirectUris?: string[] };
    const origins = new Set(
      (app.oauthRedirectUris ?? []).flatMap((uri) => {
        try {
          return [new URL(uri).origin];
        } catch {
          return [];
        }
      }),
    );
    return NextResponse.json({
      valid: origins.has(parsed.origin),
      appName: app.appName || clientId,
    });
  } catch {
    return NextResponse.json({ valid: false });
  }
}
