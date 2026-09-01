/**
 * The PageFlo mark and wordmark.
 *
 * The mark is a `P` whose descender turns into a routed path with a node on it:
 * a page, and the path a visitor takes out of it. It is the one piece of
 * identity shared by the marketing site, the console sidebar and the sign-in
 * screen, so it lives in one file.
 */
export function PageFloMark({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 20V6.5A2.5 2.5 0 0 1 6.5 4h5a4.5 4.5 0 0 1 0 9h-3"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path d="M8.5 13h4.5a4 4 0 0 1 4 4v3" stroke="var(--color-brand)" strokeWidth="2.1" strokeLinecap="round" />
      <circle cx="19.4" cy="8.6" r="2.1" fill="var(--color-brand)" />
    </svg>
  )
}

/** Mark plus wordmark. `Page` in ink, `Flo` in the PageFlo red. */
export function PageFloWordmark({
  size = 24,
  textClass = 'text-[17px]',
  className = '',
}: {
  size?: number
  textClass?: string
  className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-[9px] ${className}`}>
      <PageFloMark size={size} className="shrink-0 text-ink" />
      <span className={`${textClass} font-bold tracking-[-0.02em] leading-none text-ink`}>
        Page<span className="text-brand">Flo</span>
      </span>
    </span>
  )
}
