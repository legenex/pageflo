import type { DeliveryEntry, LeadStatus } from './model'

/** The serialisable shape the table and modal receive from the server page. */
export type LeadRow = {
  id: string
  createdAt: string
  updatedAt: string
  status: LeadStatus
  source_entity_type: string
  source_entity_id?: string | null
  test_capture?: boolean | null
  siteName?: string | null
  siteSlug?: string | null
  brandColor?: string | null
  contact?: {
    first_name?: string | null
    last_name?: string | null
    email?: string | null
    phone?: string | null
    state?: string | null
    zip?: string | null
  } | null
  quiz_answers?: unknown
  attribution?: unknown
  hlr_result?: unknown
  consent?: {
    accepted?: boolean | null
    disclosure_text?: string | null
    accepted_at?: string | null
    client_accepted_at?: string | null
    method?: string | null
    source_site_slug?: string | null
    source_site_name?: string | null
    source_host?: string | null
    source_funnel_type?: string | null
    source_funnel_id?: string | null
    source_funnel_path?: string | null
    source_deployment_id?: string | null
  } | null
  delivery_state?: string | null
  trustedform_cert_url?: string | null
  jornaya_lead_id?: string | null
  client_submission_id?: string | null
  buyer_id?: string | null
  sold_at?: string | null
  status_history?: Array<{ status?: string | null; changed_at?: string | null; note?: string | null }> | null
  delivery_log?: DeliveryEntry[] | null
}
