'use client'

import { useMemo, useState, useTransition } from 'react'
import { Plus, Search, Shield, MoreVertical, Pencil, Trash2, X, UserCheck, UserX, Mail } from 'lucide-react'
import { PRODUCT_NAME } from '@/lib/pageflo/product'
import { inviteUser, updateUser, deleteUser, setStatus } from './actions'

export type Role = 'admin' | 'editor' | 'analyst'
export type Status = 'invited' | 'active' | 'disabled'
export type Binding = { site: number; role: Role }
export type SiteOption = { id: number; name: string; slug: string }
export type UserRow = {
  id: string
  email: string
  name: string
  super_admin: boolean
  status: Status
  last_login_at: string | null
  created_at: string | null
  bindings: Binding[]
}

const STATUS_TONE: Record<Status, { color: string; bg: string; label: string }> = {
  active: { color: '#7FE3A8', bg: 'rgba(45,190,108,0.12)', label: 'Active' },
  invited: { color: '#F4C97F', bg: 'rgba(232,177,75,0.12)', label: 'Invited' },
  disabled: { color: '#F1A39B', bg: 'rgba(192,58,43,0.14)', label: 'Disabled' },
}

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  editor: 'Editor',
  analyst: 'Analyst',
}

const fmtDate = (d: string | null): string => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function UsersClient({ meId, users, sites }: { meId: string; users: UserRow[]; sites: SiteOption[] }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | Status>('all')
  const [dialog, setDialog] = useState<{ mode: 'invite' } | { mode: 'edit'; user: UserRow } | { mode: 'delete'; user: UserRow } | null>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return users.filter((u) => {
      if (filter !== 'all' && u.status !== filter) return false
      if (!needle) return true
      return u.email.toLowerCase().includes(needle) || u.name.toLowerCase().includes(needle)
    })
  }, [users, q, filter])

  const counts = useMemo(() => ({
    all: users.length,
    active: users.filter((u) => u.status === 'active').length,
    invited: users.filter((u) => u.status === 'invited').length,
    disabled: users.filter((u) => u.status === 'disabled').length,
  }), [users])

  const showToast = (kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg })
    setTimeout(() => setToast(null), 4000)
  }

  return (
    <div className="px-5 pb-16 pt-6 sm:px-7 max-w-[1400px]">
      <header className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Users</h1>
          <p className="text-ink-muted text-[13px] mt-1.5">
            {PRODUCT_NAME}-wide roster and per-Site role bindings.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialog({ mode: 'invite' })}
          className="brand-gradient text-white font-medium text-[14px] px-4 py-2.5 rounded-lg inline-flex items-center gap-1.5 hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> Invite User
        </button>
      </header>

      <div className="flex gap-2 mb-5 flex-wrap">
        <FilterChip label={`All (${counts.all})`} active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterChip label={`Active (${counts.active})`} active={filter === 'active'} onClick={() => setFilter('active')} />
        <FilterChip label={`Invited (${counts.invited})`} active={filter === 'invited'} onClick={() => setFilter('invited')} />
        <FilterChip label={`Disabled (${counts.disabled})`} active={filter === 'disabled'} onClick={() => setFilter('disabled')} />
        <div className="flex-1 max-w-[420px] relative ml-auto">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)]" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by email or name..."
            className="w-full bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-lg pl-10 pr-3 py-2.5 text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-dim)] focus:outline-none focus:border-[var(--color-border-strong)]"
          />
        </div>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] card-edge">
        <div className="grid grid-cols-[2fr_1fr_0.8fr_1.4fr_1fr_60px] px-5 py-3 text-[11px] uppercase tracking-wider text-[var(--color-ink-muted)] font-semibold border-b border-[var(--color-border)]">
          <span>User</span>
          <span>Role</span>
          <span>Status</span>
          <span>Site Access</span>
          <span>Last Login</span>
          <span />
        </div>
        {filtered.length === 0 ? (
          <div className="px-5 py-16 text-center text-[var(--color-ink-dim)]">No users match your filters.</div>
        ) : (
          <ul>
            {filtered.map((u) => (
              <UserRowItem
                key={u.id}
                user={u}
                sites={sites}
                isSelf={u.id === meId}
                onEdit={() => setDialog({ mode: 'edit', user: u })}
                onDelete={() => setDialog({ mode: 'delete', user: u })}
                onToast={showToast}
              />
            ))}
          </ul>
        )}
      </div>

      {dialog?.mode === 'invite' ? (
        <UserDialog
          mode="invite"
          sites={sites}
          onClose={() => setDialog(null)}
          onToast={showToast}
        />
      ) : null}
      {dialog?.mode === 'edit' ? (
        <UserDialog
          mode="edit"
          sites={sites}
          user={dialog.user}
          onClose={() => setDialog(null)}
          onToast={showToast}
        />
      ) : null}
      {dialog?.mode === 'delete' ? (
        <DeleteDialog
          user={dialog.user}
          onClose={() => setDialog(null)}
          onToast={showToast}
        />
      ) : null}

      {toast ? (
        <div className="fixed bottom-6 right-6 z-50">
          <div
            className="px-4 py-3 rounded-lg border bg-[var(--color-surface-1)] shadow-lg text-[13px] font-medium"
            style={{
              borderColor: toast.kind === 'ok' ? 'rgba(45,190,108,0.4)' : 'rgba(192,58,43,0.4)',
              color: toast.kind === 'ok' ? '#7FE3A8' : '#F1A39B',
            }}
          >
            {toast.msg}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-lg text-[13px] font-medium border transition-colors ${
        active
          ? 'bg-[var(--color-surface-2)] text-white border-[var(--color-border-strong)]'
          : 'bg-transparent text-[var(--color-ink-muted)] border-[var(--color-border)] hover:text-white hover:bg-[var(--color-surface-2)]'
      }`}
    >
      {label}
    </button>
  )
}

function UserRowItem({
  user,
  sites,
  isSelf,
  onEdit,
  onDelete,
  onToast,
}: {
  user: UserRow
  sites: SiteOption[]
  isSelf: boolean
  onEdit: () => void
  onDelete: () => void
  onToast: (kind: 'ok' | 'err', msg: string) => void
}) {
  const [menu, setMenu] = useState(false)
  const [, start] = useTransition()
  const tone = STATUS_TONE[user.status]
  const initials = (user.name || user.email)
    .split(/[\s@.]+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  const siteNames = user.bindings
    .map((b) => {
      const s = sites.find((x) => x.id === b.site)
      return s ? `${s.name} · ${ROLE_LABEL[b.role]}` : null
    })
    .filter((x): x is string => x !== null)

  const setUserStatus = (next: Status) => {
    start(async () => {
      const fd = new FormData()
      fd.append('id', user.id)
      fd.append('status', next)
      const res = await setStatus(fd)
      if (res.ok) onToast('ok', `Status updated to ${next}`)
      else onToast('err', res.error)
      setMenu(false)
    })
  }

  return (
    <li className="grid grid-cols-[2fr_1fr_0.8fr_1.4fr_1fr_60px] px-5 py-3.5 items-center border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-2)]/40 last:rounded-b-xl transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-9 h-9 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-center text-[12px] font-semibold text-white shrink-0">
          {initials}
        </span>
        <div className="min-w-0">
          <p className="text-white text-[14px] font-medium truncate flex items-center gap-1.5">
            {user.name || '—'}
            {isSelf ? <span className="text-[10px] text-[var(--color-ink-dim)] font-normal">(you)</span> : null}
          </p>
          <p className="text-[12px] text-[var(--color-ink-muted)] truncate">{user.email}</p>
        </div>
      </div>
      <div>
        {user.super_admin ? (
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[#9FD8EE] bg-[rgba(92,193,225,0.10)] px-2 py-1 rounded-md">
            <Shield className="w-3 h-3" />
            Super
          </span>
        ) : (
          <span className="text-[12px] text-[var(--color-ink-muted)]">Member</span>
        )}
      </div>
      <div>
        <span
          className="inline-flex items-center text-[11px] font-medium px-2 py-1 rounded-md"
          style={{ color: tone.color, background: tone.bg }}
        >
          {tone.label}
        </span>
      </div>
      <div className="text-[12px] text-[var(--color-ink-muted)] truncate">
        {user.super_admin ? (
          <span className="text-[var(--color-ink-dim)] italic">All sites (super admin)</span>
        ) : siteNames.length === 0 ? (
          <span className="text-[var(--color-ink-dim)]">No site access</span>
        ) : siteNames.length <= 2 ? (
          siteNames.join(', ')
        ) : (
          <span>
            {siteNames.slice(0, 2).join(', ')} <span className="text-[var(--color-ink-dim)]">+{siteNames.length - 2}</span>
          </span>
        )}
      </div>
      <div className="text-[12px] text-[var(--color-ink-muted)]">{fmtDate(user.last_login_at)}</div>
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenu((v) => !v)}
          className="p-1.5 rounded-md hover:bg-[var(--color-surface-2)] text-[var(--color-ink-muted)] hover:text-white"
          aria-label="Row actions"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
        {menu ? (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
            <div className="absolute right-0 top-full mt-1 z-50 w-52 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] shadow-xl py-1">
              <MenuItem onClick={() => { setMenu(false); onEdit() }} icon={Pencil}>Edit user</MenuItem>
              {user.status !== 'active' ? (
                <MenuItem onClick={() => setUserStatus('active')} icon={UserCheck}>Mark active</MenuItem>
              ) : null}
              {user.status !== 'disabled' && !isSelf ? (
                <MenuItem onClick={() => setUserStatus('disabled')} icon={UserX}>Disable</MenuItem>
              ) : null}
              {user.status !== 'invited' ? (
                <MenuItem onClick={() => setUserStatus('invited')} icon={Mail}>Mark invited</MenuItem>
              ) : null}
              <div className="my-1 h-px bg-[var(--color-border)]" />
              <MenuItem
                onClick={() => { setMenu(false); onDelete() }}
                icon={Trash2}
                danger
                disabled={isSelf}
              >
                Delete user
              </MenuItem>
            </div>
          </>
        ) : null}
      </div>
    </li>
  )
}

function MenuItem({
  children,
  onClick,
  icon: Icon,
  danger,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  icon: typeof Pencil
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full px-3 py-2 text-left text-[13px] flex items-center gap-2 transition-colors ${
        disabled
          ? 'opacity-40 cursor-not-allowed text-[var(--color-ink-muted)]'
          : danger
            ? 'text-[#F1A39B] hover:bg-[rgba(192,58,43,0.10)]'
            : 'text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {children}
    </button>
  )
}

function UserDialog({
  mode,
  sites,
  user,
  onClose,
  onToast,
}: {
  mode: 'invite' | 'edit'
  sites: SiteOption[]
  user?: UserRow
  onClose: () => void
  onToast: (kind: 'ok' | 'err', msg: string) => void
}) {
  const [bindings, setBindings] = useState<Binding[]>(user?.bindings ?? [])
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const onSubmit = (formData: FormData) => {
    setErr(null)
    formData.append('siteBindings', JSON.stringify(bindings))
    start(async () => {
      const res = mode === 'invite' ? await inviteUser(formData) : await updateUser(formData)
      if (res.ok) {
        onToast('ok', mode === 'invite' ? 'User invited' : 'User updated')
        onClose()
      } else {
        setErr(res.error)
      }
    })
  }

  const addBinding = () => {
    const used = new Set(bindings.map((b) => b.site))
    const next = sites.find((s) => !used.has(s.id))
    if (!next) return
    setBindings((cur) => [...cur, { site: next.id, role: 'editor' }])
  }

  return (
    <Modal title={mode === 'invite' ? 'Invite User' : `Edit ${user?.name || user?.email}`} onClose={onClose}>
      <form action={onSubmit} className="space-y-4">
        {mode === 'edit' && user ? <input type="hidden" name="id" value={user.id} /> : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Email" required>
            <input
              name="email"
              type="email"
              required
              defaultValue={user?.email ?? ''}
              disabled={mode === 'edit'}
              className={inputClass}
            />
          </Field>
          <Field label="Name" required>
            <input name="name" required defaultValue={user?.name ?? ''} className={inputClass} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={mode === 'invite' ? 'Password' : 'New password (optional)'} required={mode === 'invite'}>
            <input
              name="password"
              type="password"
              minLength={mode === 'invite' ? 8 : undefined}
              required={mode === 'invite'}
              placeholder={mode === 'edit' ? 'Leave blank to keep' : 'Minimum 8 characters'}
              className={inputClass}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={user?.status ?? 'invited'} className={inputClass}>
              <option value="invited">Invited</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </Field>
        </div>

        <label className="flex items-center gap-2.5 text-[13px] cursor-pointer select-none py-1">
          <input type="checkbox" name="super_admin" defaultChecked={user?.super_admin ?? false} className="accent-current" />
          <Shield className="w-3.5 h-3.5 text-[#9FD8EE]" />
          <span className="text-white font-medium">Super admin</span>
          <span className="text-[var(--color-ink-dim)]">— bypasses all per-site role bindings</span>
        </label>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[13px] font-medium text-white">Site role bindings</label>
            <button
              type="button"
              onClick={addBinding}
              disabled={bindings.length >= sites.length}
              className="text-[12px] text-[var(--color-info)] hover:underline disabled:opacity-40 disabled:no-underline"
            >
              + Add binding
            </button>
          </div>
          {sites.length === 0 ? (
            <p className="text-[12px] text-[var(--color-ink-dim)] italic">No sites exist yet.</p>
          ) : bindings.length === 0 ? (
            <p className="text-[12px] text-[var(--color-ink-dim)] italic">
              No site bindings. {mode === 'invite' ? 'Without a binding (and not super admin), this user will not see any sites.' : ''}
            </p>
          ) : (
            <div className="space-y-2">
              {bindings.map((b, idx) => (
                <div key={`${b.site}-${idx}`} className="flex items-center gap-2">
                  <select
                    value={b.site}
                    onChange={(e) =>
                      setBindings((cur) => cur.map((x, i) => (i === idx ? { ...x, site: Number(e.target.value) } : x)))
                    }
                    className={`${inputClass} flex-1`}
                  >
                    {sites.map((s) => (
                      <option
                        key={s.id}
                        value={s.id}
                        disabled={bindings.some((bb, j) => j !== idx && bb.site === s.id)}
                      >
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={b.role}
                    onChange={(e) =>
                      setBindings((cur) => cur.map((x, i) => (i === idx ? { ...x, role: e.target.value as Role } : x)))
                    }
                    className={`${inputClass} w-32`}
                  >
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                    <option value="analyst">Analyst</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setBindings((cur) => cur.filter((_, i) => i !== idx))}
                    className="p-2 rounded-md text-[var(--color-ink-muted)] hover:text-[#F1A39B] hover:bg-[rgba(192,58,43,0.08)]"
                    aria-label="Remove"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {err ? (
          <div className="rounded-lg border border-[rgba(192,58,43,0.30)] bg-[rgba(192,58,43,0.10)] px-3 py-2 text-[13px] text-[#F1A39B]">
            {err}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] text-[var(--color-ink-muted)] hover:text-white px-3 py-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="brand-gradient text-white font-medium text-[13px] px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {pending ? 'Saving…' : mode === 'invite' ? 'Invite user' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function DeleteDialog({
  user,
  onClose,
  onToast,
}: {
  user: UserRow
  onClose: () => void
  onToast: (kind: 'ok' | 'err', msg: string) => void
}) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const onConfirm = () => {
    setErr(null)
    start(async () => {
      const fd = new FormData()
      fd.append('id', user.id)
      const res = await deleteUser(fd)
      if (res.ok) {
        onToast('ok', 'User deleted')
        onClose()
      } else {
        setErr(res.error)
      }
    })
  }

  return (
    <Modal title="Delete user" onClose={onClose}>
      <p className="text-[14px] text-[var(--color-ink)] mb-1">
        Delete <span className="text-white font-medium">{user.name || user.email}</span>?
      </p>
      <p className="text-[13px] text-[var(--color-ink-muted)] mb-5">
        This permanently removes the user account and all site bindings. This cannot be undone.
      </p>
      {err ? (
        <div className="mb-4 rounded-lg border border-[rgba(192,58,43,0.30)] bg-[rgba(192,58,43,0.10)] px-3 py-2 text-[13px] text-[#F1A39B]">
          {err}
        </div>
      ) : null}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
        <button
          type="button"
          onClick={onClose}
          className="text-[13px] text-[var(--color-ink-muted)] hover:text-white px-3 py-2"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="text-[13px] font-medium px-4 py-2 rounded-lg bg-[rgba(192,58,43,0.20)] border border-[rgba(192,58,43,0.40)] text-[#F1A39B] hover:bg-[rgba(192,58,43,0.30)] disabled:opacity-50"
        >
          {pending ? 'Deleting…' : 'Delete user'}
        </button>
      </div>
    </Modal>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-[560px] rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] shadow-2xl">
        <header className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-[16px] font-semibold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-[var(--color-ink-muted)] hover:text-white hover:bg-[var(--color-surface-2)]"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-[var(--color-ink-muted)] mb-1.5">
        {label}
        {required ? <span className="text-[#F1A39B] ml-0.5">*</span> : null}
      </span>
      {children}
    </label>
  )
}

const inputClass =
  'w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[13px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-dim)] focus:outline-none focus:border-[var(--color-border-strong)] disabled:opacity-60'
