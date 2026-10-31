import { NextResponse } from 'next/server';

/** Token session = base64url 32 byte; tolak bentuk lain sebelum diteruskan. */
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;

export function sessionPath(token: string, suffix = ''): string | NextResponse {
  if (!SESSION_TOKEN_PATTERN.test(token)) {
    return NextResponse.json({ message: 'Invalid withdrawal session' }, { status: 400 });
  }
  return `/withdrawal-sessions/${encodeURIComponent(token)}${suffix}`;
}
