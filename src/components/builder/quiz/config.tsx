// @ts-nocheck
/* eslint-disable */
'use client'

import { QUIZ_TEMPLATES as SPEC_TEMPLATES } from '@/lib/quiz-templates/model'

// Ported verbatim: node category palette (with icons), question-type -> node-type
// map, and the option lists used across the quiz builder UI.

import {
  HelpCircle, MousePointer, ListChecks, Check, ChevronDown, Calendar, Type as TypeIcon,
  MessageSquare, Hash, FileQuestion, FileText, Mail, Globe, GitBranch, Layers, ShieldCheck,
  Webhook, Zap, Phone, MessageCircle, Loader2, RotateCw, CheckCircle2, AlertCircle,
  ExternalLink, Code2, Video,
} from 'lucide-react'
import { T } from '../ui'

export const NODE_CATEGORIES = [
  { key: 'questions', name: 'Questions & Answers', icon: HelpCircle, color: T.primary, types: [
    { id: 'button_grid', name: 'Button Grid', desc: '2-column tappable buttons', icon: MousePointer },
    { id: 'single_select', name: 'Multiple Choice', desc: 'Single-select list', icon: ListChecks },
    { id: 'multi_select', name: 'Checkboxes', desc: 'Multi-select', icon: Check },
    { id: 'dropdown', name: 'Dropdown', desc: 'From custom field', icon: ChevronDown },
    { id: 'inline_dropdown', name: 'Inline Dropdown', desc: 'Options defined here', icon: ChevronDown },
    { id: 'smart_date', name: 'Smart Date', desc: 'Year > Month > Day picker', icon: Calendar },
    { id: 'text_input', name: 'Text Input', desc: 'Single line text', icon: TypeIcon },
    { id: 'textarea', name: 'Long Text', desc: 'Multi-line text area', icon: MessageSquare },
    { id: 'number_input', name: 'Number Input', desc: 'Numeric only', icon: Hash },
    { id: 'info', name: 'Info Page', desc: 'Informational with continue', icon: FileQuestion },
  ] },
  { key: 'forms', name: 'Forms', icon: FileText, color: T.warning, types: [
    { id: 'lead_form', name: 'Lead Form', desc: 'Qualified lead capture', icon: FileText },
    { id: 'contact_form', name: 'Contact Form', desc: 'Generic contact', icon: Mail },
    { id: 'address_form', name: 'Address Form', desc: 'Street, city, state, ZIP', icon: Globe },
  ] },
  { key: 'logic', name: 'Decision & Logic', icon: GitBranch, color: T.purple, types: [
    { id: 'decision', name: 'Decision Node', desc: 'Branches based on conditions (hidden)', icon: GitBranch },
    { id: 'tier_routing', name: 'Tier Routing', desc: 'Routes based on tier (hidden)', icon: Layers },
    { id: 'qualification_logic', name: 'Qualification Check', desc: 'DQ vs Qualified (hidden)', icon: ShieldCheck },
  ] },
  { key: 'webhooks', name: 'Webhooks / API', icon: Webhook, color: T.info, types: [
    { id: 'webhook_post', name: 'Webhook / API', desc: 'GET/POST/PUT/PATCH with mappings (hidden)', icon: Webhook },
    { id: 'leadbyte', name: 'LeadByte', desc: 'Post lead to LeadByte (hidden)', icon: Zap },
    { id: 'ringba', name: 'Ringba', desc: 'Send to Ringba (hidden)', icon: Phone },
    { id: 'meta_capi', name: 'Meta CAPI', desc: 'Conversions API event (hidden)', icon: Globe },
  ] },
  { key: 'verification', name: 'Verification', icon: ShieldCheck, color: T.success, types: [
    { id: 'phone_verify', name: 'HLR Mobile Verify', desc: 'Twilio HLR (hidden)', icon: Phone },
    { id: 'email_verify', name: 'Email Verify', desc: 'Email validation (hidden)', icon: Mail },
    { id: 'sms_otp', name: 'SMS OTP', desc: 'One-time code verification', icon: MessageCircle },
  ] },
  { key: 'transitions', name: 'Transition Pages', icon: Loader2, color: T.success, types: [
    { id: 'loading', name: 'Loading Screen', desc: 'Animated loading', icon: Loader2 },
    { id: 'eligibility_check', name: 'Eligibility Check', desc: 'Checking eligibility...', icon: ShieldCheck },
    { id: 'processing', name: 'Processing', desc: 'Processing your case...', icon: RotateCw },
  ] },
  { key: 'results', name: 'Results / Endpoints', icon: CheckCircle2, color: T.success, types: [
    { id: 'qualified_result', name: 'Qualified Result', desc: 'Success thank-you', icon: CheckCircle2 },
    { id: 'dq_result', name: 'DQ Result', desc: 'Disqualified thank-you', icon: AlertCircle },
    { id: 'call_now', name: 'Call Now Page', desc: 'Phone-only conversion', icon: Phone },
    { id: 'redirect', name: 'External Redirect', desc: 'Redirect to URL', icon: ExternalLink },
  ] },
  { key: 'custom', name: 'Custom Pages', icon: Code2, color: T.orange, types: [
    { id: 'custom_html', name: 'Custom HTML', desc: 'Raw HTML content', icon: Code2 },
    { id: 'tcpa', name: 'TCPA Page', desc: 'TCPA consent disclosure', icon: ShieldCheck },
    { id: 'video', name: 'Video Page', desc: 'Embedded video', icon: Video },
  ] },
]

export const NODE_TYPE_FOR_QTYPE = {
  button_grid: 'question', single_select: 'question', multi_select: 'question', dropdown: 'question',
  inline_dropdown: 'question', smart_date: 'question', text_input: 'question', textarea: 'question',
  number_input: 'question', info: 'question',
  lead_form: 'form', contact_form: 'form', address_form: 'form',
  decision: 'decision', tier_routing: 'decision', qualification_logic: 'decision',
  webhook_post: 'webhook', leadbyte: 'webhook', ringba: 'webhook', meta_capi: 'webhook',
  phone_verify: 'verification', email_verify: 'verification', sms_otp: 'verification',
  loading: 'transition', eligibility_check: 'transition', processing: 'transition',
  qualified_result: 'endpoint', dq_result: 'endpoint', call_now: 'endpoint', redirect: 'endpoint',
  custom_html: 'custom', tcpa: 'custom', video: 'custom',
}

export const findNodeTypeMeta = (qt) => {
  for (const cat of NODE_CATEGORIES) {
    const f = cat.types.find((t) => t.id === qt)
    if (f) return { ...f, categoryName: cat.name, categoryColor: cat.color }
  }
  return null
}

export const FIELD_TYPES = [
  { value: 'text', label: 'Text' }, { value: 'textarea', label: 'Textarea' }, { value: 'number', label: 'Number' },
  { value: 'email', label: 'Email' }, { value: 'tel', label: 'Mobile / Phone' }, { value: 'dropdown', label: 'Dropdown' },
  { value: 'smart_date', label: 'Smart Date' }, { value: 'us_zipcode', label: 'US ZIP Code' },
]

export const OPERATORS = [
  { value: 'eq', label: '=' }, { value: 'neq', label: 'not equal' }, { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' }, { value: 'gt', label: '>' }, { value: 'lt', label: '<' },
  { value: 'is_empty', label: 'is empty' }, { value: 'is_not_empty', label: 'is not empty' },
]

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

export const RENDER_MODES = [
  { id: 'embed', label: 'Embed', desc: 'Just the quiz card, drops into any landing page' },
  { id: 'standalone', label: 'Standalone Page', desc: 'Full page with header, body sections, footer' },
]

export const PIXEL_PROVIDERS = [
  { id: 'metaCapi', label: 'Meta CAPI', icon: 'M', color: '#1877f2', fields: [['pixelId', 'Pixel ID'], ['accessToken', 'Access Token'], ['testEventCode', 'Test Event Code (optional)']] },
  { id: 'tiktokCapi', label: 'TikTok CAPI', icon: 'TT', color: '#fe2c55', fields: [['pixelId', 'Pixel ID'], ['accessToken', 'Access Token'], ['testEventCode', 'Test Event Code (optional)']] },
  { id: 'snapCapi', label: 'Snapchat CAPI', icon: 'S', color: '#fffc00', fields: [['pixelId', 'Pixel ID'], ['accessToken', 'Access Token']] },
  { id: 'googleCapi', label: 'Google Ads Enhanced Conversions', icon: 'G', color: '#4285f4', fields: [['conversionId', 'Conversion ID'], ['conversionLabel', 'Conversion Label'], ['developerToken', 'Developer Token']] },
  { id: 'googleAds', label: 'Google Ads Pixel (gtag)', icon: 'GA', color: '#34a853', fields: [['conversionId', 'AW-XXX Conversion ID'], ['conversionLabel', 'Conversion Label']] },
  { id: 'gtm', label: 'Google Tag Manager', icon: 'GTM', color: '#1a73e8', fields: [['containerId', 'GTM-XXXXX Container ID']] },
  { id: 'ga4', label: 'Google Analytics 4', icon: 'G4', color: '#f9ab00', fields: [['measurementId', 'G-XXXXXXXX Measurement ID'], ['apiSecret', 'API Secret (for Measurement Protocol)']] },
]

export const REDIRECT_MODES = [
  { id: 'none', label: 'No redirect (default thank you)' },
  { id: 'button', label: 'Button linked to URL' },
  { id: 'immediate', label: 'Immediate redirect on enter' },
]

/**
 * The picker's list, taken from the template set rather than restated.
 *
 * It used to be six entries typed out here, which meant the list an operator
 * chose from and the templates that actually existed were two separate facts
 * that could disagree. Deriving it means adding a template makes it pickable,
 * and removing one makes it unpickable, with nothing to keep in step.
 */
export const QUIZ_TEMPLATES = SPEC_TEMPLATES.map((t) => ({
  id: t.id,
  name: t.name,
  desc: t.blurb,
  code: t.code,
  origin: t.origin,
  use: t.use,
}))
