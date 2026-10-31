import type { Metadata } from 'next';
import { PinClient } from './pin-client';

export const metadata: Metadata = {
  title: 'PIN Dompet — Bagdja',
};

export default function WalletPinPage() {
  return <PinClient />;
}
