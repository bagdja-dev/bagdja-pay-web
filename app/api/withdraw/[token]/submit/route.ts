import { NextRequest } from 'next/server';
import { proxyToPayment, readJsonBody } from '../../../../../src/lib/server/payment-proxy';
import { sessionPath } from '../../../../../src/lib/server/withdraw-session';

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const path = sessionPath(params.token, '/submit');
  if (typeof path !== 'string') return path;
  return proxyToPayment(request, path, { method: 'POST', body: (await readJsonBody(request)) ?? {} });
}
