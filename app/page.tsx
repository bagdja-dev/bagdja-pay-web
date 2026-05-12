export default function Home() {
  return (
    <main style={{ padding: '2rem', maxWidth: 560, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Bagdja Pay</h1>
      <p style={{ color: '#9aa0a6', marginTop: '0.75rem', lineHeight: 1.5 }}>
        Gunakan tautan checkout dari merchant Anda. Halaman ini tidak menerima
        pembayaran tanpa token yang valid.
      </p>
    </main>
  );
}
