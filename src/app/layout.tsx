import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'VibeCity',
  description: 'A fully vibed city builder you can actually drive around in.',
}

/**
 * Viewport meta (mobile sizing). Without an explicit `viewport`,
 * mobile browsers render the document at the default desktop width
 * (typically 980 CSS px) and scale it down, which breaks the editor's
 * touch targets and the drive HUD's sizing.
 *
 * `initialScale: 1` lines up CSS px with device-independent px so a
 * 24px button reads as a 24px button. We deliberately do NOT set
 * `maximumScale` or `userScalable: false`: a player who wants to
 * pinch-zoom into the editor grid or HUD should be able to.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
