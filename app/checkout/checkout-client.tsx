'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { getLanguageFromUrl, getTranslations } from '../../src/lib/translations';
import { LanguageSwitcher } from '../../src/components/LanguageSwitcher';

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

type InitializePaymentResponse = {
  success: boolean;
  snapToken?: string;
  redirectUrl?: string;
  adminFee: number;
  totalAmount: number;
  billingFee: number;
  netAmount: number;
  providerData?: Record<string, unknown>;
};

function loadSnapScript(clientKey: string, isProduction: boolean, errorMsg: string): Promise<void> {
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
    s.onerror = () => reject(new Error(errorMsg));
    document.body.appendChild(s);
  });
}

const formatCurrency = (value: number, currency = 'IDR', locale = 'id-ID') =>
  new Intl.NumberFormat(locale, {
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

function CheckoutClientContent() {
  const searchParams = useSearchParams();
  const lang = getLanguageFromUrl(searchParams);
  const t = getTranslations(lang);
  const token = searchParams.get('t');
  
  const [message, setMessage] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [isSnapOpen, setIsSnapOpen] = useState(false);
  const [checkoutSession, setCheckoutSession] = useState<CheckoutSession | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodDto[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodDto | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // States for Internal Wallet Snap UI
  const [showInternalSnap, setShowInternalSnap] = useState(false);
  const [internalWallets, setInternalWallets] = useState<any[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<any>(null);
  const [internalError, setInternalError] = useState<string | null>(null);
  const [internalLoading, setInternalLoading] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [internalSuccess, setInternalSuccess] = useState(false);

  const base = process.env.NEXT_PUBLIC_PAYMENT_API_URL?.replace(/\/$/, '');

  const selectedFee = useMemo(() => {
    if (!checkoutSession?.amount || !selectedMethod || !paymentMethods.length) {
      return 0;
    }
    const method = paymentMethods.find((item) => item.id === selectedMethod?.id);
    if (!method) return 0;
    return method.fixedFee + Math.ceil(checkoutSession.amount * (method.percentageFee / 100));
  }, [checkoutSession?.amount, paymentMethods, selectedMethod]);

  const totalPreview = checkoutSession?.amount != null ? checkoutSession.amount + selectedFee : undefined;

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
        await loadSnapScript(clientKey, isProduction, t.checkout.loadSnapError);
        if (!window.snap?.pay) {
          throw new Error(t.checkout.snapNotAvailable);
        }

        setMessage(t.checkout.openingPaymentWindow);
        setIsSnapOpen(true);

        window.snap.pay(snapToken, {
          onSuccess: () => {
            setIsSnapOpen(false);
            setMessage(t.checkout.paymentSuccess);
            if (successRedirectUrl) {
              window.location.href = appendInvoiceParam(successRedirectUrl, refNumber);
            }
          },
          onPending: () => {
            setIsSnapOpen(false);
            setMessage(t.checkout.paymentPending);
          },
          onError: () => {
            setIsSnapOpen(false);
            setFatal(t.checkout.paymentFailed);
            if (failureRedirectUrl) {
              window.location.href = appendInvoiceParam(failureRedirectUrl, refNumber);
            }
          },
          onClose: () => {
            setIsSnapOpen(false);
            setMessage((m) =>
              m === t.checkout.paymentSuccess || m === t.checkout.paymentPending
                ? m
                : t.checkout.paymentWindowClosed,
            );
          },
        });
      } catch (error: unknown) {
        setFatal(error instanceof Error ? error.message : t.checkout.errorOpeningSnap);
      }
    },
    [t],
  );

  useEffect(() => {
    if (!token?.trim()) {
      setFatal(t.checkout.invalidLink);
      return;
    }

    if (!base) {
      setFatal(t.checkout.appNotConfigured);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        setMessage(t.checkout.loadingCheckout);
        const sessionRes = await fetch(`${base}/payments/public/checkout-session?token=${encodeURIComponent(token)}`);
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
          setFatal(error instanceof Error ? error.message : t.checkout.generalError);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [base, openSnap, token, t]);

  const handleInitializePayment = async () => {
    if (!checkoutSession || !selectedMethod) {
      setFatal(t.checkout.selectPaymentMethodFirst);
      return;
    }

    setIsProcessing(true);
    setMessage(t.checkout.calculatingFee);

    try {
      const res = await fetch('/api/checkout/initialize-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: token, provider: selectedMethod.provider, paymentMethod: selectedMethod.method }),
      });

      const payload: InitializePaymentResponse = await res.json();
      if (!res.ok) {
        throw new Error(payload.snapToken || res.statusText || t.checkout.failedInitializePayment);
      }

      if (payload.snapToken) {
        // Case for Midtrans Snap: open payment window
        setMessage(t.checkout.openingPaymentWindow);
        await openSnap(
          payload.snapToken,
          checkoutSession.clientKey,
          checkoutSession.isProduction,
          checkoutSession.refNumber,
          checkoutSession.successRedirectUrl,
          checkoutSession.failureRedirectUrl,
        );
      } else {
        // Case for Internal Wallet: payment is already complete, redirect to success
        setMessage(t.checkout.paymentSuccess);
        if (checkoutSession.successRedirectUrl) {
          window.location.href = appendInvoiceParam(checkoutSession.successRedirectUrl, checkoutSession.refNumber);
        }
      }
    } catch (error: unknown) {
      setFatal(error instanceof Error ? error.message : t.checkout.errorInitializePayment);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePayClick = async () => {
    if (!checkoutSession || !selectedMethod) {
      setFatal(t.checkout.selectPaymentMethodFirst);
      return;
    }

    if (selectedMethod.provider === 'internal-wallet') {
      setInternalLoading(true);
      setInternalError(null);
      setAuthRequired(false);
      setShowInternalSnap(true);

      try {
        const walletsRes = await fetch(`/api/checkout/wallets?token=${encodeURIComponent(token || '')}`);
        if (walletsRes.status === 401) {
          setAuthRequired(true);
          setInternalLoading(false);
          return;
        }

        const data = await walletsRes.json();
        if (!walletsRes.ok) {
          throw new Error(data.message || 'Failed to retrieve available wallets.');
        }

        setInternalWallets(data);
        const sufficientWallet = data.find((w: any) => w.balance >= (totalPreview ?? 0));
        if (sufficientWallet) {
          setSelectedWallet(sufficientWallet);
        }
      } catch (err: unknown) {
        setInternalError(err instanceof Error ? err.message : t.checkout.errorFetchingWallets);
      } finally {
        setInternalLoading(false);
      }
      return;
    }

    await handleInitializePayment();
  };

  const handleConfirmInternalPayment = async () => {
    if (!selectedWallet) return;

    setInternalLoading(true);
    setInternalError(null);

    try {
      const res = await fetch('/api/checkout/initialize-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: token,
          provider: selectedMethod?.provider,
          paymentMethod: selectedMethod?.method,
          selectedWalletId: selectedWallet.id,
        }),
      });

      const payload: InitializePaymentResponse = await res.json();
      if (!res.ok) {
        throw new Error(payload.snapToken || res.statusText || t.checkout.failedInitializePayment);
      }

      setInternalLoading(false);
      setInternalSuccess(true);
      setMessage(t.checkout.paymentSuccess);
      
      setTimeout(() => {
        if (checkoutSession?.successRedirectUrl) {
          window.location.href = appendInvoiceParam(checkoutSession.successRedirectUrl, checkoutSession.refNumber);
        }
      }, 2500);
    } catch (err: unknown) {
      setInternalError(err instanceof Error ? err.message : t.checkout.failedCompletePayment);
      setInternalLoading(false);
    }
  };

  const locale = lang === 'id' ? 'id-ID' : lang === 'en' ? 'en-US' : lang === 'zh' ? 'zh-CN' : lang === 'es' ? 'es-ES' : 'ar-SA';

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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e0e2e5', margin: 0 }}>{t.checkout.title}</h1>
            <LanguageSwitcher />
          </div>

          {fatal ? (
            <p style={{ color: '#ff8a80', marginBottom: '1rem', lineHeight: 1.6 }}>{fatal}</p>
          ) : (
            <p style={{ color: '#8896a4', marginTop: '0', marginBottom: '1.5rem', lineHeight: 1.7 }}>
              {message || t.checkout.selectPaymentMethodToSeeFee}
            </p>
          )}

          {!checkoutSession && !fatal && (
            <div style={{ padding: '1rem 0', color: '#8896a4' }}>{t.checkout.loadingCheckoutDetail}</div>
          )}

          {checkoutSession && !checkoutSession.snapToken && (
            <div style={{ display: 'grid', gap: '1.5rem' }}>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e0e2e5' }}>{t.checkout.orderNumber}</div>
                <div style={{ color: '#ffffff' }}>{checkoutSession.refNumber}</div>
              </div>

              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e0e2e5' }}>{t.checkout.amount}</div>
                <div style={{ color: '#ffffff' }}>
                  {checkoutSession.amount != null
                    ? formatCurrency(checkoutSession.amount, checkoutSession.currency || 'IDR', locale)
                    : t.checkout.notAvailable}
                </div>
              </div>

              <div style={{ borderRadius: 16, backgroundColor: '#171a1f', padding: '1rem', border: '1px solid rgba(224, 226, 229, 0.08)' }}>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#e0e2e5', marginBottom: '0.75rem' }}>
                  {t.checkout.selectPaymentMethod}
                </div>

                {paymentMethods.length === 0 && (
                  <div style={{ color: '#8896a4' }}>{t.checkout.loadingPaymentMethods}</div>
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
                          backgroundColor: selectedMethod?.id === method.id ? 'rgba(229, 160, 68, 0.12)' : '#20242a',
                          border: selectedMethod?.id === method.id ? '1px solid #e5a044' : '1px solid rgba(224, 226, 229, 0.12)',
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
                          checked={selectedMethod === method}
                          onChange={() => setSelectedMethod(method)}
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
                    <span>{t.checkout.subtotal}</span>
                    <strong>{formatCurrency(checkoutSession.amount, checkoutSession.currency || 'IDR', locale)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: '#e0e2e5' }}>
                    <span>{t.checkout.adminFee}</span>
                    <strong>{formatCurrency(selectedFee, checkoutSession.currency || 'IDR', locale)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 700, color: '#ffffff' }}>
                    <span>{t.checkout.total}</span>
                    <strong>{formatCurrency(totalPreview ?? 0, checkoutSession.currency || 'IDR', locale)}</strong>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handlePayClick}
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
                {isProcessing ? t.checkout.processing : `${t.checkout.payWith} ${selectedMethod?.provider.replaceAll('_', ' ').toUpperCase()}`}
              </button>
            </div>
          )}

          {checkoutSession && checkoutSession.snapToken && (
            <div style={{ padding: '1rem 0', color: '#8896a4' }}>
              {t.checkout.preparingPayment}
            </div>
          )}
        </div>
      </div>

      {/* Internal Wallet Snap Modal Overlay */}
      {showInternalSnap && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(10, 12, 16, 0.85)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              backgroundColor: '#181c23',
              borderRadius: '24px',
              padding: '2rem',
              width: '100%',
              maxWidth: '480px',
              border: '1px solid rgba(229, 160, 68, 0.2)',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: internalSuccess ? '#4caf50' : '#e5a044' }} />
                <h3 style={{ margin: 0, color: '#e0e2e5', fontSize: '1.25rem', fontWeight: 700 }}>{t.checkout.internalWalletTitle}</h3>
              </div>
              {!internalSuccess && (
                <button
                  type="button"
                  onClick={() => setShowInternalSnap(false)}
                  disabled={internalLoading}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#8896a4',
                    cursor: 'pointer',
                    fontSize: '1.25rem',
                    padding: '4px',
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Error Message */}
            {internalError && (
              <div
                style={{
                  backgroundColor: 'rgba(255, 138, 128, 0.1)',
                  border: '1px solid #ff8a80',
                  borderRadius: '12px',
                  padding: '0.75rem 1rem',
                  color: '#ff8a80',
                  fontSize: '0.9rem',
                }}
              >
                {internalError}
              </div>
            )}

            {/* Success State */}
            {internalSuccess ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', padding: '2rem 0' }}>
                <div
                  style={{
                    width: '72px',
                    height: '72px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(76, 175, 80, 0.15)',
                    border: '3px solid #4caf50',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    animation: 'successPulse 0.6s ease-out',
                  }}
                >
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h4 style={{ margin: 0, color: '#4caf50', fontSize: '1.15rem', fontWeight: 700 }}>
                  {t.checkout.internalPaymentSuccess}
                </h4>
                <p style={{ margin: 0, color: '#8896a4', fontSize: '0.9rem', textAlign: 'center', lineHeight: 1.6 }}>
                  {t.checkout.internalPaymentSuccessDetail}
                </p>
                {selectedWallet && checkoutSession?.amount != null && (
                  <div style={{
                    width: '100%',
                    borderRadius: '12px',
                    backgroundColor: '#20242a',
                    padding: '1rem',
                    border: '1px solid rgba(224, 226, 229, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e0e2e5', fontSize: '0.9rem' }}>
                      <span>{t.checkout.total}</span>
                      <strong>{formatCurrency(totalPreview ?? 0, checkoutSession.currency || 'IDR', locale)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#8896a4', fontSize: '0.85rem' }}>
                      <span>{selectedWallet.ownerName}</span>
                      <span>{checkoutSession.refNumber}</span>
                    </div>
                  </div>
                )}
                <style>{`
                  @keyframes successPulse {
                    0% { transform: scale(0.5); opacity: 0; }
                    60% { transform: scale(1.1); opacity: 1; }
                    100% { transform: scale(1); }
                  }
                `}</style>
              </div>
            ) : authRequired ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', textAlign: 'center', padding: '1rem 0' }}>
                <p style={{ color: '#8896a4', margin: 0, lineHeight: 1.6 }}>
                  {t.checkout.authRequiredMessage}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const loginUrl = process.env.NEXT_PUBLIC_LOGIN_URL?.replace(/\/$/, '') || 'http://localhost:4003';
                    window.location.href = `${loginUrl}/login?redirect=${encodeURIComponent(window.location.href)}`;
                  }}
                  style={{
                    backgroundColor: '#e5a044',
                    color: '#111',
                    fontWeight: 700,
                    border: 'none',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    width: '100%',
                    marginTop: '0.5rem',
                  }}
                >
                  {t.checkout.loginWithBagdja}
                </button>
              </div>
            ) : internalLoading && internalWallets.length === 0 ? (
              <div style={{ color: '#8896a4', textAlign: 'center', padding: '2rem 0' }}>
                {t.checkout.loadingWallets}
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ fontSize: '0.9rem', color: '#8896a4', fontWeight: 600 }}>
                    {t.checkout.selectWalletToPay} {totalPreview != null ? formatCurrency(totalPreview, checkoutSession?.currency || 'IDR', locale) : ''}
                  </div>
                  {internalWallets.length === 0 ? (
                    <div style={{ color: '#ff8a80', padding: '1rem 0', fontSize: '0.9rem' }}>
                      {t.checkout.noWalletsFound} {checkoutSession?.currency || 'IDR'}.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                      {internalWallets.map((w) => {
                        const insufficient = w.balance < (totalPreview ?? 0);
                        return (
                          <label
                            key={w.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '1rem',
                              borderRadius: '12px',
                              backgroundColor: selectedWallet?.id === w.id ? 'rgba(229, 160, 68, 0.12)' : '#20242a',
                              border: selectedWallet?.id === w.id ? '1px solid #e5a044' : '1px solid rgba(224, 226, 229, 0.12)',
                              cursor: insufficient ? 'not-allowed' : 'pointer',
                              opacity: insufficient ? 0.6 : 1,
                            }}
                          >
                            <span style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <strong style={{ color: '#e0e2e5', fontSize: '0.95rem' }}>{w.ownerName}</strong>
                              <span style={{ color: insufficient ? '#ff8a80' : '#8896a4', fontSize: '0.85rem' }}>
                                {insufficient ? t.checkout.insufficientBalance : t.checkout.walletBalance}{' '}
                                {formatCurrency(w.balance, w.currency, locale)}
                              </span>
                            </span>
                            <input
                              type="radio"
                              name="internal-wallet-select"
                              disabled={insufficient}
                              checked={selectedWallet?.id === w.id}
                              onChange={() => setSelectedWallet(w)}
                              style={{ accentColor: '#e5a044' }}
                            />
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowInternalSnap(false)}
                    disabled={internalLoading}
                    style={{
                      flex: 1,
                      backgroundColor: 'transparent',
                      color: '#e0e2e5',
                      border: '1px solid rgba(224, 226, 229, 0.2)',
                      padding: '0.85rem',
                      borderRadius: '14px',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    {t.checkout.cancel}
                  </button>
                  <button
                    type="button"
                    disabled={!selectedWallet || internalLoading || internalWallets.length === 0}
                    onClick={handleConfirmInternalPayment}
                    style={{
                      flex: 2,
                      backgroundColor: selectedWallet && !internalLoading ? '#e5a044' : '#5c7e9a',
                      color: '#111',
                      border: 'none',
                      padding: '0.85rem',
                      borderRadius: '14px',
                      cursor: selectedWallet && !internalLoading ? 'pointer' : 'not-allowed',
                      fontWeight: 700,
                    }}
                  >
                    {internalLoading ? t.checkout.internalProcessing : t.checkout.confirmPayment}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

export function CheckoutClient() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            display: 'flex',
            minHeight: '100vh',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            backgroundColor: '#14171d',
            color: '#8896a4',
          }}
        >
          Loading...
        </div>
      }
    >
      <CheckoutClientContent />
    </Suspense>
  );
}
