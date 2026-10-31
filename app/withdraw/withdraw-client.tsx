'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { getLanguageFromUrl, getTranslations } from '../../src/lib/translations';
import {
  adoptLoginToken,
  errorMessage,
  format,
  formatDateTime,
  formatMoney,
  localeOf,
  payFetch,
  PayApiError,
  redirectToLogin,
} from '../../src/lib/pay-api';
import {
  Button,
  colors,
  Field,
  Muted,
  Notice,
  OtpPanel,
  Panel,
  PayShell,
  PinInput,
  SelectInput,
  TextInput,
} from '../../src/components/pay/ui';

type SessionStatus = 'OPEN' | 'SUBMITTING' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';

type SessionInfo = {
  status: SessionStatus;
  appId: string;
  appName: string;
  currency: string;
  returnHost: string;
  availableBalance: number;
  hasWallet: boolean;
  expiresAt: string;
  hasPin: boolean;
  pinLockedUntil: string | null;
  spendBlockedUntil: string | null;
};

type PayoutAccount = {
  id: string;
  currency_code: string;
  payout_method: string;
  account_holder_name: string;
  account_identifier: string;
  bank_name?: string | null;
  method_code?: string | null;
};

type PayoutMethod = { code: string; name: string; methodType: string; currency: string };

type Channel = {
  id: string;
  provider: string;
  methodCode: string;
  estimatedTime: string | null;
  feeAmount: number;
  netAmount: number;
  eligible: boolean;
  reason: string | null;
};

type Step = 'account' | 'amount' | 'confirm' | 'pin' | 'done';

const MIN_AMOUNT = 1000;

function maskAccount(account: PayoutAccount): string {
  const provider = account.bank_name || account.method_code || account.payout_method;
  return `${provider} ••••${account.account_identifier.slice(-4)}`;
}

function WithdrawClientContent() {
  const searchParams = useSearchParams();
  const lang = getLanguageFromUrl(searchParams);
  const translations = getTranslations(lang);
  const t = translations.wallet;
  const w = t.withdraw;
  const locale = localeOf(lang);
  const token = searchParams.get('session')?.trim() || '';

  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('account');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [accounts, setAccounts] = useState<PayoutAccount[] | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [methods, setMethods] = useState<PayoutMethod[]>([]);
  const [methodCode, setMethodCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [accountOtp, setAccountOtp] = useState<{ otpId: string; otpCode: string } | null>(null);

  const [amountText, setAmountText] = useState('');
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

  const api = `/api/withdraw/${encodeURIComponent(token)}`;
  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof PayApiError && err.status === 401) setAuthRequired(true);
      else setError(errorMessage(err, t.errors, t.common.genericError));
    },
    [t],
  );

  const loadAccounts = useCallback(async () => {
    const list = await payFetch<PayoutAccount[]>(`${api}/payout-accounts`);
    setAccounts(list);
    return list;
  }, [api]);

  useEffect(() => {
    if (!token) {
      setFatal(translations.checkout.invalidLink);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await adoptLoginToken();
        const session = await payFetch<SessionInfo>(api);
        if (cancelled) return;
        setInfo(session);
        if (session.status === 'OPEN' && session.hasWallet && session.hasPin) {
          const list = await loadAccounts();
          if (!cancelled && list.length > 0) setAccountId(list[0].id);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof PayApiError && err.status === 401) setAuthRequired(true);
        else setFatal(errorMessage(err, t.errors, t.common.genericError));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, loadAccounts, t, token, translations]);

  // Katalog bank/e-wallet hanya saat form tambah rekening dibuka.
  useEffect(() => {
    if (!adding || !info || methods.length > 0) return;
    payFetch<PayoutMethod[]>(`/api/wallet/payout-methods?currency=${encodeURIComponent(info.currency)}`)
      .then(setMethods)
      .catch(handleError);
  }, [adding, handleError, info, methods.length]);

  const amount = Number(amountText.replace(/[^\d]/g, ''));
  const amountValid = !!info && amount >= MIN_AMOUNT && amount <= info.availableBalance;

  // Channel & biaya dihitung ulang setiap rekening/nominal berubah.
  useEffect(() => {
    if (!info || !accountId || !amountValid) {
      setChannels(null);
      setChannelId(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({
        payoutAccountId: accountId,
        amount: String(amount),
        currency: info.currency,
        appId: info.appId,
      });
      payFetch<Channel[]>(`/api/withdraw/channels?${query.toString()}`)
        .then((list) => {
          if (cancelled) return;
          setChannels(list);
          const cheapest = list
            .filter((channel) => channel.eligible)
            .sort((a, b) => a.feeAmount - b.feeAmount)[0];
          setChannelId(cheapest?.id ?? null);
        })
        .catch((err) => !cancelled && handleError(err));
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [accountId, amount, amountValid, handleError, info]);

  const selectedAccount = accounts?.find((account) => account.id === accountId) ?? null;
  const selectedChannel = channels?.find((channel) => channel.id === channelId) ?? null;
  const selectedMethod = methods.find((method) => method.code === methodCode);

  const newAccountPayload = useMemo(
    () =>
      info && selectedMethod && accountNumber.trim() && accountHolder.trim()
        ? {
            currency_code: info.currency,
            payout_method: 'BANK_TRANSFER',
            method_code: selectedMethod.code,
            bank_name: selectedMethod.name,
            account_identifier: accountNumber.replace(/\s+/g, ''),
            account_holder_name: accountHolder.trim(),
          }
        : null,
    [accountHolder, accountNumber, info, selectedMethod],
  );

  const saveAccount = async () => {
    if (!newAccountPayload || !accountOtp) return;
    setBusy(true);
    setError(null);
    try {
      const created = await payFetch<PayoutAccount>(`${api}/payout-accounts`, {
        method: 'POST',
        body: { ...newAccountPayload, ...accountOtp },
      });
      await loadAccounts();
      setAccountId(created.id);
      setAdding(false);
      setAccountNumber('');
      setAccountHolder('');
      setAccountOtp(null);
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!selectedAccount || !selectedChannel) return;
    setBusy(true);
    setError(null);
    try {
      const result = await payFetch<{ redirectUrl: string }>(`${api}/submit`, {
        method: 'POST',
        body: {
          payoutAccountId: selectedAccount.id,
          payoutMethodFeeId: selectedChannel.id,
          amount,
          pin,
        },
      });
      setRedirectUrl(result.redirectUrl);
      setStep('done');
      window.setTimeout(() => window.location.assign(result.redirectUrl), 2500);
    } catch (err) {
      setPin('');
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      const result = await payFetch<{ redirectUrl: string }>(`${api}/cancel`, { method: 'POST' });
      window.location.assign(result.redirectUrl);
    } catch (err) {
      handleError(err);
      setBusy(false);
    }
  };

  const pinPageUrl = (mode?: 'forgot') => {
    const back = `/withdraw?session=${encodeURIComponent(token)}&lang=${lang}`;
    return `/wallet/pin?lang=${lang}${mode ? `&mode=${mode}` : ''}&returnTo=${encodeURIComponent(back)}`;
  };

  const money = (value: number) => formatMoney(value, info?.currency || 'IDR', locale);
  const app = info?.appName || '';

  const statusMessage =
    info && info.status !== 'OPEN'
      ? info.status === 'EXPIRED'
        ? format(w.expired, { app })
        : info.status === 'CANCELLED'
          ? w.cancelled
          : w.completed
      : null;

  return (
    <PayShell title={w.title}>
      {fatal && <Notice tone="error">{fatal}</Notice>}

      {authRequired ? (
        <>
          <Muted>{t.common.loginRequired}</Muted>
          <Button onClick={redirectToLogin}>{t.common.loginWithBagdja}</Button>
        </>
      ) : !info ? (
        !fatal && <Muted>{t.common.loading}</Muted>
      ) : statusMessage ? (
        <Notice tone="info">{statusMessage}</Notice>
      ) : !info.hasWallet ? (
        <Notice tone="info">{format(w.noWallet, { currency: info.currency })}</Notice>
      ) : !info.hasPin ? (
        <>
          <Muted>{w.createPinFirst}</Muted>
          <Button onClick={() => window.location.assign(pinPageUrl())}>{w.createPin}</Button>
        </>
      ) : step === 'done' ? (
        <>
          <Notice tone="success">{w.successTitle}</Notice>
          <Muted>{format(w.successDetail, { app })}</Muted>
          {redirectUrl && (
            <Button onClick={() => window.location.assign(redirectUrl)}>{format(t.common.backToApp, { app })}</Button>
          )}
        </>
      ) : (
        <>
          <Muted>{format(w.subtitle, { app })}</Muted>
          <Panel style={{ gap: '0.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {w.availableBalance}
            </span>
            <span style={{ color: colors.accent, fontSize: '1.35rem', fontWeight: 700 }}>{money(info.availableBalance)}</span>
          </Panel>

          {info.spendBlockedUntil && (
            <Notice tone="info">
              {format(w.spendBlockedUntil, { time: formatDateTime(info.spendBlockedUntil, locale) })}
            </Notice>
          )}

          {step === 'account' && (
            <Panel>
              <strong style={{ color: colors.text, fontSize: '0.9rem' }}>{w.stepAccount}</strong>
              {accounts === null ? (
                <Muted>{t.common.loading}</Muted>
              ) : accounts.length === 0 && !adding ? (
                <Muted>{format(w.noAccounts, { currency: info.currency })}</Muted>
              ) : (
                accounts.map((account) => (
                  <label
                    key={account.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.8rem 0.9rem',
                      borderRadius: 12,
                      backgroundColor: accountId === account.id ? 'rgba(229, 160, 68, 0.12)' : colors.field,
                      border: accountId === account.id ? `1px solid ${colors.accent}` : `1px solid ${colors.border}`,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ display: 'grid', gap: '0.15rem' }}>
                      <strong style={{ color: colors.text, fontSize: '0.875rem' }}>{maskAccount(account)}</strong>
                      <span style={{ color: colors.muted, fontSize: '0.75rem' }}>{account.account_holder_name}</span>
                    </span>
                    <input
                      type="radio"
                      name="payout-account"
                      checked={accountId === account.id}
                      onChange={() => setAccountId(account.id)}
                      style={{ accentColor: colors.accent, width: 18, height: 18 }}
                    />
                  </label>
                ))
              )}

              {adding ? (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  <Field label={w.method}>
                    <SelectInput value={methodCode} onChange={(event) => setMethodCode(event.target.value)}>
                      <option value="">{w.selectMethod}</option>
                      {methods.map((method) => (
                        <option key={method.code} value={method.code}>
                          {method.name}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field label={w.accountNumber}>
                    <TextInput
                      inputMode="numeric"
                      value={accountNumber}
                      maxLength={64}
                      onChange={(event) => setAccountNumber(event.target.value)}
                    />
                  </Field>
                  <Field label={w.accountHolder}>
                    <TextInput value={accountHolder} maxLength={255} onChange={(event) => setAccountHolder(event.target.value)} />
                  </Field>
                  {newAccountPayload && (
                    <>
                      <Muted>{w.accountOtpHint}</Muted>
                      <OtpPanel
                        key={JSON.stringify(newAccountPayload)}
                        purpose="add_payout_account"
                        payload={newAccountPayload}
                        texts={t.otp}
                        errors={t.errors}
                        genericError={t.common.genericError}
                        onChange={setAccountOtp}
                      />
                    </>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
                    <Button variant="secondary" onClick={() => setAdding(false)} disabled={busy}>
                      {t.common.cancel}
                    </Button>
                    <Button onClick={saveAccount} disabled={busy || !newAccountPayload || !accountOtp}>
                      {w.saveAccount}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="link" onClick={() => setAdding(true)}>
                  + {w.addAccount}
                </Button>
              )}
            </Panel>
          )}

          {step === 'amount' && (
            <Panel>
              <Field label={w.amount}>
                <TextInput
                  inputMode="numeric"
                  value={amountText}
                  onChange={(event) => setAmountText(event.target.value.replace(/[^\d]/g, ''))}
                />
              </Field>
              <Button variant="link" onClick={() => setAmountText(String(Math.floor(info.availableBalance)))}>
                {w.withdrawAll}
              </Button>
              {amount > info.availableBalance && <Notice tone="error">{w.insufficient}</Notice>}
              {amountValid && channels === null && <Muted>{w.loadingChannels}</Muted>}
              {amountValid && channels?.length === 0 && <Notice tone="error">{w.noChannel}</Notice>}
              {channels?.map((channel) => (
                <label
                  key={channel.id}
                  style={{
                    display: 'grid',
                    gap: '0.25rem',
                    padding: '0.8rem 0.9rem',
                    borderRadius: 12,
                    backgroundColor: channelId === channel.id ? 'rgba(229, 160, 68, 0.12)' : colors.field,
                    border: channelId === channel.id ? `1px solid ${colors.accent}` : `1px solid ${colors.border}`,
                    opacity: channel.eligible ? 1 : 0.55,
                    cursor: channel.eligible ? 'pointer' : 'not-allowed',
                  }}
                >
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <strong style={{ color: colors.text, fontSize: '0.875rem' }}>
                      {channel.methodCode} · {channel.provider}
                    </strong>
                    <input
                      type="radio"
                      name="payout-channel"
                      disabled={!channel.eligible}
                      checked={channelId === channel.id}
                      onChange={() => setChannelId(channel.id)}
                      style={{ accentColor: colors.accent, width: 18, height: 18 }}
                    />
                  </span>
                  <span style={{ color: colors.muted, fontSize: '0.775rem' }}>
                    {channel.eligible
                      ? `${w.fee} ${money(channel.feeAmount)} · ${w.received} ${money(channel.netAmount)}${channel.estimatedTime ? ` · ${w.eta} ${channel.estimatedTime}` : ''}`
                      : channel.reason}
                  </span>
                </label>
              ))}
            </Panel>
          )}

          {(step === 'confirm' || step === 'pin') && selectedAccount && selectedChannel && (
            <Panel style={{ gap: '0.5rem' }}>
              <strong style={{ color: colors.text, fontSize: '0.9rem' }}>{w.confirmTitle}</strong>
              {[
                [w.to, `${maskAccount(selectedAccount)} · ${selectedAccount.account_holder_name}`],
                [w.amount, money(amount)],
                [w.fee, money(selectedChannel.feeAmount)],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', color: colors.text, fontSize: '0.875rem' }}>
                  <span style={{ color: colors.muted }}>{label}</span>
                  <span style={{ textAlign: 'right' }}>{value}</span>
                </div>
              ))}
              <div
                style={{
                  borderTop: '1px dashed rgba(136, 150, 164, 0.3)',
                  paddingTop: '0.6rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 700,
                  color: '#ffffff',
                }}
              >
                <span>{w.received}</span>
                <span style={{ color: colors.accent }}>{money(selectedChannel.netAmount)}</span>
              </div>
            </Panel>
          )}

          {step === 'pin' && (
            <>
              <Field label={w.enterPin}>
                <PinInput value={pin} onChange={setPin} autoFocus ariaLabel={w.enterPin} />
              </Field>
              <Button variant="link" onClick={() => window.location.assign(pinPageUrl('forgot'))}>
                {w.forgotPin}
              </Button>
            </>
          )}

          {error && <Notice tone="error">{error}</Notice>}

          <div style={{ display: 'grid', gridTemplateColumns: step === 'account' ? '1fr' : '1fr 2fr', gap: '0.75rem' }}>
            {step !== 'account' && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setStep(step === 'amount' ? 'account' : step === 'confirm' ? 'amount' : 'confirm');
                }}
              >
                {t.common.back}
              </Button>
            )}
            {step === 'account' && (
              <Button disabled={!selectedAccount || adding} onClick={() => setStep('amount')}>
                {t.common.continue}
              </Button>
            )}
            {step === 'amount' && (
              <Button disabled={!amountValid || !selectedChannel} onClick={() => setStep('confirm')}>
                {t.common.continue}
              </Button>
            )}
            {step === 'confirm' && (
              <Button disabled={!!info.spendBlockedUntil} onClick={() => setStep('pin')}>
                {t.common.continue}
              </Button>
            )}
            {step === 'pin' && (
              <Button disabled={busy || pin.length !== 6 || !!info.spendBlockedUntil} onClick={submit}>
                {busy ? w.submitting : w.submit}
              </Button>
            )}
          </div>
          <Button variant="link" onClick={cancel} disabled={busy}>
            {w.cancelWithdraw}
          </Button>
        </>
      )}
    </PayShell>
  );
}

export function WithdrawClient() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', backgroundColor: colors.page, color: colors.muted, padding: '2rem' }}>…</div>
      }
    >
      <WithdrawClientContent />
    </Suspense>
  );
}
