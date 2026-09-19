export const refuseDeploymentCopyOverride = (): { ok: false; error: string } => ({
  ok: false,
  error: 'Deployment-specific public copy is not allowed. Edit or clone the master asset instead.',
})

export const masterHasDeploymentsMessage = (kind: string, count: number, labels: string[]): string => {
  const list = labels.length ? ` (${labels.join(', ')})` : ''
  return `This ${kind} cannot be deleted: ${count} deployment${count === 1 ? '' : 's'} still reference it${list}. Archive it or remove the deployments first.`
}
