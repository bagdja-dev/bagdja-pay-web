import { NextRequest } from 'next/server';
import { proxyToPayment, readJsonBody } from '../../../../../src/lib/server/payment-proxy';

export async function PUT(request: NextRequest) {
  return proxyToPayment(request, '/wallets/pin/change', {
    method: 'PUT',
    body: await readJsonBody(request),
  });
}
