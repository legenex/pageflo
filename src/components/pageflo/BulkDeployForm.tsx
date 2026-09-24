'use client'

import { useMemo, useState } from 'react'
import { Loader2, Rocket } from 'lucide-react'
import { bulkDeployMaster } from '@/app/(app)/admin/(top)/deployments/actions'
import { planBulkDeploy, type BulkDeployAttempt, type BulkDeployKind } from '@/lib/bulk-deploy'

type Master = { id: string; name: string; kind: BulkDeployKind }
type Brand = { id: string; slug: string; name: string }

export function BulkDeployForm({ masters, brands }: { masters: Master[]; brands: Brand[] }) {
  const [kind, setKind] = useState<BulkDeployKind>('quiz')
  const [masterId, setMasterId] = useState(masters.find((m) => m.kind === 'quiz')?.id || '')
  const [selected, setSelected] = useState<string[]>([])
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState<BulkDeployAttempt[] | null>(null)

  const kindMasters = masters.filter((m) => m.kind === kind)
  const plan = useMemo(() => {
    const chosen = brands.filter((b) => selected.includes(b.id)).map((b) => ({
      id: Number(b.id),
      slug: b.slug,
      name: b.name,
    }))
    return planBulkDeploy(chosen, path)
  }, [brands, selected, path])

  const onKind = (next: BulkDeployKind) => {
    setKind(next)
    setMasterId(masters.find((m) => m.kind === next)?.id || '')
    setAttempts(null)
  }

  const toggle = (id: string) => {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
    setAttempts(null)
  }

  const submit = async () => {
    setBusy(true)
    setError('')
    setAttempts(null)
    try {
      const res = await bulkDeployMaster({ kind, masterId, brandIds: selected, path })
      if (!res.ok && res.attempts.length === 0) {
        setError(res.error)
      } else {
        setAttempts(res.attempts)
        if (!res.ok) setError(res.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'bulk deploy failed')
    } finally {
      setBusy(false)
    }
  }

  const review = Array.isArray(plan) ? plan : []
  const planError = Array.isArray(plan) || (!path.trim() && selected.length === 0) ? '' : plan.error

  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-[12.5px] font-semibold text-ink">
          Kind
          <select
            value={kind}
            onChange={(e) => onKind(e.target.value as BulkDeployKind)}
            className="h-9 rounded-app border border-border bg-surface px-2 text-[13px] font-normal"
          >
            <option value="quiz">Quiz</option>
            <option value="lp">Landing Page</option>
            <option value="advertorial">Advertorial</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-[12.5px] font-semibold text-ink">
          Master
          <select
            value={masterId}
            onChange={(e) => setMasterId(e.target.value)}
            className="h-9 rounded-app border border-border bg-surface px-2 text-[13px] font-normal"
          >
            {kindMasters.length === 0 ? <option value="">No masters of this kind</option> : null}
            {kindMasters.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-1.5 text-[12.5px] font-semibold text-ink">
        Path
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/s/mva"
          className="h-9 rounded-app border border-border bg-surface px-2 font-mono text-[13px] font-normal"
        />
      </label>
      <div>
        <div className="mb-2 text-[12.5px] font-semibold text-ink">Brands</div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {brands.map((b) => (
            <label key={b.id} className="flex items-center gap-2 text-[13px] text-ink">
              <input type="checkbox" checked={selected.includes(b.id)} onChange={() => toggle(b.id)} />
              {b.name}
              <span className="font-mono text-[11px] text-mute">{b.slug}</span>
            </label>
          ))}
        </div>
      </div>
      {planError ? <p className="text-[13px] text-neg">{planError}</p> : null}
      {review.length > 0 ? (
        <div>
          <div className="mb-2 text-[12.5px] font-semibold text-ink">Review preview URLs</div>
          <ul className="grid gap-1 text-[12.5px]">
            {review.map((item) => (
              <li key={item.brandId} className="flex flex-wrap gap-2">
                <span className="font-semibold">{item.brandName}</span>
                <code className="font-mono text-mute">{item.previewUrl}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <button
        type="button"
        disabled={busy || !masterId || review.length === 0}
        onClick={() => void submit()}
        className="inline-flex h-9 w-fit items-center gap-1.5 rounded-app border border-border bg-surface-2 px-3 text-[12.5px] font-semibold text-ink hover:bg-surface-3 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
        Create drafts
      </button>
      {error ? <p className="text-[13px] text-neg">{error}</p> : null}
      {attempts ? (
        <div>
          <div className="mb-2 text-[12.5px] font-semibold text-ink">Results</div>
          <ul className="grid gap-1 text-[12.5px]">
            {attempts.map((a) => (
              <li key={a.brandId}>
                <span className="font-semibold">{a.brandName}</span>
                {a.ok ? (
                  <span className="text-pos"> draft {a.deploymentId} · <code className="font-mono">{a.previewUrl}</code></span>
                ) : (
                  <span className="text-neg"> {a.error}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
