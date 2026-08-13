/**
 * The quiz flow graph validator.
 *
 * One import for the two halves: `paths` walks a quiz the way the public
 * runtime walks it and produces the path-to-outcome table, `validate` turns
 * that walk into ten separately-reportable checks.
 *
 * Both are pure - no database, no network, no clock - so a server action, the
 * builder, a publish preflight and a test script can all use them and get the
 * same answer.
 */

export {
  AUTO_ANSWER_ID,
  CONDITION_OPERATORS,
  MAX_DEPTH,
  MAX_PATHS,
  NON_VISITOR_NODE_TYPES,
  advanceFrom,
  buildPathTable,
  buildStateGraph,
  destinationFor,
  enumeratePaths,
  evaluateCondition,
  isAutoAdvanceNode,
  isKnownOperator,
  readRedirect,
  replayAnswerIds,
  situationAt,
  stateKeyOf,
  successorStates,
  type AdvanceResult,
  type EnumerationOptions,
  type FlowState,
  type FlowValues,
  type NodeSituation,
  type PathDestination,
  type PathEnumeration,
  type PathPresentation,
  type PathRow,
  type PathTable,
  type PathTableRow,
  type ReplayResult,
  type StateGraph,
  type StateGraphNode,
  type StateSuccessors,
  type TerminalKind,
} from './paths'

export {
  CHECK_IDS,
  getCheck,
  hasIssue,
  issueCodes,
  validateQuizFlow,
  type CheckId,
  type CheckResult,
  type FlowIssue,
  type FlowValidation,
  type ValidateOptions,
} from './validate'
