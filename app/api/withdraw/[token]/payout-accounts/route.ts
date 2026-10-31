import { NextRequest } from 'next/server';
import { proxyToPayment, readJsonBody } from '../../../../../src/lib/server/payment-proxy';
import { sessionPath } from '../../../../../src/lib/server/withdraw-session';

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  const path = sessionPath(params.token, '/payout-accounts');
  if (typeof path !== 'string') return path;
  return proxyToPayment(request, path);
}

/** Tambah rekening personal (OTP add_payout_account wajib). */
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const path = sessionPath(params.token, '/payout-accounts');
  if (typeof path !== 'string') return path;
  return proxyToPayment(request, path, { method: 'POST', body: await readJsonBody(request) });
}
