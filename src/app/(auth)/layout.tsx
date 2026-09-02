import type { ReactNode } from 'react'
import '../globals.css'
import { APP_TITLE, PRODUCT_NAME } from '@/lib/pageflo/product'
import { FONT_PRECONNECT, PAGEFLO_FONTS_HREF } from '@/lib/pageflo/fonts'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: `Sign in · ${APP_TITLE}`,
  description: `Sign in to the ${PRODUCT_NAME} operator console.`,
  // The sign-in screen is a credential surface. It is deliberately not indexed,
  // and it carries no canonical or Open Graph metadata, because a search result
  // pointing at a login form is a phishing target, not a product page.
  robots: { index: false, follow: false },
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {FONT_PRECONNECT.map((href) => (
          <link key={href} rel="preconnect" href={href} crossOrigin="anonymous" />
        ))}
        <link rel="stylesheet" href={PAGEFLO_FONTS_HREF} />
      </head>
      <body>{children}</body>
    </html>
  )
}
