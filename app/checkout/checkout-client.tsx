'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

declare global {
  interface Window {
    snap?: {
      pay: (
        token: string,
        opts?: {
          onSuccess?: (result: unknown) => void;
          onPending?: (result: unknown) => void;
          onError?: (result: unknown) => void;
          onClose?: () => void;
        },
      ) => void;
    };
  }
}

type PaymentMethodDto = {
  id: string;
  provider: string;
  method: string;
  fixedFee: number;
  percentageFee: number;
  currency: string;
  isActive: boolean;
};

type CheckoutSession = {
  snapToken?: string;
  clientKey: string;
  refNumber: string;
  isProduction: boolean;
  successRedirectUrl?: string;
  failureRedirectUrl?: string;
  amount?: number | null;
  currency?: string | null;
  metadata?: Record<string, unknown> | null;
  selectedPaymentMethod?: string | null;
  adminFeeAmount?: number | null;
  totalAmount?: number | null;
};

function loadSnapScript(clientKey: string, isProduction: boolean): Promise<void> {
  const src = isProduction
    ? 'https://app.midtrans.com/snap/snap.js'
    : 'https://app.sandbox.midtrans.com/snap/snap.js';

  return new Promise((resolve, reject) => {
    document.querySelector('script[data-bagdja-snap="1"]')?.remove();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.setAttribute('data-client-key', clientKey);
    s.setAttribute('data-bagdja-snap', '1');
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Gagal memuat Midtrans Snap'));
    document.body.appendChild(s);
  });
}

const formatCurrency = (value: number, currency = 'IDR') =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);

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

export function CheckoutClient() {
  const searchParams = useSearchParams();
  const t = searchParams.get('t');
  const [message, setMessage] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [isSnapOpen, setIsSnapOpen] = useState(false);
  const [checkoutSession, setCheckoutSession] = useState<CheckoutSession | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodDto[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  const base = process.env.NEXT_PUBLIC_PAYMENT_API_URL?.replace(/\/$/, '');

  const selectedFee = useMemo(() => {
    if (!checkoutSession?.amount || !selectedMethod || !paymentMethods.length) {
      return 0;
    }
    const method = paymentMethods.find((item) => item.method === selectedMethod);
    if (!method) return 0;
    return method.fixedFee + Math.ceil(checkoutSession.amount * (method.percentageFee / 100));
  }, [checkoutSession?.amount, paymentMethods, selectedMethod]);

  const totalPreview = checkoutSession?.amount != null ? checkoutSession.amount + selectedFee : undefined;

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

  const openSnap = useCallback(
    async (
      snapToken: string,
      clientKey: string,
      isProduction: boolean,
      refNumber: string,
      successRedirectUrl?: string,
      failureRedirectUrl?: string,
    ) => {
      try {
        await loadSnapScript(clientKey, isProduction);
        if (!window.snap?.pay) {
          throw new Error('Midtrans Snap tidak tersedia setelah memuat skrip.');
        }

        setMessage('Membuka jendela pembayaran…');
        setIsSnapOpen(true);

        window.snap.pay(snapToken, {
          onSuccess: () => {
            setIsSnapOpen(false);
            setMessage('Pembayaran berhasil. Anda dapat menutup halaman ini.');
            if (successRedirectUrl) {
              window.location.href = appendInvoiceParam(successRedirectUrl, refNumber);
            }
          },
          onPending: () => {
            setIsSnapOpen(false);
            setMessage('Pembayaran tertunda. Selesaikan instruksi di jendela Snap.');
          },
          onError: () => {
            setIsSnapOpen(false);
            setFatal('Pembayaran gagal. Silakan coba lagi dari merchant.');
            if (failureRedirectUrl) {
              window.location.href = appendInvoiceParam(failureRedirectUrl, refNumber);
            }
          },
          onClose: () => {
            setIsSnapOpen(false);
            setMessage((m) =>
              m?.includes('berhasil') || m?.includes('tertunda')
                ? m
                : 'Jendela pembayaran ditutup.',
            );
          },
        });
      } catch (error: unknown) {
        setFatal(error instanceof Error ? error.message : 'Terjadi kesalahan saat membuka Midtrans.');
      }
    },
    [],
  );

  useEffect(() => {
    if (!t?.trim()) {
      setFatal('Tautan tidak valid (parameter t hilang).');
      return;
    }

    if (!base) {
      setFatal('Aplikasi pay belum dikonfigurasi (NEXT_PUBLIC_PAYMENT_API_URL).');
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        setMessage('Memuat data checkout...');
        const sessionRes = await fetch(`${base}/payments/public/checkout-session?token=${encodeURIComponent(t)}`);
        const text = await sessionRes.text();
        if (!sessionRes.ok) {
          let detail = text;
          try {
            const j = JSON.parse(text) as { message?: string | string[] };
            if (Array.isArray(j.message)) detail = j.message.join(', ');
            else if (typeof j.message === 'string') detail = j.message;
          } catch {
            /* raw */
          }
          throw new Error(detail || sessionRes.statusText);
        }

        const session = JSON.parse(text) as CheckoutSession;
        if (cancelled) return;
        setCheckoutSession(session);

        if (session.snapToken) {
          await openSnap(
            session.snapToken,
            session.clientKey,
            session.isProduction,
            session.refNumber,
            session.successRedirectUrl,
            session.failureRedirectUrl,
          );
          return;
        }

        const methodsRes = await fetch(`${base}/payments/payment-methods`);
        const methodsText = await methodsRes.text();
        if (!methodsRes.ok) {
          let detail = methodsText;
          try {
            const j = JSON.parse(methodsText) as { message?: string | string[] };
            if (Array.isArray(j.message)) detail = j.message.join(', ');
            else if (typeof j.message === 'string') detail = j.message;
          } catch {
            /* raw */
          }
          throw new Error(detail || methodsRes.statusText);
        }

        const fetchedMethods = JSON.parse(methodsText) as PaymentMethodDto[];
        if (cancelled) return;
        setPaymentMethods(fetchedMethods);
        setMessage(null);
      } catch (error: unknown) {
        if (!cancelled) {
          setFatal(error instanceof Error ? error.message : 'Terjadi kesalahan.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [base, openSnap, t]);

  const handleInitializePayment = async () => {
    if (!checkoutSession || !selectedMethod) {
      setFatal('Pilih metode pembayaran terlebih dahulu.');
      return;
    }

    setIsProcessing(true);
    setMessage('Menghitung biaya dan menyiapkan pembayaran...');

    try {
      const res = await fetch('/api/checkout/initialize-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: t, paymentMethod: selectedMethod }),
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.message || res.statusText || 'Gagal inisialisasi pembayaran.');
      }

      setMessage('Membuka jendela pembayaran...');

      await openSnap(
        payload.snapToken,
        checkoutSession.clientKey,
        checkoutSession.isProduction,
        checkoutSession.refNumber,
        checkoutSession.successRedirectUrl,
        checkoutSession.failureRedirectUrl,
      );
    } catch (error: unknown) {
      setFatal(error instanceof Error ? error.message : 'Terjadi kesalahan saat menginisialisasi pembayaran.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <main
      style={{
        padding: '2rem',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#14171d',
        backgroundImage:
          'radial-gradient(circle at top left, rgba(229, 160, 68, 0.14), transparent 28%), radial-gradient(circle at bottom right, rgba(92, 126, 154, 0.14), transparent 24%), url("/ilustration.png")',
        backgroundSize: 'cover, cover, cover',
        backgroundPosition: 'top left, bottom right, center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '180px',
          height: '180px',
          overflow: 'hidden',
          zIndex: 9999,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '22px',
            right: '-45px',
            width: '240px',
            backgroundColor: '#e5a044',
            transform: 'rotate(45deg)',
            textAlign: 'center',
            boxShadow: '0 12px 24px rgba(0,0,0,0.18)',
            height: '38px',
          }}
        />
      </div>

      <div style={{ maxWidth: 640, width: '100%' }}>
        <div
          style={{
            backgroundColor: 'rgba(24, 28, 35, 0.96)',
            borderRadius: 24,
            padding: '2rem',
            boxShadow: '0 24px 60px rgba(0,0,0,0.24)',
            border: '1px solid rgba(224, 226, 229, 0.08)',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem', color: '#e0e2e5' }}>Checkout</h1>

          {fatal ? (
            <p style={{ color: '#ff8a80', marginBottom: '1rem', lineHeight: 1.6 }}>{fatal}</p>
          ) : (
            <p style={{ color: '#8896a4', marginTop: '0', marginBottom: '1.5rem', lineHeight: 1.7 }}>
              {message || 'Pilih metode pembayaran untuk melihat rincian biaya.'}
            </p>
          )}

          {!checkoutSession && !fatal && (
            <div style={{ padding: '1rem 0', color: '#8896a4' }}>Memuat detail checkout...</div>
          )}

          {checkoutSession && !checkoutSession.snapToken && (
            <div style={{ display: 'grid', gap: '1.5rem' }}>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e0e2e5' }}>Nomor pesanan</div>
                <div style={{ color: '#ffffff' }}>{checkoutSession.refNumber}</div>
              </div>

              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e0e2e5' }}>Jumlah</div>
                <div style={{ color: '#ffffff' }}>
                  {checkoutSession.amount != null
                    ? formatCurrency(checkoutSession.amount, checkoutSession.currency || 'IDR')
                    : 'Tidak tersedia'}
                </div>
              </div>

              <div style={{ borderRadius: 16, backgroundColor: '#171a1f', padding: '1rem', border: '1px solid rgba(224, 226, 229, 0.08)' }}>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#e0e2e5', marginBottom: '0.75rem' }}>
                  Pilih metode pembayaran
                </div>

                {paymentMethods.length === 0 && (
                  <div style={{ color: '#8896a4' }}>Memuat metode pembayaran…</div>
                )}

                {paymentMethods.length > 0 && (
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {paymentMethods.map((method) => (
                      <label
                        key={method.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.85rem 1rem',
                          borderRadius: 14,
                          backgroundColor: selectedMethod === method.method ? 'rgba(229, 160, 68, 0.12)' : '#20242a',
                          border: selectedMethod === method.method ? '1px solid #e5a044' : '1px solid rgba(224, 226, 229, 0.12)',
                          cursor: 'pointer',
                        }}
                      >
                        <span>
                          <strong style={{ color: '#e0e2e5' }}>{method.method.replaceAll('_', ' ').toUpperCase()}</strong>
                          <div style={{ fontSize: '0.88rem', color: '#8896a4' }}>{method.provider}</div>
                        </span>
                        <input
                          type="radio"
                          name="payment-method"
                          value={method.method}
                          checked={selectedMethod === method.method}
                          onChange={() => setSelectedMethod(method.method)}
                          style={{ accentColor: '#e5a044' }}
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {selectedMethod && checkoutSession.amount != null && (
                <div style={{ borderRadius: 16, backgroundColor: '#171a1f', padding: '1rem', border: '1px solid rgba(224, 226, 229, 0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: '#e0e2e5' }}>
                    <span>Subtotal</span>
                    <strong>{formatCurrency(checkoutSession.amount, checkoutSession.currency || 'IDR')}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: '#e0e2e5' }}>
                    <span>Admin Fee</span>
                    <strong>{formatCurrency(selectedFee, checkoutSession.currency || 'IDR')}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 700, color: '#ffffff' }}>
                    <span>Total</span>
                    <strong>{formatCurrency(totalPreview ?? 0, checkoutSession.currency || 'IDR')}</strong>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleInitializePayment}
                disabled={!selectedMethod || isProcessing || !!fatal}
                style={{
                  marginTop: '1rem',
                  width: '100%',
                  padding: '1rem 1.25rem',
                  borderRadius: 16,
                  border: 'none',
                  cursor: selectedMethod && !isProcessing && !fatal ? 'pointer' : 'not-allowed',
                  backgroundColor: selectedMethod && !isProcessing && !fatal ? '#e5a044' : '#5c7e9a',
                  color: selectedMethod && !isProcessing && !fatal ? '#111' : '#e0e2e5',
                  fontWeight: 700,
                  transition: 'background-color 0.2s ease',
                }}
              >
                {isProcessing ? 'Memproses...' : 'Bayar dengan Midtrans'}
              </button>
            </div>
          )}

          {checkoutSession && checkoutSession.snapToken && (
            <div style={{ padding: '1rem 0', color: '#8896a4' }}>
              Menyiapkan pembayaran langsung ke Midtrans…
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
