'use client'

/**
 * The twenty ways a quiz template reports progress.
 *
 * Every one of the twenty templates in the handoff uses a different one, which
 * is why this is the axis that most distinguishes them on screen. They are all
 * answering the same two questions - how far in am I, and how much is left -
 * and they differ only in how loudly.
 *
 * Nothing here knows what the questions are. A form is handed a position, a
 * total, and where relevant a list of labels the DEPLOYMENT supplied; it never
 * reads a quiz. That is the handoff's rule about presentation-only templates,
 * enforced by the signature rather than by discipline.
 *
 * Colour is never chosen here either. Every value comes off the theme's
 * surface, which was derived from the brand and verified against the ground it
 * sits on.
 */

import type { CSSProperties } from 'react'
import { Check } from 'lucide-react'
import type { ProgressForm } from '@/lib/quiz-templates/model'
import type { QuizTheme } from '@/lib/quiz-templates/theme'

export type ProgressProps = {
  form: ProgressForm
  theme: QuizTheme
  /** Zero-based position of the current step. */
  index: number
  total: number
  /**
   * The authored label of each visible step, in order. Supplied by the caller
   * from the quiz's own steps, filtered to the ones a visitor can actually see
   * (see `visibleStepView`), so a webhook or decision row is never named at a
   * visitor and `index`/`total` count the same journey these labels describe.
   */
  labels?: string[]
  /**
   * Encouraging line for the forms that carry one - SQ-02's "One step at a
   * time", SQ-08's "why we ask".
   *
   * STILL UNFED, deliberately. Nothing in the quiz model carries per-step
   * guidance copy: a node has a tagline, headline, question and subheadline,
   * all of which are already drawn below this. Reusing one of them here would
   * print the same sentence twice; inventing a sentence would put words on a
   * page nobody wrote. It needs a node field and therefore a migration.
   */
  note?: string
}

const pct = (index: number, total: number): number =>
  total <= 0 ? 0 : Math.round(((index + 1) / total) * 100)

export const QuizProgress = ({ form, theme, index, total, labels = [], note }: ProgressProps) => {
  const { surface: s, fonts } = theme
  const done = index
  const percent = pct(index, total)

  const capsLabel: CSSProperties = {
    fontFamily: fonts.utility, fontSize: 10.5, letterSpacing: '0.12em',
    textTransform: 'uppercase', color: s.muted, fontWeight: 600,
  }
  const bar = (height: number, radius: number) => (
    <div style={{ height, borderRadius: radius, backgroundColor: s.line, overflow: 'hidden', width: '100%' }}>
      <div style={{ height: '100%', width: `${percent}%`, backgroundColor: s.accentFill, borderRadius: radius, transition: 'width .3s ease' }} />
    </div>
  )

  switch (form) {
    // SQ-01 A 3px typographic rule that fills, and a count. The quietest of the
    // twenty. It was a dead 1px hairline that never moved, which is a progress
    // indicator that reports nothing; the source draws a 3px track filling in
    // the brand behind the count.
    case 'rule_count':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%' }}>
          <div style={{ flex: 1, height: 3, backgroundColor: s.line }}>
            <div style={{ height: '100%', width: `${percent}%`, backgroundColor: s.accentFill, transition: 'width .25s ease' }} />
          </div>
          <span style={capsLabel}>{index + 1} / {total}</span>
        </div>
      )

    // SQ-02 A soft bar that says something kind underneath it.
    case 'rounded_encourage':
      return (
        <div style={{ width: '100%' }}>
          {bar(8, 999)}
          {note ? <div style={{ ...capsLabel, textTransform: 'none', letterSpacing: 0, fontFamily: fonts.body, fontSize: 12.5, marginTop: 8 }}>{note}</div> : null}
        </div>
      )

    // SQ-03 Segmented blocks, one per question. Bare, as the source draws them:
    // the console's own header band carries the zero-padded step count, and a
    // second one beside the segments printed it twice on the same card.
    case 'segmented_blocks':
      return (
        <div style={{ display: 'flex', gap: 4, width: '100%' }}>
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 4, backgroundColor: i <= index ? s.accentFill : s.line, transition: 'background-color .2s ease' }} />
          ))}
        </div>
      )

    // SQ-04 A rail of named factors, each stamped once it has been recorded.
    case 'factor_rail':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: '100%' }}>
          {(labels.length ? labels : Array.from({ length: total }, (_, i) => `Factor ${i + 1}`)).map((l, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, opacity: i <= index ? 1 : 0.45 }}>
              <span style={{ width: 14, height: 14, border: `1px solid ${i <= index ? s.accentFill : s.line}`, backgroundColor: i < index ? s.accentFill : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {i < index ? <Check size={9} strokeWidth={3} color={s.onAccentFill} /> : null}
              </span>
              <span style={{ fontFamily: fonts.utility, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: s.text, flex: 1 }}>{l}</span>
              {i < index ? <span style={{ ...capsLabel, fontSize: 9 }}>Recorded</span> : null}
            </div>
          ))}
        </div>
      )

    // SQ-05 A thick bar with the percentage in a chip beside it.
    case 'bar_percent_chip':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
          <div style={{ flex: 1 }}>{bar(8, 4)}</div>
          <span style={{ ...capsLabel, padding: '3px 9px', borderRadius: 4, backgroundColor: s.accentFill, color: s.onAccentFill }}>{percent}%</span>
        </div>
      )

    // SQ-06 The same bar, label plain rather than chipped.
    case 'bar_percent_label':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
          <div style={{ flex: 1 }}>{bar(8, 4)}</div>
          <span style={capsLabel}>{percent}%</span>
        </div>
      )

    // SQ-07 Accident at one end, deadline at the other, you somewhere between.
    // The two ends are the FIRST and LAST milestone, not the first two: reading
    // `labels[1]` named step two as the deadline the moment labels started
    // arriving, which is a rail that says the finish line is the next question.
    case 'deadline_rail':
      return (
        <div style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
            <span style={capsLabel}>{labels[0] ?? 'Accident'}</span>
            <span style={{ ...capsLabel, color: s.accent, textAlign: 'right' }}>{labels[labels.length - 1] ?? 'Filing deadline'}</span>
          </div>
          <div style={{ position: 'relative', height: 2, backgroundColor: s.line }}>
            <div style={{ position: 'absolute', inset: 0, width: `${percent}%`, backgroundColor: s.accentFill }} />
            <div style={{ position: 'absolute', top: -4, left: `calc(${percent}% - 5px)`, width: 10, height: 10, borderRadius: 5, backgroundColor: s.accentFill }} />
          </div>
          <div style={{ ...capsLabel, marginTop: 6, textAlign: 'right' }}>{percent}%</div>
        </div>
      )

    // SQ-08 A caps eyebrow over a hairline bar.
    case 'caps_thin_bar':
      return (
        <div style={{ width: '100%' }}>
          <div style={{ ...capsLabel, marginBottom: 6 }}>{note ?? `Question ${index + 1} of ${total}`}</div>
          {bar(2, 0)}
        </div>
      )

    // SQ-09 Dots. The most compact form in the set.
    case 'dot_sequence':
      return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
          {Array.from({ length: total }).map((_, i) => (
            <span key={i} style={{ width: i === index ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i <= index ? s.accentFill : s.line, transition: 'width .2s ease' }} />
          ))}
        </div>
      )

    // SQ-10 A count of what is already answered, ticked.
    case 'answered_ticks':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', gap: 3 }}>
            {Array.from({ length: Math.min(done, 6) }).map((_, i) => (
              <Check key={i} size={12} strokeWidth={3} color={s.accent} />
            ))}
          </span>
          <span style={capsLabel}>{done} answered {'·'} {Math.max(0, total - done)} left</span>
        </div>
      )

    // SQ-11 A bar, plus the route the answers so far have put you on.
    // The trail is the steps ALREADY TAKEN plus the current one, not the whole
    // list: a breadcrumb that names every step ahead of you is a table of
    // contents, and it would also announce where the flow is going, which the
    // handoff rules out ("progress only - no hidden scoring shown").
    case 'route_breadcrumb': {
      const trail = labels.slice(0, index + 1)
      return (
        <div style={{ width: '100%' }}>
          {bar(4, 2)}
          {trail.length ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              {trail.map((l, i) => (
                <span
                  key={i}
                  style={{
                    ...capsLabel, fontSize: 9.5, padding: '2px 7px', borderRadius: 3,
                    // The live step is the dashed chip; everything behind it is
                    // settled. Two signals, so it does not rest on colour alone.
                    border: i === trail.length - 1 ? `1px dashed ${s.accentFill}` : `1px solid ${s.line}`,
                    color: i === trail.length - 1 ? s.text : s.accent,
                  }}
                >{l}</span>
              ))}
            </div>
          ) : null}
        </div>
      )
    }

    // SQ-12 A mono counter above a hairline. Restrained on purpose.
    case 'mono_hairline':
      return (
        <div style={{ width: '100%' }}>
          <div style={{ fontFamily: fonts.utility, fontSize: 11, color: s.muted, marginBottom: 6, letterSpacing: '0.06em' }}>
            {String(index + 1).padStart(2, '0')} — {String(total).padStart(2, '0')}
          </div>
          <div style={{ height: 1, backgroundColor: s.line }} />
        </div>
      )

    // SQ-13 A count in the header, because the chat itself shows the history.
    case 'header_count':
      return <span style={capsLabel}>Question {index + 1} of {total}</span>

    // SQ-14 Ticks, one per segment, no bar.
    case 'segment_ticks':
      return (
        <div style={{ display: 'flex', gap: 4, width: '100%' }}>
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= index ? s.accentFill : s.line }} />
          ))}
        </div>
      )

    // SQ-15 A vertical rail of milestones with the live one marked.
    case 'milestone_rail':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {(labels.length ? labels : Array.from({ length: total }, (_, i) => `Step ${i + 1}`)).map((l, i, arr) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', alignSelf: 'stretch' }}>
                <span style={{ width: 12, height: 12, borderRadius: 6, flexShrink: 0, marginTop: 3, backgroundColor: i <= index ? s.accentFill : 'transparent', border: `2px solid ${i <= index ? s.accentFill : s.line}` }} />
                {i < arr.length - 1 ? <span style={{ width: 2, flex: 1, minHeight: 26, backgroundColor: i < index ? s.accentFill : s.line }} /> : null}
              </div>
              <span style={{ fontFamily: fonts.body, fontSize: 13, color: i === index ? s.text : s.muted, fontWeight: i === index ? 600 : 400, paddingBottom: 14 }}>{l}</span>
            </div>
          ))}
        </div>
      )

    // SQ-16 Tabs, with the current section's status beside them.
    case 'tab_status':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', flexWrap: 'wrap' }}>
          {/* The tab row scrolls rather than pushing into the status chip
              beside it, which is what it did at narrow widths. It was set to
              `overflow: hidden`, which does not scroll - it CLIPS, so on a
              quiz with more sections than fit, the current tab could be the
              one cut off. */}
          <div style={{ display: 'flex', gap: 2, flex: 1, minWidth: 0, overflowX: 'auto', overflowY: 'hidden' }}>
            {(labels.length ? labels : ['Incident', 'Medical', 'Legal', 'Contact']).map((l, i) => (
              <span key={i} style={{ padding: '6px 12px', fontFamily: fonts.utility, fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', color: i === index ? s.text : s.muted, borderBottom: `2px solid ${i === index ? s.accentFill : 'transparent'}`, backgroundColor: i === index ? s.card : 'transparent' }}>{l}</span>
            ))}
          </div>
          <span style={{ ...capsLabel, padding: '3px 8px', border: `1px solid ${s.line}`, borderRadius: 999, flexShrink: 0, whiteSpace: 'nowrap' }}>{percent}% complete</span>
        </div>
      )

    // SQ-17 A bare line at the very edge of the screen, and a count.
    case 'edge_bar':
      return (
        <div style={{ width: '100%' }}>
          <div style={{ height: 3, backgroundColor: s.line }}>
            <div style={{ height: '100%', width: `${percent}%`, backgroundColor: s.accentFill, transition: 'width .3s ease' }} />
          </div>
          <div style={{ ...capsLabel, marginTop: 10, textAlign: 'center' }}>{index + 1} of {total}</div>
        </div>
      )

    // SQ-18 Card N of N, with a diamond per card.
    case 'card_diamonds':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
          <span style={capsLabel}>Card {index + 1} of {total}</span>
          <span style={{ display: 'inline-flex', gap: 5 }}>
            {Array.from({ length: total }).map((_, i) => (
              <span key={i} style={{ width: 7, height: 7, transform: 'rotate(45deg)', backgroundColor: i <= index ? s.accentFill : s.line }} />
            ))}
          </span>
        </div>
      )

    // SQ-19 Named nodes behind you, anonymous dots ahead. Orientation only:
    // it never exposes which branch the answers are heading down.
    case 'path_nodes':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', width: '100%' }}>
          {Array.from({ length: total }).map((_, i) => {
            const past = i < index
            const now = i === index
            return (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {past || now ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, border: `1px solid ${now ? s.accentFill : s.line}`, color: now ? s.text : s.muted, fontFamily: fonts.utility, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {past ? <Check size={9} strokeWidth={3} color={s.accent} /> : null}
                    {labels[i] ?? `Step ${i + 1}`}
                  </span>
                ) : (
                  <span style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: s.line }} />
                )}
                {i < total - 1 ? <span style={{ width: 10, height: 1, backgroundColor: s.line }} /> : null}
              </span>
            )
          })}
        </div>
      )

    // SQ-20 A ledger header: the step named on the left, a filled count chip on
    // the right. The chip is the source's own treatment - it prints the count
    // in a brand-tinted block rather than as another line of caps - and it is
    // the only mark in this design's chrome, since it draws no bar at all.
    case 'item_count':
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%' }}>
          <span style={capsLabel}>{labels[index] ?? `Step ${index + 1}`}</span>
          <span style={{ ...capsLabel, color: s.onAccentFill, backgroundColor: s.accentFill, padding: '4px 10px', borderRadius: 3, whiteSpace: 'nowrap' }}>
            {done} of {total} recorded
          </span>
        </div>
      )

    default:
      return bar(4, 2)
  }
}
