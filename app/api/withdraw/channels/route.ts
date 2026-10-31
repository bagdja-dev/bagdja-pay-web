import { NextRequest, NextResponse } from 'next/server';
import { proxyToPayment } from '../../../../src/lib/server/payment-proxy';

/** Channel payout + biaya untuk rekening personal & nominal tertentu. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const payoutAccountId = params.get('payoutAccountId')?.trim();
  if (!payoutAccountId) {
    return NextResponse.json({ message: 'payoutAccountId is required' }, { status: 400 });
  }
  const query = new URLSearchParams({ ownerType: 'personal', payoutAccountId });
  for (const key of ['amount', 'currency', 'appId']) {
    const value = params.get(key)?.trim();
    if (value) query.set(key, value);
  }
  return proxyToPayment(request, `/wallets/withdrawals/channels?${query.toString()}`);
}
