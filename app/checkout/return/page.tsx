import { Suspense } from 'react';
import { CheckoutReturnClient } from './return-client';

export default function CheckoutReturnPage() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: '2rem', maxWidth: 560, margin: '0 auto' }}>
          <p style={{ color: '#9aa0a6' }}>Memuat…</p>
        </main>
      }
    >
      <CheckoutReturnClient />
    </Suspense>
  );
}
