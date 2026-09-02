'use client'

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

/**
 * Local time and UTC offset for the signed-in operator.
 *
 * Timestamps across the console (lead created, delivery attempt, publish) are
 * rendered in the browser's timezone, so an operator reading a delivery log
 * needs to know which timezone that is. One clock, showing the real one.
 *
 * Renders nothing until mounted: the server has no timezone to render and a
 * mismatched first paint would be a hydration error, not a cosmetic flicker.
 */
export function WorkspaceClock() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!now) {
    return <div className="h-8 min-w-0 flex-1" aria-hidden="true" />
  }

  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).format(now)
  const offsetHours = -now.getTimezoneOffset() / 60
  const sign = offsetHours >= 0 ? '+' : '-'
  const abs = Math.abs(offsetHours)
  const label = `GMT${sign}${Number.isInteger(abs) ? abs : abs.toFixed(1)}`

  return (
    <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-app border border-sidebar-border px-2.5">
      <Clock className="h-[13px] w-[13px] shrink-0 text-ink-dim" aria-hidden="true" />
      <span className="font-mono text-[11px] tabular-nums text-ink">{time}</span>
      <span className="truncate font-mono text-[10px] text-ink-dim">{label}</span>
    </div>
  )
}
