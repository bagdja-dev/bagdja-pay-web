import { NextRequest } from 'next/server';
import { proxyToPayment } from '../../../../src/lib/server/payment-proxy';

export async function GET(request: NextRequest) {
  const currency = request.nextUrl.searchParams.get('currency')?.trim();
  const query = currency ? `?currency=${encodeURIComponent(currency)}` : '';
  return proxyToPayment(request, `/payout-methods${query}`);
}
