import { NextRequest } from 'next/server';
import { proxyToPayment } from '../../../../../src/lib/server/payment-proxy';

export async function GET(request: NextRequest) {
  return proxyToPayment(request, '/wallets/pin/status');
}
