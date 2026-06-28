export const metadata = {
  title: 'Browser OTel - Next.js (SSR)',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          margin: 0,
          padding: '2rem',
          background: '#0b1020',
          color: '#e6e9f5',
          lineHeight: 1.5,
        }}
      >
        {children}
      </body>
    </html>
  )
}
