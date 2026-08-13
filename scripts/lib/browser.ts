/**
 * One way to get a Chromium, for every harness that drives a browser.
 *
 * Playwright resolves its browser by BUILD NUMBER, not by "a Chromium exists".
 * An image that ships build 1194 while the pinned `playwright` wants 1234 fails
 * with "Executable doesn't exist", which reads as a missing dependency and is
 * actually a version pin - so the fix people reach for is downloading a second
 * Chromium into an image that already has one.
 *
 * `LEGALOS_CHROMIUM_PATH` says "use this binary instead". Unset, this is exactly
 * `chromium.launch()` and the pinned build applies, which is what CI and a
 * developer machine should both do. Set, it is the escape hatch for an
 * environment that provisions its own browser.
 *
 * It is deliberately NOT a default guess at a path on disk: a harness that
 * silently launched whatever Chromium it found would make "which browser did
 * this run in" unanswerable from the output, and these suites exist to be
 * believed.
 */
import { chromium, type Browser, type LaunchOptions } from 'playwright'

export const chromiumExecutablePath = (): string | undefined => {
  const p = process.env.LEGALOS_CHROMIUM_PATH
  return p && p.trim() ? p.trim() : undefined
}

/** Launch Chromium, honouring `LEGALOS_CHROMIUM_PATH` when it is set. */
export const launchChromium = async (opts: LaunchOptions = {}): Promise<Browser> => {
  const executablePath = chromiumExecutablePath()
  return chromium.launch(executablePath ? { ...opts, executablePath } : opts)
}

/** One line for a harness to print, so a run says which browser produced it. */
export const browserProvenance = (): string =>
  chromiumExecutablePath()
    ? `chromium at ${chromiumExecutablePath()} (LEGALOS_CHROMIUM_PATH)`
    : 'chromium, playwright-managed build'
