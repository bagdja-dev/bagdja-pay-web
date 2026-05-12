import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Bayar — Bagdja',
  description: 'Pembayaran aman melalui Bagdja',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
