import { NextRequest } from 'next/server';
import { proxyToPayment, readJsonBody } from '../../../../src/lib/server/payment-proxy';

/** Buat PIN (OTP set_pin) atau reset PIN (OTP reset_pin). */
export async function PUT(request: NextRequest) {
  return proxyToPayment(request, '/wallets/pin', { method: 'PUT', body: await readJsonBody(request) });
}
