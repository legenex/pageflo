import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import '../../globals.css'
import { getCurrentUser } from '@/lib/auth'
import { VersionFooter } from '@/components/app/VersionFooter'
import { APP_DESCRIPTION, APP_TITLE } from '@/lib/pageflo/product'
import { FONT_PRECONNECT, PAGEFLO_FONTS_HREF } from '@/lib/pageflo/fonts'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: APP_TITLE,
  description: APP_DESCRIPTION,
  robots: { index: false, follow: false },
}

// Root admin layout: html shell + auth gate only. Child layouts own the sidebar:
//   (top)/layout.tsx       — the console sidebar for workspace-wide views
//   sites/[slug]/layout.tsx — SiteSidebar for per-Site context
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in?redirect=/admin/overview')
  return (
    <html lang="en">
      <head>
        {FONT_PRECONNECT.map((href) => (
          <link key={href} rel="preconnect" href={href} crossOrigin="anonymous" />
        ))}
        <link rel="stylesheet" href={PAGEFLO_FONTS_HREF} />
      </head>
      <body>
        <div className="flex min-h-screen">{children}</div>
        <VersionFooter />
      </body>
    </html>
  )
}
