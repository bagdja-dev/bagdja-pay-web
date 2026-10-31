'use client';

import { CSSProperties, ReactNode, useEffect, useState } from 'react';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { errorMessage, format, payFetch } from '../../lib/pay-api';

/** Palet yang sama dengan halaman checkout. */
export const colors = {
  page: '#14171d',
  card: 'rgba(24, 28, 35, 0.96)',
  panel: '#171a1f',
  field: '#20242a',
  border: 'rgba(224, 226, 229, 0.12)',
  text: '#e0e2e5',
  muted: '#8896a4',
  accent: '#e5a044',
  disabled: '#5c7e9a',
  danger: '#ff8a80',
  success: '#4caf50',
};

export function PayShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main
      style={{
        padding: '0.75rem',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.page,
        backgroundImage:
          'radial-gradient(circle at top left, rgba(229, 160, 68, 0.14), transparent 28%), radial-gradient(circle at bottom right, rgba(92, 126, 154, 0.14), transparent 24%), url("/ilustration.png")',
        backgroundSize: 'cover, cover, cover',
        backgroundPosition: 'top left, bottom right, center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div style={{ maxWidth: 440, width: '100%' }}>
        <div
          style={{
            backgroundColor: colors.card,
            borderRadius: 24,
            padding: '1.25rem',
            boxShadow: '0 20px 48px rgba(0,0,0,0.24)',
            border: '1px solid rgba(224, 226, 229, 0.08)',
            display: 'grid',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: colors.text, margin: 0, letterSpacing: '-0.02em' }}>
              {title}
            </h1>
            <LanguageSwitcher />
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        borderRadius: 16,
        backgroundColor: colors.panel,
        padding: '1rem',
        border: '1px solid rgba(224, 226, 229, 0.08)',
        display: 'grid',
        gap: '0.75rem',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <p style={{ color: colors.muted, margin: 0, lineHeight: 1.6, fontSize: '0.875rem' }}>{children}</p>;
}

export function Notice({ tone, children }: { tone: 'error' | 'info' | 'success'; children: ReactNode }) {
  const color = tone === 'error' ? colors.danger : tone === 'success' ? colors.success : colors.accent;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      style={{
        backgroundColor: `${color}1a`,
        border: `1px solid ${color}`,
        borderRadius: 12,
        padding: '0.6rem 0.85rem',
        color,
        fontSize: '0.825rem',
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = 'primary',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'link';
  type?: 'button' | 'submit';
}) {
  if (variant === 'link') {
    return (
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        style={{
          background: 'none',
          border: 'none',
          color: colors.accent,
          cursor: disabled ? 'not-allowed' : 'pointer',
          padding: 0,
          fontSize: '0.85rem',
          fontWeight: 600,
          justifySelf: 'start',
        }}
      >
        {children}
      </button>
    );
  }
  const primary = variant === 'primary';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '0.85rem 1rem',
        borderRadius: 14,
        border: primary ? 'none' : '1px solid rgba(224, 226, 229, 0.2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        backgroundColor: primary ? (disabled ? colors.disabled : colors.accent) : 'transparent',
        color: primary ? '#111' : colors.text,
        fontWeight: 700,
        fontSize: '0.9rem',
        boxShadow: primary && !disabled ? '0 6px 20px rgba(229, 160, 68, 0.3)' : 'none',
      }}
    >
      {children}
    </button>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.75rem 0.85rem',
  borderRadius: 12,
  border: `1px solid ${colors.border}`,
  backgroundColor: colors.field,
  color: colors.text,
  fontSize: '0.95rem',
  outline: 'none',
};

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: '0.35rem' }}>
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </span>
      {children}
      {hint && <span style={{ fontSize: '0.75rem', color: colors.muted }}>{hint}</span>}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputStyle, ...props.style }} />;
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{ ...inputStyle, ...props.style }} />;
}

/** 6 digit, disamarkan; hanya angka yang diterima. */
export function PinInput({
  value,
  onChange,
  autoFocus,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  ariaLabel: string;
}) {
  return (
    <TextInput
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={6}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
      style={{ letterSpacing: '0.6em', textAlign: 'center', fontSize: '1.3rem', fontWeight: 700 }}
    />
  );
}

export type OtpPurpose = 'set_pin' | 'reset_pin' | 'add_payout_account';

export interface OtpTexts {
  sendCode: string;
  sending: string;
  sentTo: string;
  code: string;
  resend: string;
  resendIn: string;
}

type OtpRequested = { otpId: string; maskedEmail: string; resendAvailableAt: string };

/**
 * Kirim OTP email lalu minta kode 6 digit. OTP dikonsumsi oleh pemanggil
 * (bersama aksi yang disetujui), jadi panel ini hanya mengembalikan
 * `{ otpId, otpCode }` lewat `onChange`.
 */
export function OtpPanel({
  purpose,
  payload,
  texts,
  errors,
  genericError,
  onChange,
}: {
  purpose: OtpPurpose;
  payload?: Record<string, unknown>;
  texts: OtpTexts;
  errors: Record<string, string>;
  genericError: string;
  onChange: (value: { otpId: string; otpCode: string } | null) => void;
}) {
  const [requested, setRequested] = useState<OtpRequested | null>(null);
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!requested) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [requested]);

  useEffect(() => {
    onChange(requested && code.length === 6 ? { otpId: requested.otpId, otpCode: code } : null);
  }, [requested, code, onChange]);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const result = await payFetch<OtpRequested>('/api/wallet/otp', {
        method: 'POST',
        body: { purpose, ...(payload ? { payload } : {}) },
      });
      setRequested(result);
      setCode('');
      setNow(Date.now());
    } catch (err) {
      setError(errorMessage(err, errors, genericError));
    } finally {
      setSending(false);
    }
  };

  const waitSeconds = requested
    ? Math.max(0, Math.ceil((new Date(requested.resendAvailableAt).getTime() - now) / 1000))
    : 0;

  return (
    <div style={{ display: 'grid', gap: '0.65rem' }}>
      {error && <Notice tone="error">{error}</Notice>}
      {!requested ? (
        <Button variant="secondary" onClick={send} disabled={sending}>
          {sending ? texts.sending : texts.sendCode}
        </Button>
      ) : (
        <>
          <Muted>{format(texts.sentTo, { email: requested.maskedEmail })}</Muted>
          <Field label={texts.code}>
            <TextInput
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              style={{ letterSpacing: '0.4em', textAlign: 'center', fontWeight: 700 }}
            />
          </Field>
          <Button variant="link" onClick={send} disabled={sending || waitSeconds > 0}>
            {waitSeconds > 0 ? format(texts.resendIn, { s: waitSeconds }) : texts.resend}
          </Button>
        </>
      )}
    </div>
  );
}
