import { NextRequest } from 'next/server';
import { proxyToPayment, readJsonBody } from '../../../../src/lib/server/payment-proxy';

export async function POST(request: NextRequest) {
  return proxyToPayment(request, '/wallets/otp', { method: 'POST', body: await readJsonBody(request) });
}
