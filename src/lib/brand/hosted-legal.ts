export const HOSTED_PRIVACY_PATH = '/privacy'
export const HOSTED_TERMS_PATH = '/terms'

export const hostedLegalUrls = (): { privacy_url: string; terms_url: string } => ({
  privacy_url: HOSTED_PRIVACY_PATH,
  terms_url: HOSTED_TERMS_PATH,
})
