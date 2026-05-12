'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

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

export function CheckoutClient() {
  const searchParams = useSearchParams();
  const t = searchParams.get('t');
  const [message, setMessage] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [isSnapOpen, setIsSnapOpen] = useState(false);

  useEffect(() => {
    if (!t?.trim()) {
      setFatal('Tautan tidak valid (parameter t hilang).');
      return;
    }

    const base = process.env.NEXT_PUBLIC_PAYMENT_API_URL?.replace(/\/$/, '');
    if (!base) {
      setFatal('Aplikasi pay belum dikonfigurasi (NEXT_PUBLIC_PAYMENT_API_URL).');
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const url = `${base}/payments/public/checkout-session?token=${encodeURIComponent(t)}`;
        const res = await fetch(url);
        const text = await res.text();
        if (!res.ok) {
          let detail = text;
          try {
            const j = JSON.parse(text) as { message?: string | string[] };
            if (Array.isArray(j.message)) detail = j.message.join(', ');
            else if (typeof j.message === 'string') detail = j.message;
          } catch {
            /* use raw */
          }
          throw new Error(detail || res.statusText);
        }
        const body = JSON.parse(text) as {
          snapToken: string;
          clientKey: string;
          refNumber: string;
          isProduction: boolean;
          successRedirectUrl?: string;
          failureRedirectUrl?: string;
        };

        if (cancelled) return;

        await loadSnapScript(body.clientKey, body.isProduction);
        if (cancelled) return;

        if (!window.snap?.pay) {
          throw new Error('Midtrans Snap tidak tersedia setelah memuat skrip.');
        }

        setMessage('Membuka jendela pembayaran…');
        setIsSnapOpen(true);

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

        window.snap.pay(body.snapToken, {
          onSuccess: () => {
            setIsSnapOpen(false);
            setMessage('Pembayaran berhasil. Anda dapat menutup halaman ini.');
            if (body.successRedirectUrl) {
              window.location.href = appendInvoiceParam(
                body.successRedirectUrl,
                body.refNumber,
              );
            }
          },
          onPending: () => {
            setIsSnapOpen(false);
            setMessage('Pembayaran tertunda. Selesaikan instruksi di jendela Snap.');
          },
          onError: () => {
            setIsSnapOpen(false);
            setFatal('Pembayaran gagal. Silakan coba lagi dari merchant.');
            if (body.failureRedirectUrl) {
              window.location.href = appendInvoiceParam(
                body.failureRedirectUrl,
                body.refNumber,
              );
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
      } catch (e: unknown) {
        if (!cancelled) {
          setFatal(e instanceof Error ? e.message : 'Terjadi kesalahan.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [t]);

  return (
    <main
      style={{
        padding: '2rem',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundImage: 'url("/ilustration.png")',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Ribbon for identification (without text) */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '150px',
          height: '150px',
          overflow: 'hidden',
          zIndex: 9999,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '30px',
            right: '-35px',
            width: '200px',
            backgroundColor: '#f1c40f',
            transform: 'rotate(45deg)',
            textAlign: 'center',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            height: '30px',
          }}
        />
      </div>

      <div style={{ maxWidth: 560, width: '100%', textAlign: 'center' }}>
        {!isSnapOpen && (
          <>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Checkout</h1>
            {fatal ? (
              <p style={{ color: '#f28b82', marginTop: '1rem', lineHeight: 1.5 }}>{fatal}</p>
            ) : (
              <p style={{ color: '#9aa0a6', marginTop: '1rem', lineHeight: 1.5 }}>
                {message || 'Menyiapkan pembayaran…'}
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
