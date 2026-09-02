/**
 * What a provider's answer is allowed to do to a visitor's route.
 *
 * The shipped MVA flow asks a lookup for a tier and then shows different
 * questions depending on the answer. That makes an external string into a
 * routing decision, and this is the one place that decides how much authority
 * it has.
 *
 * THREE RULES, in order:
 *
 *  1. AN ANSWER'S OWN `setTier` WINS. It is a decision the flow author wrote
 *     down; a lookup must not overrule it.
 *  2. A RETURNED TIER MUST BE ONE THE QUIZ DECLARES. Anything else is kept as a
 *     value — it still reaches the lead, because a buyer's own classification is
 *     worth delivering — but it may not select question variants. A tier id
 *     nothing is scoped to silently shows the visitor the shared fallback, which
 *     looks exactly like it worked.
 *  3. NO ANSWER LEAVES THE TIER AS IT WAS. A provider that is down, slow, or
 *     serving HTML must degrade to "untiered", never to a wrong tier.
 *
 * Pure and separate from the runtime because the runtime is a client component:
 * the rule above was written inside it, which meant the only way to check any of
 * this was to drive a browser through a quiz and hope the right branch ran.
 */

export type TierDecision = {
  /** The tier the flow should route on from here. */
  tier: string
  /** Whether the provider's answer is what set it. */
  fromProvider: boolean
  /**
   * Why a returned value was not used, when it was not. Null when there was
   * nothing to reject. This is what a log line is written from, and it names
   * the tiers the quiz does declare so the mismatch is diagnosable at a glance.
   */
  rejected: { returned: string; declared: string[]; reason: 'not_declared' } | null
}

export const decideTier = (args: {
  /** Whatever the provider mapped into the tier field. May be anything. */
  returned: unknown
  /** The tier ids this quiz declares. */
  declared: Array<{ id?: unknown }> | null | undefined
  /** The tier the visitor is currently on. */
  current: string
  /** A tier the answer itself set, which outranks any lookup. */
  answerTier?: string
}): TierDecision => {
  const declared = (Array.isArray(args.declared) ? args.declared : [])
    .map((t) => String(t?.id ?? ''))
    .filter(Boolean)
  const returned = typeof args.returned === 'string' ? args.returned.trim() : args.returned == null ? '' : String(args.returned).trim()
  const answerTier = (args.answerTier ?? '').trim()

  if (answerTier) {
    // The author's decision stands, and a returned value that disagrees is not
    // an error worth reporting: the flow deliberately overrides the lookup here.
    return { tier: answerTier, fromProvider: false, rejected: null }
  }

  if (returned && declared.includes(returned)) {
    return { tier: returned, fromProvider: true, rejected: null }
  }

  return {
    tier: args.current,
    fromProvider: false,
    rejected: returned && returned !== args.current ? { returned, declared, reason: 'not_declared' } : null,
  }
}

/** The log line for a rejected tier. One place, so it reads the same everywhere. */
export const rejectedTierMessage = (rejected: NonNullable<TierDecision['rejected']>): string =>
  `[pageflo] quiz webhook returned tier "${rejected.returned}", which this quiz does not declare ` +
  `(${rejected.declared.join(', ') || 'no tiers'}). Routing tier left unchanged.`
