'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { getLanguageFromUrl, getTranslations } from '../../../src/lib/translations';

type CheckoutResultResponse = {
  refNumber: string;
  successRedirectUrl: string | null;
  failureRedirectUrl: string | null;
};

const appendInvoiceParam = (url: string, invoice: string) => {
  try {
    const u = new URL(url);
    u.searchParams.set('invoice', invoice);
    return u.toString();
  } catch {
    return url.includes('?')
      ? `${url}&invoice=${encodeURIComponent(invoice)}`
      : `${url}?invoice=${encodeURIComponent(invoice)}`;
  }
};

/**
 * Landing page for redirect-based payment providers (e.g. Duitku) that send
 * the buyer's browser back after they complete/cancel payment on the
 * provider's own site. Unlike /checkout, this URL only carries the
 * provider's own params (merchantOrderId/resultCode/reference) — no checkout
 * JWT — so it resolves the original success/failure redirect via refNumber
 * against `payments/public/checkout-result` instead.
 */
function CheckoutReturnContent() {
  const searchParams = useSearchParams();
  const lang = getLanguageFromUrl(searchParams);
  const t = getTranslations(lang);

  const refNumber = searchParams.get('merchantOrderId')?.trim();
  const resultCode = searchParams.get('resultCode')?.trim();

  const [message, setMessage] = useState<string>(t.checkout.processing);
  const [fatal, setFatal] = useState<string | null>(null);

  const base = process.env.NEXT_PUBLIC_PAYMENT_API_URL?.replace(/\/$/, '');

  useEffect(() => {
    if (!refNumber) {
      setFatal(t.checkout.invalidLink);
      return;
    }
    if (!base) {
      setFatal(t.checkout.appNotConfigured);
      return;
    }

    const isSuccess = resultCode === '00';

    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(
          `${base}/payments/public/checkout-result?refNumber=${encodeURIComponent(refNumber)}`,
        );
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as CheckoutResultResponse;
        if (cancelled) return;

        const target = isSuccess ? data.successRedirectUrl : data.failureRedirectUrl;
        setMessage(isSuccess ? t.checkout.paymentSuccess : t.checkout.paymentFailed);

        if (target) {
          window.location.href = appendInvoiceParam(target, refNumber);
        }
      } catch {
        if (!cancelled) setFatal(t.checkout.generalError);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [base, refNumber, resultCode, t]);

  return (
    <main
      style={{
        padding: '2rem',
        maxWidth: 480,
        margin: '0 auto',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        color: fatal ? '#ff8a80' : '#e0e2e5',
      }}
    >
      <p>{fatal || message}</p>
    </main>
  );
}

export function CheckoutReturnClient() {
  return (
    <Suspense fallback={<main style={{ padding: '2rem' }}>Memuat…</main>}>
      <CheckoutReturnContent />
    </Suspense>
  );
}
