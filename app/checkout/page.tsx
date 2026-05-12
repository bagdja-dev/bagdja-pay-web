import { Suspense } from 'react';
import { CheckoutClient } from './checkout-client';

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: '2rem', maxWidth: 560, margin: '0 auto' }}>
          <p style={{ color: '#9aa0a6' }}>Memuat…</p>
        </main>
      }
    >
      <CheckoutClient />
    </Suspense>
  );
}
