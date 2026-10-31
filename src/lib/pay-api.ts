/** Error dari route API pay-web, membawa `code` mesin dari payment-service. */
export class PayApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export async function payFetch<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(path, {
    method: init.method ?? 'GET',
    headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
  });
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }
  if (!response.ok) {
    const rawMessage = payload.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(', ')
      : typeof rawMessage === 'string'
        ? rawMessage
        : response.statusText;
    throw new PayApiError(
      message,
      response.status,
      typeof payload.code === 'string' ? payload.code : undefined,
      payload,
    );
  }
  return payload as T;
}

/** Ganti `{name}` di teks terjemahan. */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/**
 * Pesan error untuk user: pakai terjemahan per `code` bila ada, lalu pesan
 * server, lalu pesan umum.
 */
export function errorMessage(
  error: unknown,
  errors: Record<string, string>,
  fallback: string,
): string {
  if (error instanceof PayApiError) {
    if (error.code && errors[error.code]) {
      return format(errors[error.code], {
        n: Number(error.details.remainingAttempts ?? 0),
      });
    }
    if (error.status === 401 && errors.AUTH_REQUIRED) return errors.AUTH_REQUIRED;
    return error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

export function formatDateTime(value: string | Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export function formatMoney(value: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'IDR' ? 0 : 2,
  }).format(value);
}

export function localeOf(lang: string): string {
  return lang === 'id' ? 'id-ID' : lang === 'en' ? 'en-US' : lang === 'zh' ? 'zh-CN' : lang === 'es' ? 'es-ES' : 'ar-SA';
}

/**
 * Halaman login Bagdja. login.bagdja.com membaca `redirect_url` dan setelah
 * login kembali ke URL itu dengan token di `?token=`.
 */
export function redirectToLogin(): void {
  const loginUrl = process.env.NEXT_PUBLIC_LOGIN_URL?.replace(/\/$/, '') || 'http://localhost:4003';
  window.location.href = `${loginUrl}/login?redirect_url=${encodeURIComponent(window.location.href)}`;
}

/**
 * Ambil token dari URL redirect login (`?token=`, atau `?auth_token=` untuk
 * pemanggil lama), tukar jadi cookie HttpOnly, lalu hapus dari URL & riwayat
 * browser. Mengembalikan true bila ada token.
 */
export async function adoptLoginToken(): Promise<boolean> {
  const url = new URL(window.location.href);
  const authToken = (url.searchParams.get('token') || url.searchParams.get('auth_token'))?.trim();
  if (!authToken) return false;
  url.searchParams.delete('token');
  url.searchParams.delete('auth_token');
  window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  await payFetch('/api/auth/session', { method: 'POST', body: { authToken } });
  return true;
}
