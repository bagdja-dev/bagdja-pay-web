'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { getLanguageFromUrl, getTranslations } from '../../../src/lib/translations';
import {
  adoptLoginToken,
  errorMessage,
  format,
  formatDateTime,
  localeOf,
  payFetch,
  PayApiError,
  redirectToLogin,
} from '../../../src/lib/pay-api';
import {
  Button,
  colors,
  Field,
  Muted,
  Notice,
  OtpPanel,
  PayShell,
  PinInput,
} from '../../../src/components/pay/ui';

type PinStatus = { hasPin: boolean; lockedUntil: string | null; spendBlockedUntil: string | null };
type Tab = 'change' | 'forgot';
type ReturnTarget = { url: string; label: string };

/** Hanya path internal pay-web (mis. kembali ke /withdraw atau /checkout). */
function internalReturn(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  return value;
}

function PinClientContent() {
  const searchParams = useSearchParams();
  const lang = getLanguageFromUrl(searchParams);
  const t = getTranslations(lang).wallet;
  const locale = localeOf(lang);

  const [status, setStatus] = useState<PinStatus | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(searchParams.get('mode') === 'forgot' ? 'forgot' : 'change');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [otp, setOtp] = useState<{ otpId: string; otpCode: string } | null>(null);
  const [otpKey, setOtpKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [returnTarget, setReturnTarget] = useState<ReturnTarget | null>(null);
  const [returnInvalid, setReturnInvalid] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await adoptLoginToken();
        const result = await payFetch<PinStatus>('/api/wallet/pin/status');
        if (cancelled) return;
        setStatus(result);
        if (result.lockedUntil) setTab('forgot');
      } catch (err) {
        if (cancelled) return;
        if (err instanceof PayApiError && err.status === 401) setAuthRequired(true);
        else setFatal(errorMessage(err, t.errors, t.common.genericError));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    const internal = internalReturn(searchParams.get('returnTo'));
    if (internal) {
      setReturnTarget({ url: internal, label: t.common.back });
      return;
    }
    const clientId = searchParams.get('client_id');
    const returnUrl = searchParams.get('returnUrl');
    if (!clientId || !returnUrl) return;
    void payFetch<{ valid: boolean; appName?: string }>(
      `/api/apps/return-url?clientId=${encodeURIComponent(clientId)}&url=${encodeURIComponent(returnUrl)}`,
    )
      .then((result) => {
        if (result.valid) {
          setReturnTarget({ url: returnUrl, label: format(t.common.backToApp, { app: result.appName || clientId }) });
        } else {
          setReturnInvalid(true);
        }
      })
      .catch(() => setReturnInvalid(true));
  }, [searchParams, t]);

  const resetForm = () => {
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setOtp(null);
    setOtpKey((key) => key + 1);
    setError(null);
  };

  const mode: 'create' | Tab = status && !status.hasPin ? 'create' : tab;
  const needsOtp = mode !== 'change';
  const pinsReady = newPin.length === 6 && confirmPin.length === 6;
  const canSave =
    !saving && pinsReady && (mode === 'change' ? currentPin.length === 6 : otp !== null);

  const save = async () => {
    if (newPin !== confirmPin) {
      setError(t.pin.pinMismatch);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result =
        mode === 'change'
          ? await payFetch<PinStatus>('/api/wallet/pin/change', {
              method: 'PUT',
              body: { currentPin, newPin },
            })
          : await payFetch<PinStatus>('/api/wallet/pin', {
              method: 'PUT',
              body: { otpId: otp?.otpId, otpCode: otp?.otpCode, pin: newPin },
            });
      setStatus(result);
      setDone(mode === 'create' ? t.pin.created : mode === 'change' ? t.pin.changed : t.pin.reset);
      resetForm();
    } catch (err) {
      if (err instanceof PayApiError && err.status === 401) {
        setAuthRequired(true);
      } else {
        setError(errorMessage(err, t.errors, t.common.genericError));
        // Kode OTP yang salah/terpakai harus diminta ulang.
        if (err instanceof PayApiError && err.code?.startsWith('WALLET_OTP_')) {
          setOtp(null);
          setOtpKey((key) => key + 1);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const title = mode === 'create' ? t.pin.createTitle : t.pin.title;

  return (
    <PayShell title={title}>
      {returnInvalid && <Notice tone="info">{t.pin.invalidReturn}</Notice>}
      {fatal && <Notice tone="error">{fatal}</Notice>}

      {authRequired ? (
        <>
          <Muted>{t.common.loginRequired}</Muted>
          <Button onClick={redirectToLogin}>{t.common.loginWithBagdja}</Button>
        </>
      ) : !status ? (
        !fatal && <Muted>{t.common.loading}</Muted>
      ) : done ? (
        <>
          <Notice tone="success">{done}</Notice>
          {status.spendBlockedUntil && (
            <Muted>{format(t.pin.spendBlockedUntil, { time: formatDateTime(status.spendBlockedUntil, locale) })}</Muted>
          )}
          {returnTarget ? (
            <Button onClick={() => window.location.assign(returnTarget.url)}>{returnTarget.label}</Button>
          ) : (
            <Button variant="secondary" onClick={() => setDone(null)}>
              {t.common.done}
            </Button>
          )}
        </>
      ) : (
        <>
          {mode === 'create' ? (
            <Muted>{t.pin.createDescription}</Muted>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              {(['change', 'forgot'] as Tab[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setTab(item);
                    resetForm();
                  }}
                  style={{
                    padding: '0.6rem',
                    borderRadius: 12,
                    border: tab === item ? `1px solid ${colors.accent}` : `1px solid ${colors.border}`,
                    backgroundColor: tab === item ? 'rgba(229, 160, 68, 0.12)' : colors.field,
                    color: colors.text,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {item === 'change' ? t.pin.tabChange : t.pin.tabForgot}
                </button>
              ))}
            </div>
          )}

          {status.lockedUntil && (
            <Notice tone="error">
              {format(t.pin.lockedUntil, { time: formatDateTime(status.lockedUntil, locale) })}
            </Notice>
          )}
          {mode === 'change' && <Muted>{t.pin.changeDescription}</Muted>}
          {mode === 'forgot' && <Muted>{t.pin.forgotDescription}</Muted>}

          {mode === 'change' && (
            <Field label={t.pin.currentPin}>
              <PinInput value={currentPin} onChange={setCurrentPin} ariaLabel={t.pin.currentPin} />
            </Field>
          )}
          <Field label={t.pin.newPin} hint={t.pin.pinHint}>
            <PinInput value={newPin} onChange={setNewPin} ariaLabel={t.pin.newPin} />
          </Field>
          <Field label={t.pin.confirmPin}>
            <PinInput value={confirmPin} onChange={setConfirmPin} ariaLabel={t.pin.confirmPin} />
          </Field>

          {needsOtp && (
            <OtpPanel
              key={`${mode}-${otpKey}`}
              purpose={mode === 'create' ? 'set_pin' : 'reset_pin'}
              texts={t.otp}
              errors={t.errors}
              genericError={t.common.genericError}
              onChange={setOtp}
            />
          )}

          {error && <Notice tone="error">{error}</Notice>}
          <Button onClick={save} disabled={!canSave}>
            {saving ? t.otp.sending : t.pin.savePin}
          </Button>
          {returnTarget && (
            <Button variant="secondary" onClick={() => window.location.assign(returnTarget.url)}>
              {returnTarget.label}
            </Button>
          )}
        </>
      )}
    </PayShell>
  );
}

export function PinClient() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', backgroundColor: colors.page, color: colors.muted, padding: '2rem' }}>…</div>
      }
    >
      <PinClientContent />
    </Suspense>
  );
}
