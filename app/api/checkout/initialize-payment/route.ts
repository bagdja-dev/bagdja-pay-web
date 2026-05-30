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
  let body: { token?: string; paymentMethod?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request body must be valid JSON' }, { status: 400 });
  }

  const token = body.token?.trim();
  const paymentMethod = body.paymentMethod?.trim();

  if (!token || !paymentMethod) {
    return NextResponse.json(
      { message: 'token and paymentMethod are required' },
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

  try {
    const initResponse = await fetch(
      `${paymentApiUrl}/payments/public/initialize-payment`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, paymentMethod }),
      },
    );

    const initJson = await initResponse.json();
    if (!initResponse.ok) {
      return NextResponse.json(
        { message: initJson.message || 'Failed to initialize payment' },
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
