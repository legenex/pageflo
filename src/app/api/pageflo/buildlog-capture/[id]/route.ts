import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { readCaptureImage } from '@/lib/buildlog/captures'

/**
 * Serve one build-log screenshot, to signed-in users only.
 *
 * These are photographs of the admin taken while authenticated, so a capture of
 * the leads table contains real contact details. That is why they live outside
 * `public/` and come through here: the session check is the whole point of the
 * route, and moving these files into a statically-served directory would remove
 * it without any visible change to the page.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const { id } = await params
  const png = await readCaptureImage(id)
  // Same answer for an unsafe id, a missing file and a capture that was never
  // taken. Distinguishing them would let a signed-in user map the filesystem.
  if (!png) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return new NextResponse(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      // Private: a shared cache must not hold an authenticated screenshot.
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': `inline; filename="${id}.png"`,
    },
  })
}
