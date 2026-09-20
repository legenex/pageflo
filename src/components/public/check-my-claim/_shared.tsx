'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

/* ----------------------------- Assets / Tokens ---------------------------- */

export const LOGO_PRIMARY = '/check-my-claim/logo-primary.png'
export const LOGO_ALT = '/check-my-claim/logo-alt.png'

export const PHONE_PRIMARY_DISPLAY = '(844) 738 1035'
export const PHONE_PRIMARY_TEL = '+18447381035'
export const PHONE_SURVEY_DISPLAY = '(844) 840-6905'
export const PHONE_SURVEY_TEL = '+18448406905'

export const GRAD_BLUE = 'linear-gradient(90deg,#4ba8ee,#0486e9)'
export const GRAD_BLUE_135 = 'linear-gradient(135deg,#4ba8ee,#0486e9)'
export const GRAD_DARK_PAGE = 'linear-gradient(135deg,#0C2D5B,#001634,#1B2737)'
export const GRAD_DOC_PAGE = 'linear-gradient(135deg,#0a1f3d,#0d2847,#0a1f3d)'

/* ---------------------------------- Icons --------------------------------- */

export const IconPhone = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
)

export const IconArrowLeft = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
)

export const IconArrowRight = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
)

export const IconFileText = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#0285E9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
)

export const IconCheckCircle = ({ size = 24, color = '#16a34a' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
)

export const IconXCircle = ({ size = 48, color = '#ffffff' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
)

export const IconUsers = ({ size = 48, color = '#ffffff' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

export const IconClock = ({ size = 20, color = '#0285E9' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)

/* --------------------------- Shared Page Header --------------------------- */
/* Used on Sorry, Submitted, Thanks, PartnerList, sb-37-list                  */

export function PageHeader() {
  return (
    <header className="bg-white shadow-md p-4">
      <div className="max-w-[1024px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <Link href="/" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_PRIMARY} alt="Check My Claim" className="h-10 sm:h-14 w-auto" />
        </Link>
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-[14px] font-medium" style={{ color: '#111E30' }}>
            Prefer to speak to someone right now?
          </span>
          <a
            href={`tel:${PHONE_PRIMARY_TEL}`}
            className="inline-flex items-center gap-2 text-white font-bold text-[14px] px-5 py-2.5 rounded-full transition-all duration-300 hover:scale-105"
            style={{ background: GRAD_BLUE }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 8px 25px rgba(59,130,246,.25)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <IconPhone size={16} />
            <span className="__tc_dni_phone">{PHONE_PRIMARY_DISPLAY}</span>
          </a>
        </div>
      </div>
    </header>
  )
}

/* ------------------------ Shared Document Modal Page ---------------------- */
/* Wraps AdvertisingDisclosure, PrivacyPolicy, TermsOfService                 */

export function DocModalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 overflow-hidden"
      style={{ background: GRAD_DOC_PAGE, paddingTop: 100 }}
    >
      <div
        className="w-full bg-white flex flex-col"
        style={{
          maxWidth: 896,
          borderRadius: 16,
          boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)',
          height: '85vh',
          maxHeight: '85vh',
        }}
      >
        {/* Sticky header */}
        <div
          className="sticky top-0 z-10 bg-white border-b border-[#e5e7eb] flex items-center gap-4"
          style={{ padding: 24, borderRadius: '16px 16px 0 0' }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'rgba(2,133,233,.10)' }}
          >
            <IconFileText size={24} />
          </div>
          <h1 className="text-[1.5rem] md:text-[1.875rem] font-extrabold m-0" style={{ color: '#111E30' }}>
            {title}
          </h1>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '24px 24px 16px' }}>
          {children}
        </div>

        {/* Sticky footer */}
        <div
          className="sticky bottom-0 bg-white border-t border-[#e5e7eb]"
          style={{ padding: '16px 24px', borderRadius: '0 0 16px 16px' }}
        >
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-white font-semibold transition-colors duration-200 hover:opacity-95"
            style={{ background: '#0285E9', padding: '12px 24px', borderRadius: 8 }}
          >
            <IconArrowLeft size={20} />
            Back to Home
          </Link>
          <div className="flex flex-col items-center gap-3 mt-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_PRIMARY} alt="Check My Claim" className="h-10 w-auto" />
            <p className="text-[14px] text-center" style={{ color: '#595E64' }}>
              Your privacy is important to us. We will never share your information without your consent.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* -------------------------- NO WIN, NO FEE Card --------------------------- */

export function NoWinNoFeeCard({ body, body2 }: { body?: ReactNode; body2?: ReactNode }) {
  return (
    <div
      className="mb-8"
      style={{
        background: 'linear-gradient(to bottom right, #f0fdf4, rgba(220,252,231,.50))',
        borderRadius: 16,
        padding: 24,
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <IconCheckCircle size={24} color="#16a34a" />
        <span className="font-extrabold text-[18px]" style={{ color: '#0C2D5B' }}>
          NO WIN, NO FEE Guarantee:
        </span>
      </div>
      <p className="text-[14px] mb-4" style={{ color: '#595E64', lineHeight: 1.625 }}>
        {body ?? (
          <>
            You pay nothing unless your case is won. Our partner attorneys take cases on contingency — there are no
            upfront fees, no hourly bills, and no costs to you if you do not receive a settlement. The fees are paid
            from your final compensation only after a successful outcome.
          </>
        )}
      </p>
      {body2 && (
        <p className="text-[14px] mb-4" style={{ color: '#595E64', lineHeight: 1.625 }}>
          {body2}
        </p>
      )}
      <p className="font-extrabold text-[1.5rem] text-center" style={{ color: '#0285E9' }}>
        YOU HAVE NOTHING TO LOSE!
      </p>
    </div>
  )
}

/* ------------------------------- Ghost Button ----------------------------- */

export function GhostBackButton({ label = 'Back to Home' }: { label?: string }) {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 font-semibold transition-colors duration-300 hover:bg-[#f9fafb]"
      style={{
        border: '1px solid #d1d5db',
        color: '#0C2D5B',
        padding: '12px 24px',
        borderRadius: 9999,
      }}
    >
      <IconArrowLeft size={16} />
      {label}
    </Link>
  )
}

/* -------------------------- Footer Trust Note ----------------------------- */

export function FooterTrustNote() {
  return (
    <p className="text-[14px] text-center mt-6" style={{ color: 'rgba(255,255,255,.60)' }}>
      ✓ 100% Free • ✓ No Obligation • ✓ Your Information is Secure
    </p>
  )
}

/* ----------------------- Dark-Navy Page Wrapper --------------------------- */

export function DarkNavyPage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: GRAD_DARK_PAGE }}>
      {children}
    </div>
  )
}

/* ------------------------- Main White Card -------------------------------- */

export function MainCard({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[1024px] w-full mx-auto px-4 py-12 md:py-16">
      <div
        className="bg-white p-8 md:p-12"
        style={{ borderRadius: 24, boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)' }}
      >
        {children}
      </div>
    </div>
  )
}

/* --------------------- Hero Icon Circle (gradient bg) --------------------- */

export function PageIconCircle({
  variant = 'blue',
  children,
}: {
  variant?: 'blue' | 'grey'
  children: ReactNode
}) {
  const bg =
    variant === 'grey' ? 'linear-gradient(135deg,#9ca3af,#4b5563)' : GRAD_BLUE_135
  return (
    <div className="flex justify-center mb-6">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ background: bg }}
      >
        {children}
      </div>
    </div>
  )
}

/* -------------------- "Don't Wanna Wait?" Phone CTA Box ------------------- */

export function DontWaitCTA() {
  return (
    <div
      className="mb-8 text-center"
      style={{
        background: 'linear-gradient(to bottom right, rgba(75,168,238,.10), rgba(4,134,233,.10))',
        borderRadius: 16,
        padding: 24,
      }}
    >
      <p className="font-bold text-[1.25rem] mb-4" style={{ color: '#0C2D5B' }}>
        Don&apos;t Wanna Wait? Click the button below to call now, and fast track your claim..
      </p>
      <a
        href={`tel:${PHONE_PRIMARY_TEL}`}
        className="inline-flex items-center gap-2 text-white font-bold text-[18px] transition-all duration-300 hover:scale-105"
        style={{ background: GRAD_BLUE, padding: '16px 40px', borderRadius: 9999 }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 25px 50px rgba(59,130,246,.40)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        <IconPhone size={20} />
        <span className="__tc_dni_phone">{PHONE_PRIMARY_DISPLAY}</span>
      </a>
    </div>
  )
}
