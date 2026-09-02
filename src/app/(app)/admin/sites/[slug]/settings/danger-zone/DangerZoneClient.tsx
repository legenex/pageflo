'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertOctagon, Loader2 } from 'lucide-react'
import { useConfirm } from '@/components/pageflo/interactive'
import { Card, Mono, StatusPill, type Tone } from '@/components/pageflo/primitives'
import { setSiteStatus, type SiteStatus } from '../general/actions'
import { deleteBrandSite } from '@/app/(app)/admin/(top)/brands/brand-identities/actions'

/**
 * The Site danger zone.
 *
 * Every control here used to be a DISABLED button with `title="Wired in next
 * phase"`, and the delete card said "Leads are preserved", which is the exact
 * opposite of what happens: `cascadeDeleteSiteChildren` removes the Site's
 * Leads because their `site` column is NOT NULL and Postgres cannot SET NULL
 * on it. A screen that tells an operator their consent records survive a delete
 * that destroys them is worse than a screen with no delete on it.
 *
 * So: the actions are real, they run the same authorised server actions the
 * rest of the console uses, and the copy says what actually happens. Delete
 * requires typing the Site's slug, which is the one control in the product
 * where a mis-aimed click and a decision must not look the same.
 */

type Counts = {
  pages: number
  leads: number
  domains: number
  quizDeployments: number
  lpDeployments: number
}

const STATUS_TONE: Record<SiteStatus, Tone> = {
  draft: 'info',
  active: 'pos',
  paused: 'warn',
  archived: 'neutral',
}

export function DangerZoneClient({
  siteId,
  siteName,
  siteSlug,
  status,
  primaryHost,
  counts,
  canDelete,
}: {
  siteId: number
  siteName: string
  siteSlug: string
  status: SiteStatus
  primaryHost: string | null
  counts: Counts
  /** Only a workspace owner may delete a Site; Payload's access rules agree. */
  canDelete: boolean
}) {
  const router = useRouter()
  const [current, setCurrent] = useState<SiteStatus>(status)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [confirm, confirmDialog] = useConfirm()

  const move = (to: SiteStatus, options: Parameters<typeof confirm>[0]) => {
    void (async () => {
      setError(null)
      if (!(await confirm(options))) return
      start(async () => {
        const res = await setSiteStatus({ siteId, from: current, to })
        if (!res.ok) {
          setError(res.error)
          return
        }
        setCurrent(res.status)
        router.refresh()
      })
    })()
  }

  const onDelete = () => {
    void (async () => {
      setError(null)
      const ok = await confirm({
        title: `Permanently delete ${siteName}?`,
        message:
          'This cannot be undone. The Site and every record that belongs to it are removed from the database, and any domain pointed at it stops serving immediately.',
        detail: (
          <ul className="space-y-1 text-left">
            <li>
              <Mono className="text-neg">{counts.leads}</Mono> leads, including their consent records and
              certificates, are deleted. Export them first if you need to keep them.
            </li>
            <li>
              <Mono>{counts.pages}</Mono> pages, <Mono>{counts.quizDeployments}</Mono> quiz deployments and{' '}
              <Mono>{counts.lpDeployments}</Mono> landing page deployments are deleted.
            </li>
            <li>
              <Mono>{counts.domains}</Mono> domains are released, including this Site&apos;s preview domain.
            </li>
            <li>
              Brandless quizzes, landing pages and advertorials are NOT deleted. They belong to the workspace, not to
              this Site, and stay available to every other brand.
            </li>
          </ul>
        ),
        confirmLabel: 'Delete this Site',
        tone: 'danger',
        typeToConfirm: siteSlug,
      })
      if (!ok) return
      start(async () => {
        const res = await deleteBrandSite({ siteId })
        if (!res.ok) {
          setError(res.error)
          return
        }
        router.push('/admin/sites')
        router.refresh()
      })
    })()
  }

  const canPause = current === 'active'
  const canResume = current === 'paused'
  const canArchive = current !== 'archived'

  return (
    <div className="space-y-2.5">
      {confirmDialog}

      {error ? (
        <div role="alert" className="rounded-app border border-neg/30 bg-neg/10 px-3.5 py-2.5 text-[12.5px] text-neg">
          {error}
        </div>
      ) : null}

      <Card className="flex flex-wrap items-center gap-2.5 px-3.5 py-3">
        <span className="text-[12.5px] text-ink-muted">Current status</span>
        <StatusPill label={current} tone={STATUS_TONE[current]} />
        {primaryHost ? (
          <Mono className="text-[11.5px] text-ink-dim">{primaryHost}</Mono>
        ) : (
          <span className="text-[11.5px] text-ink-dim">No primary domain</span>
        )}
      </Card>

      <DangerCard
        title={canResume ? 'Resume Site' : 'Pause Site'}
        body={
          canResume
            ? `${primaryHost ?? 'This Site'} starts serving to the public again. Nothing else changes.`
            : `${primaryHost ?? 'This Site'} stops serving to the public. Configuration, content and deployments are kept, and you can resume at any time. The console stays available.`
        }
        action={canResume ? 'Resume Site' : 'Pause Site'}
        disabled={pending || (!canPause && !canResume)}
        disabledReason={
          current === 'draft'
            ? 'This Site has not been published yet, so there is nothing to pause.'
            : current === 'archived'
              ? 'Archived Sites do not serve. Restore it first.'
              : undefined
        }
        onClick={() =>
          canResume
            ? move('active', {
                title: 'Resume this Site?',
                message: primaryHost
                  ? `${primaryHost} starts serving to the public again immediately.`
                  : 'This Site starts serving to the public again. It has no primary domain, so nothing becomes reachable until one is connected.',
                confirmLabel: 'Resume',
              })
            : move('paused', {
                title: 'Pause this Site?',
                message: primaryHost
                  ? `${primaryHost} stops serving to the public. Nothing is deleted and you can resume at any time.`
                  : 'This Site stops serving to the public. Nothing is deleted and you can resume at any time.',
                confirmLabel: 'Pause',
                tone: 'danger',
              })
        }
        pending={pending}
      />

      <DangerCard
        title="Archive Site"
        body="The Site stops serving, drops out of the default Sites list, and can no longer be paused or resumed. All content is preserved. Restoring it is a deliberate action taken from the raw admin, not a status flip here."
        action="Archive Site"
        disabled={pending || !canArchive}
        disabledReason={canArchive ? undefined : 'This Site is already archived.'}
        onClick={() =>
          move('archived', {
            title: 'Archive this Site?',
            message:
              'It stops serving to the public and leaves the Sites list. Nothing is deleted, but archiving is terminal from this screen: bringing it back is done from the raw admin.',
            confirmLabel: 'Archive',
            tone: 'danger',
          })
        }
        pending={pending}
      />

      <DangerCard
        title="Delete Site"
        body={`Permanently deletes this Site and everything that belongs to it, including its ${counts.leads} leads and their consent records. Brandless quizzes, landing pages and advertorials are not affected. You will be asked to type the Site's slug.`}
        action="Delete Site"
        destructive
        disabled={pending || !canDelete}
        disabledReason={canDelete ? undefined : 'Only a workspace owner can delete a Site.'}
        onClick={onDelete}
        pending={pending}
      />
    </div>
  )
}

function DangerCard({
  title,
  body,
  action,
  destructive,
  disabled,
  disabledReason,
  onClick,
  pending,
}: {
  title: string
  body: string
  action: string
  destructive?: boolean
  disabled?: boolean
  disabledReason?: string
  onClick: () => void
  pending: boolean
}) {
  return (
    <section
      className={`flex flex-wrap items-start gap-3.5 rounded-app-lg border bg-linear-to-b from-surface-2 to-surface-1 p-3.5 ${
        destructive ? 'border-neg/40' : 'border-border'
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-app ${
          destructive ? 'bg-neg/10 text-neg' : 'bg-warn/10 text-warn'
        }`}
      >
        <AlertOctagon className="h-4 w-4" />
      </span>
      <div className="min-w-[220px] flex-1">
        <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-[12.5px] leading-[1.6] text-ink-muted">{body}</p>
        {disabled && disabledReason ? (
          <p className="mt-1.5 text-[11.5px] text-ink-dim">{disabledReason}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-app px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
          destructive
            ? 'border border-neg/30 bg-neg/15 text-neg hover:bg-neg/25'
            : 'border border-border-strong bg-surface-3 text-ink hover:bg-surface-2'
        }`}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
        {action}
      </button>
    </section>
  )
}
