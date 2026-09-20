'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  DarkNavyPage,
  DontWaitCTA,
  FooterTrustNote,
  GRAD_BLUE,
  GRAD_BLUE_135,
  IconArrowRight,
  IconClock,
  IconPhone,
  MainCard,
  NoWinNoFeeCard,
  PageHeader,
} from './_shared'

const HERO_IMG = '/check-my-claim/important-call.png'

export default function Submitted() {
  const search = useSearchParams()
  const eventId = search.get('event_id') ?? undefined

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.fbq?.('track', 'Submit form event', {}, eventId ? { eventID: eventId } : undefined)
    } catch {}
    try {
      window.ttq?.track?.('Submit form event', {})
    } catch {}
  }, [eventId])

  return (
    <DarkNavyPage>
      <PageHeader />
      <MainCard>
        {/* Hero image */}
        <div className="mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={HERO_IMG}
            alt="Important Call"
            className="w-full mx-auto block"
            style={{ maxWidth: 448 }}
          />
        </div>

        {/* Heading */}
        <h1 className="text-[1.875rem] md:text-[2.25rem] font-bold text-center mb-2" style={{ color: '#0C2D5B' }}>
          Congrats! We will be <span style={{ color: '#22c55e' }}>CALLING YOU</span>
        </h1>

        <p className="text-[1.125rem] text-center mb-4" style={{ color: '#595E64' }}>
          Based on your answers, it seems you may have a{' '}
          <span style={{ color: '#22c55e', fontWeight: 700 }}>HIGH VALUE CLAIM!</span> One of our trusted advisors will
          call you in the next few minutes to discuss your claim further
        </p>

        {/* Alert banner */}
        <div
          className="text-white font-bold text-center mb-2"
          style={{ background: GRAD_BLUE, padding: '12px 16px', borderRadius: 12 }}
        >
          Please Make Sure To Answer your Phone!
        </div>

        <p className="text-[14px] italic text-center mb-8" style={{ color: '#595E64' }}>
          <strong>PLEASE NOTE:</strong> We cannot proceed with your case without talking to you on the phone and
          confirming your case details…
        </p>

        {/* What To Expect Next */}
        <div
          className="mb-8"
          style={{
            background: 'linear-gradient(to bottom right, rgba(75,168,238,.10), rgba(4,134,233,.10))',
            borderRadius: 16,
            padding: 24,
          }}
        >
          <div className="flex items-center justify-center gap-2 mb-6">
            <IconClock size={22} />
            <p className="font-bold text-[1.25rem]" style={{ color: '#0C2D5B' }}>
              Here&apos;s What To Expect Next:
            </p>
          </div>

          {/* Step 1 (highlighted) */}
          <div
            className="bg-white mb-3 flex items-start gap-4"
            style={{
              borderRadius: 12,
              padding: 20,
              boxShadow: '0 10px 15px -3px rgba(0,0,0,.10)',
              border: '2px solid #0285E9',
            }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
              style={{ background: GRAD_BLUE_135 }}
            >
              <IconPhone size={22} />
            </div>
            <div className="flex-1">
              <p className="font-extrabold text-[1.125rem]" style={{ color: '#0C2D5B' }}>
                📞 Step 1: We Will Call You (Next Few Minutes!)
              </p>
              <p className="mt-1" style={{ color: '#595E64' }}>
                One of our trusted advisors will call your phone to verify your details and connect you with the right
                attorney.
              </p>
              <p className="mt-1 font-bold" style={{ color: '#0285E9' }}>
                Please answer the call!
              </p>
            </div>
          </div>

          {[
            { n: 2, title: 'Attorney Review', body: 'Your matched attorney will review your case details thoroughly.' },
            {
              n: 3,
              title: 'Case Initiation (No Cost To You)',
              body: 'Your attorney starts your case with zero upfront fees - they only get paid when you win.',
            },
            {
              n: 4,
              title: 'Settlement & Compensation',
              body: 'Your attorney presents settlement options and fights for maximum compensation.',
            },
          ].map((s) => (
            <div
              key={s.n}
              className="flex items-start gap-4 bg-white mb-3"
              style={{ borderRadius: 12, padding: 16 }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white font-bold"
                style={{ background: GRAD_BLUE_135 }}
              >
                {s.n}
              </div>
              <div className="flex-1">
                <p className="font-bold" style={{ color: '#0C2D5B' }}>
                  {s.title}
                </p>
                <p className="text-[14px]" style={{ color: '#595E64' }}>
                  {s.body}
                </p>
              </div>
            </div>
          ))}
        </div>

        <DontWaitCTA />
        <NoWinNoFeeCard />

        <div className="flex justify-center">
          <Link
            href="/"
            className="group inline-flex items-center gap-3 text-white font-bold transition-all duration-300 hover:scale-105"
            style={{ background: GRAD_BLUE, padding: '16px 32px', borderRadius: 9999 }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 25px 50px rgba(59,130,246,.30)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            Return to Home
            <span className="transition-transform group-hover:translate-x-1">
              <IconArrowRight size={20} />
            </span>
          </Link>
        </div>
      </MainCard>
      <div className="max-w-[1024px] w-full mx-auto px-4 pb-12">
        <FooterTrustNote />
      </div>
    </DarkNavyPage>
  )
}
