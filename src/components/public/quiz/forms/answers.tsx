'use client'

/**
 * The nineteen ways a quiz template draws one selectable answer.
 *
 * Each is handed a label, an optional icon, and whether it is selected. None of
 * them knows what the question was, what selecting does, or where the flow goes
 * next: that is the deployment's, and keeping it out of the signature is what
 * makes "presentation only" true rather than merely intended.
 *
 * Every form has to satisfy the same states from the handoff's component
 * documentation, and two of them are easy to get wrong. Selection shows THREE
 * signals - border, fill and a mark - because colour alone fails for a
 * colour-blind reader. And a long label wraps rather than truncating, so no
 * form here sets a fixed height or an ellipsis.
 */

import type { CSSProperties, ReactNode } from 'react'
import { Check } from 'lucide-react'
import type { AnswerForm, IconPolicy } from '@/lib/quiz-templates/model'
import type { QuizTheme } from '@/lib/quiz-templates/theme'

export type AnswerProps = {
  form: AnswerForm
  icons: IconPolicy
  theme: QuizTheme
  label: string
  index: number
  selected: boolean
  /** Checkbox semantics rather than radio. Drives the mark, not the layout. */
  multi?: boolean
  icon?: ReactNode
  /** Small text some forms show beside the label, supplied by the deployment. */
  meta?: string
  onSelect: () => void
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** Icons are a policy: some templates show them on every answer, some never. */
const showsIcon = (policy: IconPolicy): boolean =>
  policy !== 'badges' && policy !== 'status'

export const QuizAnswer = ({
  form, icons, theme, label, index, selected, multi, icon, meta, onSelect,
}: AnswerProps) => {
  const { surface: s, fonts } = theme
  const withIcon = showsIcon(icons) && Boolean(icon)

  // Shared by every row-shaped form. Three selection signals, never colour alone.
  const base: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
    padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
    minHeight: 48, fontFamily: fonts.body, fontSize: 15, lineHeight: 1.45,
    backgroundColor: selected ? s.accentFill : s.card,
    color: selected ? s.onAccentFill : s.cardText,
    border: `1px solid ${selected ? s.accentFill : s.line}`,
    transition: 'background-color .12s ease, border-color .12s ease',
  }

  const mark = (shape: 'radio' | 'square' | 'tick' = 'radio') => {
    const size = 20
    const common: CSSProperties = {
      width: size, height: size, flexShrink: 0, display: 'inline-flex',
      alignItems: 'center', justifyContent: 'center',
      border: `2px solid ${selected ? s.onAccentFill : s.line}`,
      borderRadius: shape === 'radio' && !multi ? size / 2 : 3,
      backgroundColor: selected ? s.onAccentFill : 'transparent',
      color: selected ? s.accentFill : 'transparent',
    }
    if (shape === 'tick') return selected ? <Check size={16} strokeWidth={3} style={{ flexShrink: 0 }} /> : <span style={{ width: size, flexShrink: 0 }} />
    return <span style={common}>{selected ? <Check size={12} strokeWidth={3} /> : null}</span>
  }

  const btn = (style: CSSProperties, children: ReactNode) => (
    <button
      type="button"
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={selected}
      onClick={onSelect}
      // The one attribute that tells a live answer control apart from a picture
      // of one. The landing-page quiz shipped as static markup that looked
      // identical - `button type=submit`, no React props, seven clicks and zero
      // lead posts - and nothing in the DOM distinguished them, so nothing could
      // assert the difference. See scripts/test-e2e-lead.mts.
      data-quiz-answer=""
      style={{ ...style, cursor: 'pointer' }}
    >
      {children}
    </button>
  )

  switch (form) {
    // SQ-01 A letter, a hairline, and the label. No box.
    case 'lettered_hairline':
      return btn(
        { ...base, backgroundColor: 'transparent', border: 'none', borderBottom: `1px solid ${s.line}`, color: s.text, padding: '15px 4px' },
        <>
          <span style={{ fontFamily: fonts.utility, fontSize: 12, color: selected ? s.accent : s.muted, width: 18, flexShrink: 0, fontWeight: 600 }}>{LETTERS[index] ?? index + 1}</span>
          {withIcon ? <span style={{ opacity: 0.55, display: 'inline-flex' }}>{icon}</span> : null}
          <span style={{ flex: 1, fontWeight: selected ? 600 : 400 }}>{label}</span>
          {selected ? <Check size={16} strokeWidth={3} color={s.accent} /> : null}
        </>,
      )

    // SQ-02 Soft, rounded, with a tinted icon chip.
    case 'soft_radio':
      return btn(
        { ...base, borderRadius: 14, backgroundColor: selected ? s.card : s.card, borderColor: selected ? s.accentFill : s.line, borderWidth: selected ? 2 : 1, color: s.cardText },
        <>
          {withIcon ? (
            <span style={{ width: 34, height: 34, borderRadius: 17, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', backgroundColor: s.bg, color: s.accent }}>{icon}</span>
          ) : null}
          <span style={{ flex: 1 }}>{label}</span>
          {mark('radio')}
        </>,
      )

    // SQ-03 Square everything: rows, markers, corners.
    case 'squared_rows':
      return btn({ ...base, borderRadius: 0 }, <>{mark('square')}<span style={{ flex: 1 }}>{label}</span>{withIcon ? icon : null}</>)

    // SQ-04 A document row that gets stamped when it is recorded.
    case 'document_stamps':
      return btn(
        { ...base, borderRadius: 2, backgroundColor: s.card, color: s.cardText, borderLeft: `3px solid ${selected ? s.accentFill : s.line}` },
        <>
          <span style={{ flex: 1 }}>{label}</span>
          {selected ? (
            <span style={{ fontFamily: fonts.utility, fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: s.accent, border: `1px solid ${s.accent}`, padding: '2px 6px' }}>Recorded</span>
          ) : null}
        </>,
      )

    // SQ-05 Bold, full width, with a chevron. Direct response.
    case 'bold_buttons':
      return btn(
        { ...base, borderRadius: 6, fontWeight: 700, fontSize: 16, padding: '18px 20px', backgroundColor: selected ? s.accentFill : s.card, color: selected ? s.onAccentFill : s.cardText, borderWidth: 2 },
        <>
          {withIcon ? <span style={{ display: 'inline-flex' }}>{icon}</span> : null}
          <span style={{ flex: 1 }}>{label}</span>
          <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>{'›'}</span>
        </>,
      )

    // SQ-06 A large tile, icon above the label, in a grid.
    // The icon slot is drawn only when there IS an icon. It used to be
    // unconditional, and since no answer in the model carries one it added a
    // phantom 12px gap above every label in the set.
    case 'icon_tiles':
      return btn(
        { ...base, flexDirection: 'column', gap: 12, alignItems: 'center', textAlign: 'center', padding: '26px 18px', borderRadius: 10, borderWidth: 2, minHeight: 132 },
        <>
          {icon ? <span style={{ display: 'inline-flex', color: selected ? s.onAccentFill : s.accent }}>{icon}</span> : null}
          <span style={{ fontWeight: 600 }}>{label}</span>
        </>,
      )

    // SQ-07 Dark rows that go white when chosen. The inversion is the signal.
    case 'dark_rows':
      return btn(
        { ...base, borderRadius: 4, backgroundColor: selected ? s.text : 'transparent', color: selected ? s.bg : s.text, borderColor: selected ? s.text : s.line },
        <>{withIcon ? <span style={{ display: 'inline-flex', color: selected ? s.bg : s.accent }}>{icon}</span> : null}<span style={{ flex: 1 }}>{label}</span>{selected ? <Check size={16} strokeWidth={3} /> : null}</>,
      )

    // SQ-08 A thick accent edge on the left rather than a full border.
    case 'left_accent':
      return btn(
        { ...base, borderRadius: 3, borderLeft: `4px solid ${selected ? s.accentFill : s.line}`, backgroundColor: selected ? s.card : 'transparent', color: s.text },
        <>{withIcon ? icon : null}<span style={{ flex: 1 }}>{label}</span>{mark('radio')}</>,
      )

    // SQ-09 Pill chips that wrap. The compact form.
    case 'pill_chips':
      return btn(
        { ...base, width: 'auto', borderRadius: 999, padding: '10px 16px', minHeight: 44, fontSize: 14 },
        <>{withIcon ? icon : null}<span>{label}</span></>,
      )

    // SQ-10 A reply in a grid inside the active card.
    case 'reply_grid':
      return btn(
        { ...base, borderRadius: 10, padding: '16px 14px', flexDirection: 'column', alignItems: 'flex-start', gap: 8 },
        <>
          <span style={{ width: 24, height: 24, borderRadius: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? s.onAccentFill : s.bg, color: selected ? s.accentFill : s.muted, fontFamily: fonts.utility, fontSize: 11, fontWeight: 700 }}>{index + 1}</span>
          <span style={{ fontWeight: 500 }}>{label}</span>
        </>,
      )

    // SQ-11 A router card: an icon chip, the label, and the route it opens.
    case 'router_cards':
      return btn(
        { ...base, borderRadius: 10, flexDirection: 'column', alignItems: 'flex-start', gap: 10, padding: '18px 16px' },
        <>
          {withIcon ? <span style={{ width: 32, height: 32, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? s.onAccentFill : s.bg, color: selected ? s.accentFill : s.accent }}>{icon}</span> : null}
          <span style={{ fontWeight: 600 }}>{label}</span>
          {meta ? <span style={{ fontFamily: fonts.utility, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.7 }}>{meta}</span> : null}
        </>,
      )

    // SQ-12, SQ-19 Thin rows, a radio dot, nothing else.
    case 'thin_radio':
      return btn(
        { ...base, backgroundColor: 'transparent', color: s.text, borderColor: selected ? s.accentFill : s.line, borderRadius: 4, padding: '13px 14px', fontSize: 14.5 },
        <>
          <span style={{ width: 16, height: 16, borderRadius: 8, flexShrink: 0, border: `1px solid ${selected ? s.accentFill : s.line}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            {selected ? <span style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.accentFill }} /> : null}
          </span>
          <span style={{ flex: 1 }}>{label}</span>
        </>,
      )

    // SQ-13 A reply pill, right-aligned like something you said.
    case 'reply_pills':
      return btn(
        { ...base, width: 'auto', marginLeft: 'auto', borderRadius: 16, borderBottomRightRadius: 4, padding: '11px 16px', minHeight: 44, fontSize: 14.5 },
        <span>{label}</span>,
      )

    // SQ-14 A diagram tile. The picture is the answer, the label confirms it.
    // The 64x44 tray is the one place an absent icon was VISIBLE: seven empty
    // grey rectangles, which is what "seven simplified top-down collision
    // diagrams" rendered as. Until answers can carry a diagram it holds the
    // letter instead, matching what `pick_cards` already did.
    case 'diagram_tiles':
      return btn(
        { ...base, flexDirection: 'column', gap: 10, alignItems: 'center', textAlign: 'center', padding: '18px 14px', borderRadius: 8, borderWidth: 2, minHeight: 130 },
        <>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 44, borderRadius: 4, backgroundColor: selected ? s.onAccentFill : s.bg, color: selected ? s.accentFill : s.muted }}>
            {icon ?? <span style={{ fontFamily: fonts.utility, fontSize: 15, fontWeight: 700 }}>{LETTERS[index] ?? index + 1}</span>}
          </span>
          <span style={{ fontSize: 13.5, fontWeight: 500 }}>{label}</span>
        </>,
      )

    // SQ-15 A row inside the live node on the journey rail.
    case 'node_rows':
      return btn(
        { ...base, borderRadius: 6, backgroundColor: selected ? s.accentFill : 'transparent', color: selected ? s.onAccentFill : s.text, borderColor: selected ? s.accentFill : s.line, padding: '12px 14px', fontSize: 14.5 },
        <>{withIcon ? icon : null}<span style={{ flex: 1 }}>{label}</span>{selected ? <Check size={15} strokeWidth={3} /> : null}</>,
      )

    // SQ-16 A field row in a case file: label left, value right.
    case 'field_rows':
      return btn(
        { ...base, borderRadius: 0, borderWidth: 0, borderBottom: `1px solid ${s.line}`, backgroundColor: selected ? s.card : 'transparent', color: s.text, padding: '13px 12px' },
        <>
          <span style={{ flex: 1, fontFamily: fonts.body, fontSize: 14.5 }}>{label}</span>
          <span style={{ fontFamily: fonts.utility, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: selected ? s.accent : s.muted }}>
            {selected ? 'Selected' : 'Empty'}
          </span>
        </>,
      )

    // SQ-17 The biggest target in the set: a key-cap letter and large type.
    case 'oversized_letters':
      return btn(
        { ...base, borderRadius: 12, padding: '22px 22px', fontSize: 19, minHeight: 76, borderWidth: 2, gap: 18 },
        <>
          <span style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${selected ? s.onAccentFill : s.line}`, fontFamily: fonts.utility, fontSize: 17, fontWeight: 700 }}>{LETTERS[index] ?? index + 1}</span>
          <span style={{ flex: 1, fontWeight: 600 }}>{label}</span>
        </>,
      )

    // SQ-18 A card you pick, with a medallion. Tap always works.
    case 'pick_cards':
      return btn(
        { ...base, flexDirection: 'column', gap: 14, alignItems: 'center', textAlign: 'center', padding: '28px 20px', borderRadius: 14, borderWidth: 2, minHeight: 160 },
        <>
          <span style={{ width: 46, height: 46, borderRadius: 23, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${selected ? s.onAccentFill : s.accent}`, color: selected ? s.onAccentFill : s.accent }}>{icon ?? <span style={{ fontFamily: fonts.utility, fontWeight: 700 }}>{LETTERS[index]}</span>}</span>
          <span style={{ fontWeight: 600, fontSize: 15.5 }}>{label}</span>
        </>,
      )

    // SQ-20 A checkbox against a document. Multi-select by nature.
    case 'checkbox_docs':
      return btn(
        { ...base, borderRadius: 6, backgroundColor: selected ? s.card : 'transparent', color: s.text, borderColor: selected ? s.accentFill : s.line },
        <>
          {mark('square')}
          {withIcon ? <span style={{ display: 'inline-flex', color: s.muted }}>{icon}</span> : null}
          <span style={{ flex: 1 }}>{label}</span>
        </>,
      )

    default:
      return btn(base, <><span style={{ flex: 1 }}>{label}</span>{mark('radio')}</>)
  }
}

/**
 * How a run of answers is laid out.
 *
 * A property of the answer form rather than of the template, because it follows
 * from the shape: tiles and cards want a grid, chips want to wrap, rows want a
 * column. Deriving it here keeps the twenty template specs from each having to
 * restate something already implied.
 *
 * This was computed, exported, and then read by NOTHING except the gallery
 * thumbnail, while the live card drew a uniform `repeat(cols, 1fr)` grid for
 * all nineteen forms. So chips did not wrap, reply pills were not right-aligned,
 * hairline rows carried a gap they are designed not to have, and the picture in
 * the picker disagreed with the page it was advertising, by construction. The
 * card now reads this too.
 *
 * @param columns  the author's column count, which governs ONLY the forms whose
 *   own shape does not dictate an arrangement. A tile grid auto-fits to the
 *   space it has; a row list stacks or splits as the author asked.
 *
 * Every auto-fit floor is `min(100%, Npx)` rather than a bare `Npx`, because a
 * bare minimum wider than the container overflows it instead of collapsing -
 * which is the difference between a tile grid reflowing at 320px and a page
 * that scrolls sideways.
 */
export const answerLayout = (form: AnswerForm, columns = 1): CSSProperties => {
  switch (form) {
    case 'icon_tiles':
    case 'diagram_tiles':
      return { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 12 }
    case 'pick_cards':
      return { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 14 }
    case 'reply_grid':
      return { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 10 }
    case 'router_cards':
      return { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12 }
    case 'pill_chips':
      return { display: 'flex', flexWrap: 'wrap', gap: 8 }
    case 'reply_pills':
      return { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }
    case 'lettered_hairline':
    case 'field_rows':
      return { display: 'flex', flexDirection: 'column', gap: 0 }
    default:
      return columns > 1
        ? { display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 'clamp(8px, 1.5vw, 12px)' }
        : { display: 'flex', flexDirection: 'column', gap: 10 }
  }
}
