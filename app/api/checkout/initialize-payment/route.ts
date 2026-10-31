import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      message:
        'POST endpoint. Send { token, paymentMethod } as JSON to initialize payment.',
    },
    { status: 200 },
  );
}

export async function POST(request: NextRequest) {
  let body: { token?: string; provider?: string; paymentMethod?: string; selectedWalletId?: string; authToken?: string; pin?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request body must be valid JSON' }, { status: 400 });
  }

  const token = body.token?.trim();
  const provider = body.provider?.trim(); 
  const paymentMethod = body.paymentMethod?.trim();
  const selectedWalletId = body.selectedWalletId?.trim();
  // PIN wallet pembeli (D14/D19) — hanya diteruskan, tidak pernah dicatat.
  const pin = typeof body.pin === 'string' ? body.pin.trim() : undefined;
  const authToken =
    request.cookies.get('bagdja_auth_token')?.value ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    body.authToken?.trim();

  if (!token || !provider || !paymentMethod) {
    return NextResponse.json(
      { message: 'token, provider, and paymentMethod are required' },
      { status: 400 },
    );
  }

  const paymentApiUrl =
    process.env.PAYMENT_API_URL?.replace(/\/$/, '') ||
    process.env.NEXT_PUBLIC_PAYMENT_API_URL?.replace(/\/$/, '');

  if (!paymentApiUrl) {
    return NextResponse.json(
      { message: 'Payment service URL is not configured' },
      { status: 500 },
    );
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  try {
    const initResponse = await fetch(
      `${paymentApiUrl}/payments/public/initialize-payment`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ token, provider, paymentMethod, selectedWalletId, pin }),
      },
    );

    const initJson = await initResponse.json();
    if (!initResponse.ok) {
      // Teruskan `code` & `remainingAttempts` (error PIN) selain pesan.
      return NextResponse.json(
        {
          message: initJson.message || 'Failed to initialize payment',
          ...(initJson.code ? { code: initJson.code } : {}),
          ...(initJson.remainingAttempts !== undefined
            ? { remainingAttempts: initJson.remainingAttempts }
            : {}),
        },
        { status: initResponse.status },
      );
    }

    return NextResponse.json(initJson, { status: 200 });
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
