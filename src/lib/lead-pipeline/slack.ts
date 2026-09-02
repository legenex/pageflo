import { safePost } from '@/lib/net/ssrf'
import { PRODUCT_NAME } from '@/lib/pageflo/product'

export type SlackNotificationArgs = {
  webhookUrl: string
  siteName: string
  leadId: string | number
  contact: { first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null; state?: string | null }
  funnelType: string
  testCapture?: boolean
  adminUrl: string
}

export const sendSlackNotification = async (args: SlackNotificationArgs): Promise<{ ok: boolean; error?: string }> => {
  const { webhookUrl, siteName, leadId, contact, funnelType, testCapture, adminUrl } = args
  if (!webhookUrl) return { ok: false, error: 'missing webhook url' }

  const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unnamed lead'
  const fields: Array<{ title: string; value: string; short: boolean }> = []
  if (contact.email) fields.push({ title: 'Email', value: contact.email, short: true })
  if (contact.phone) fields.push({ title: 'Phone', value: contact.phone, short: true })
  if (contact.state) fields.push({ title: 'State', value: contact.state, short: true })
  fields.push({ title: 'Source', value: funnelType, short: true })

  const headline = `${testCapture ? ':test_tube: *TEST LEAD* ' : ':inbox_tray: '} New lead on *${siteName}* — ${name}`

  const body = {
    text: headline,
    attachments: [
      {
        color: testCapture ? '#5CC1E1' : '#2DBE6C',
        fields,
        actions: [
          { type: 'button', text: `Open in ${PRODUCT_NAME}`, url: adminUrl },
        ],
        footer: `Lead ID ${leadId}`,
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  }

  // The Slack hook URL is configuration a super-admin types, which still makes
  // it a user-supplied address this server POSTs lead data to. See lib/net/ssrf.
  const resp = await safePost(webhookUrl, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) return { ok: false, error: resp.reason }
  if (resp.status < 200 || resp.status >= 300) return { ok: false, error: `slack returned ${resp.status}` }
  return { ok: true }
}
