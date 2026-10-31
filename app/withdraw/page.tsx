import type { Metadata } from 'next';
import { WithdrawClient } from './withdraw-client';

export const metadata: Metadata = {
  title: 'Tarik Dana — Bagdja',
};

export default function WithdrawPage() {
  return <WithdrawClient />;
}
