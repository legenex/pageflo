export const refuseDeploymentCopyOverride = (): { ok: false; error: string } => ({
  ok: false,
  error: 'Deployment-specific public copy is not allowed. Edit or clone the master asset instead.',
})

export const refuseDeploymentQuizLogic = (): { ok: false; error: string } => ({
  ok: false,
  error: 'Deployment cannot override quiz logic. Edit or clone the master quiz.',
})

export const deploymentCarriesQuizLogic = (dep: Record<string, unknown>): boolean =>
  dep.nodes != null ||
  dep.steps != null ||
  dep.tiers != null ||
  dep.customFields != null ||
  dep.custom_fields != null

export const masterHasDeploymentsMessage = (kind: string, count: number, labels: string[]): string => {
  const list = labels.length ? ` (${labels.join(', ')})` : ''
  return `This ${kind} cannot be deleted: ${count} deployment${count === 1 ? '' : 's'} still reference it${list}. Archive it or remove the deployments first.`
}
