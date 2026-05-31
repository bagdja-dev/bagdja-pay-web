'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { getLanguageFromUrl, getTranslations } from '../src/lib/translations';
import { LanguageSwitcher } from '../src/components/LanguageSwitcher';

function HomeContent() {
  const searchParams = useSearchParams();
  const lang = getLanguageFromUrl(searchParams);
  const t = getTranslations(lang);

  return (
    <main
      style={{
        padding: '2rem',
        maxWidth: 560,
        margin: '0 auto',
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
          backgroundColor: 'rgba(24, 28, 35, 0.96)',
          borderRadius: 24,
          padding: '2rem',
          boxShadow: '0 24px 60px rgba(0,0,0,0.24)',
          border: '1px solid rgba(224, 226, 229, 0.08)',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e0e2e5', margin: 0 }}>
            {t.home.title}
          </h1>
          <LanguageSwitcher />
        </div>
        <p style={{ color: '#8896a4', marginTop: '0.75rem', lineHeight: 1.5 }}>
          {t.home.description}
        </p>
      </div>
    </main>
  );
}

export default function Home() {
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
      <HomeContent />
    </Suspense>
  );
}
