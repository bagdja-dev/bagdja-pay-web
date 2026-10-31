import { NextRequest } from 'next/server';
import { proxyToPayment } from '../../../../src/lib/server/payment-proxy';
import { sessionPath } from '../../../../src/lib/server/withdraw-session';

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  const path = sessionPath(params.token);
  if (typeof path !== 'string') return path;
  return proxyToPayment(request, path);
}
