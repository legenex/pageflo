/**
 * Which composition draws which `sq_*` template, as DATA.
 *
 * Separate from `registry.ts` so health checks do not import React components.
 * Every canonical `sq_*` id is claimed by a structural composition. The default
 * card remains only as a fallback for unknown ids.
 */
export const COMPOSITION_CLAIMS: Readonly<Record<string, readonly string[]>> = {
  authority_console: ['sq_authority_console'],
  case_file_console: ['sq_case_file_console'],
  direct_panel: ['sq_direct_panel'],
  editorial_inline: ['sq_editorial_inline'],
  evidence_checklist: ['sq_evidence_checklist'],
  fullscreen_focus: ['sq_fullscreen_focus'],
  recovery_soft: ['sq_recovery_soft'],
  case_dossier: ['sq_case_dossier'],
  quiz_first: ['sq_quiz_first'],
  deadline_timeline: ['sq_deadline_timeline'],
  insurer_context: ['sq_insurer_context'],
  sixty_second: ['sq_sixty_second'],
  answer_first: ['sq_answer_first'],
  case_router: ['sq_case_router'],
  network_vetting: ['sq_network_vetting'],
  guided_conversation: ['sq_guided_conversation'],
  incident_scene: ['sq_incident_scene'],
  timeline_journey: ['sq_timeline_journey'],
  card_deck: ['sq_card_deck'],
  decision_path: ['sq_decision_path'],
}

export const CLAIMED_TEMPLATE_IDS: readonly string[] =
  Object.values(COMPOSITION_CLAIMS).flatMap((ids) => [...ids])
