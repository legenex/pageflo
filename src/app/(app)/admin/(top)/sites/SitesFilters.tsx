'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Search, ChevronDown, X } from 'lucide-react'
import { VERTICALS, type VerticalGroup } from '@/lib/verticals'

const GROUP_ORDER: VerticalGroup[] = ['General', 'Legal']

/**
 * Search and vertical filters for the Sites list.
 *
 * The options come from `src/lib/verticals.ts`, the same list the Sites
 * collection uses, so the filter can never offer a value the collection would
 * reject. They are grouped because the legal practice areas are one family
 * among several now, not the whole menu.
 */
export function SitesFilters({ status, vertical, q }: { status: string; vertical: string; q: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const [query, setQuery] = useState(q)
  const typed = useRef(false)

  useEffect(() => {
    // Only navigate on a real keystroke. Without this the debounce fires once
    // on mount and replaces the URL on every page load, which loses the back
    // entry the operator arrived on.
    if (!typed.current) return
    const handle = setTimeout(() => {
      const next = new URLSearchParams(params.toString())
      if (query) next.set('q', query)
      else next.delete('q')
      const qs = next.toString()
      router.replace(qs ? `/admin/sites?${qs}` : '/admin/sites')
    }, 250)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const onVerticalChange = (value: string) => {
    const next = new URLSearchParams(params.toString())
    if (value) next.set('vertical', value)
    else next.delete('vertical')
    const qs = next.toString()
    router.replace(qs ? `/admin/sites?${qs}` : '/admin/sites')
  }

  return (
    <div className="mt-2.5 flex flex-wrap items-stretch gap-2">
      <div className="relative min-w-[220px] flex-1 sm:max-w-[380px]">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-ink-dim"
          aria-hidden="true"
        />
        <input
          type="search"
          aria-label="Search Sites by name or slug"
          placeholder="Search Sites"
          value={query}
          onChange={(e) => {
            typed.current = true
            setQuery(e.target.value)
          }}
          className="w-full rounded-app border border-border bg-surface-1 py-2 pl-9 pr-8 text-[13px] text-ink placeholder:text-ink-dim"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              typed.current = true
              setQuery('')
            }}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-app-sm text-ink-dim hover:bg-surface-3 hover:text-ink"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="relative">
        <select
          aria-label="Filter Sites by vertical"
          value={vertical}
          onChange={(e) => onVerticalChange(e.target.value)}
          className="appearance-none rounded-app border border-border bg-surface-1 py-2 pl-3 pr-8 text-[13px] text-ink"
        >
          <option value="">All verticals</option>
          {GROUP_ORDER.map((group) => (
            <optgroup key={group} label={group}>
              {VERTICALS.filter((v) => v.group === group).map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-ink-dim"
          aria-hidden="true"
        />
      </div>

      {/* `status` is owned by the tab rail above; carried here so a filter
          change never drops the tab the operator is on. */}
      <input type="hidden" name="status" value={status} />
    </div>
  )
}
