import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token')?.trim();

  if (!token) {
    return NextResponse.json({ message: 'token is required' }, { status: 400 });
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

  // Retrieve user access token from httpOnly cookie
  const accessToken = request.cookies.get('bagdja_auth_token')?.value;

  if (!accessToken) {
    return NextResponse.json(
      { message: 'Authentication required. Please log in to your Bagdja account.' },
      { status: 401 },
    );
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
  };

  try {
    const response = await fetch(
      `${paymentApiUrl}/payments/public/checkout-wallets?token=${encodeURIComponent(token)}`,
      {
        method: 'GET',
        headers,
      },
    );

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { message: data.message || 'Failed to fetch available wallets' },
        { status: response.status },
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
