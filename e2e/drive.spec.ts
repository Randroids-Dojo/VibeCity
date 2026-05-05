import { expect, test } from '@playwright/test'
import { RACE_HUD_FORBIDDEN_TESTIDS } from '../src/app/[slug]/driveAntiFeatures'

/**
 * REQ-006 + REQ-044 + REQ-045 + REQ-046 + REQ-053: drive view
 * scaffold.
 *
 * Verifies the drive route at `/<slug>` mounts the three.js canvas,
 * renders the Edit CTA back to `/<slug>/edit`, and shows the
 * empty-state prompt for a slug with no saved city. The Playwright
 * webServer runs `next start` without KV configured, so `loadCity`
 * falls back to the empty city for any slug; we use that fallback to
 * cover the empty-state branch without needing a seeded KV instance.
 */
test('drive route mounts the canvas with the slug label and Edit CTA', async ({
  page,
}) => {
  const response = await page.goto('/drive-scaffold-spec')
  expect(response?.status()).toBe(200)

  const root = page.getByTestId('drive-scene-root')
  await expect(root).toBeVisible()
  await expect(root).toHaveAttribute('data-slug', 'drive-scaffold-spec')

  const canvas = page.getByTestId('drive-scene-canvas')
  await expect(canvas).toBeVisible()

  // The slug label is visible in the top-left overlay.
  await expect(page.getByTestId('drive-scene-slug')).toHaveText(
    'drive-scaffold-spec',
  )

  // Edit CTA points back at the editor route.
  const editCta = page.getByTestId('drive-edit-cta')
  await expect(editCta).toBeVisible()
  await expect(editCta).toHaveAttribute('href', '/drive-scaffold-spec/edit')
  await expect(editCta).toHaveAttribute('data-slug', 'drive-scaffold-spec')
  await expect(editCta).toHaveText('Edit')

  // REQ-036: spawn anchor data attributes are present on the root. The
  // playwright webServer runs without KV, so loadCity falls back to the
  // empty city; the anchor reads as the grid origin.
  await expect(root).toHaveAttribute('data-spawn-row', '0')
  await expect(root).toHaveAttribute('data-spawn-col', '0')

  // REQ-047: placeholder car renders only when at least one piece is
  // placed. The webServer is unconfigured KV, so the city is empty and
  // the vehicle flag is false; the unit tests cover the populated case.
  await expect(root).toHaveAttribute('data-vehicle', 'false')

  // REQ-034: keyboard controls install only when a car is mounted; an
  // empty city keeps the listeners dormant so an author cannot
  // accidentally trigger driving with no vehicle on screen.
  await expect(root).toHaveAttribute('data-controls-active', 'false')

  // REQ-033: chase camera engages only when a car is mounted; an empty
  // city stays in the orbit framing so the empty-state prompt reads
  // against a neutral backdrop centered on the grid origin.
  await expect(root).toHaveAttribute('data-camera-mode', 'orbit')

  // REQ-039: pause state defaults to running on every page load. Esc
  // toggles the menu, but with no car mounted the listener is dormant
  // and the overlay must not render even after pressing Esc.
  await expect(root).toHaveAttribute('data-pause-state', 'running')

  // REQ-030: building collision penalty flag defaults to false. With no
  // car mounted the per-frame integration loop is dormant so the flag
  // never flips. Unit tests cover the populated case.
  await expect(root).toHaveAttribute('data-on-building', 'false')

  // REQ-054: off-street penalty flag defaults to false. With no car
  // mounted the per-frame integration loop is dormant so the flag
  // never flips. Unit tests cover the populated case.
  await expect(root).toHaveAttribute('data-off-street', 'false')

  // REQ-032 / REQ-065: closest-piece readout defaults to 'none' with
  // empty index / type / segment / wheel attributes. With no car mounted
  // the per-frame resolver never fires; unit tests cover the populated
  // closestStreetPiece pick and the per-wheel substrate walk.
  await expect(root).toHaveAttribute('data-closest-piece', 'none')
  await expect(root).toHaveAttribute('data-closest-piece-index', '')
  await expect(root).toHaveAttribute('data-closest-piece-type', '')
  await expect(root).toHaveAttribute('data-closest-piece-segment', '')
  await expect(root).toHaveAttribute('data-closest-piece-wheel', '')

  // REQ-066: drive HUD overlays render only when a car is mounted. The
  // playwright webServer is unconfigured KV so the city is empty and
  // the HUD is hidden. The fallback data attributes still ride on the
  // root so the contract is observable.
  await expect(root).toHaveAttribute('data-hud-visible', 'false')
  await expect(root).toHaveAttribute('data-hud-speed', '0')
  await expect(root).toHaveAttribute('data-hud-direction', 'idle')
  // REQ-030 / REQ-054: HUD surface label defaults to street when no
  // penalty is engaged. With no car mounted the per-frame mirror does
  // not run; the JSX default is the contract observable to a test.
  await expect(root).toHaveAttribute('data-hud-surface', 'street')
  // REQ-019 / REQ-064 / REQ-066: city validity defaults to closed because
  // the playwright webServer runs without KV so loadCity returns the
  // empty city and `validateConnections` returns the empty list. The
  // unmatched-port count is 0; the HUD city-validity span only mounts
  // when the count is non-zero so it stays absent here.
  await expect(root).toHaveAttribute('data-city-validity', 'closed')
  await expect(root).toHaveAttribute('data-unmatched-port-count', '0')
  await expect(page.getByTestId('drive-hud-city-validity')).toHaveCount(0)
  await expect(page.getByTestId('drive-hud-speed')).toHaveCount(0)
  await expect(page.getByTestId('drive-hud-surface')).toHaveCount(0)
  // REQ-066: drive HUD direction span lives inside the speed HUD wrapper
  // so the listener gate that mounts the car also gates this span. With
  // no car mounted the speed HUD is hidden so the direction readout is
  // absent; the unit tests cover the populated label map.
  await expect(page.getByTestId('drive-hud-direction')).toHaveCount(0)
  await expect(page.getByTestId('drive-hud-controls')).toHaveCount(0)

  // REQ-067: respawn key listener installs only when a car is mounted.
  // An empty grid keeps the listener dormant; the unit tests cover the
  // pure helper and the populated runtime is exercised via the HUD
  // controls hint when a car mounts (see the `R: respawn` line below).

  // REQ-068: engine audio rig is built lazily on the first user gesture
  // inside the integration effect. The empty grid keeps the listener
  // gate closed so the rig is never constructed; the data attributes
  // still ride on the root so the contract is observable. The mute
  // toggle button only renders when a car is mounted.
  await expect(root).toHaveAttribute('data-engine-audio-muted', 'false')
  await expect(root).toHaveAttribute('data-engine-audio-started', 'false')
  await expect(page.getByTestId('drive-engine-mute-toggle')).toHaveCount(0)

  // REQ-006, REQ-053: share-copy button mounts next to the slug pill
  // and stays at the idle status before any click. The button is
  // always visible (regardless of whether a car is mounted) because
  // the share link is the drive URL itself; an empty grid is still
  // shareable.
  await expect(root).toHaveAttribute('data-share-copy-status', 'idle')
  const shareCopyOnScaffold = page.getByTestId('drive-share-copy')
  await expect(shareCopyOnScaffold).toBeVisible()
  await expect(shareCopyOnScaffold).toHaveAttribute(
    'data-share-status',
    'idle',
  )

  // REQ-069: minimap renders only when a car is mounted and the pause
  // menu is closed. The playwright webServer runs without KV so the
  // city is empty; the minimap stays hidden and the data attributes
  // mirror the dormant state.
  await expect(root).toHaveAttribute('data-minimap-visible', 'false')
  await expect(root).toHaveAttribute('data-minimap-piece-count', '0')
  await expect(root).toHaveAttribute('data-minimap-building-count', '0')
  await expect(page.getByTestId('drive-minimap')).toHaveCount(0)

  // REQ-040: camera tuning settings pane defaults to the persisted
  // defaults on first mount; the data attributes mirror the live tuning
  // so a test can assert the persistence layer wired through. The panel
  // itself only renders inside the pause menu (REQ-039); without a car
  // mounted the menu cannot open and the panel stays absent.
  await expect(root).toHaveAttribute('data-camera-fov', '60')
  await expect(root).toHaveAttribute('data-camera-height', '6.4')
  await expect(root).toHaveAttribute('data-camera-distance', '14')
  await expect(root).toHaveAttribute('data-camera-look-ahead', '6')
  await expect(root).toHaveAttribute('data-camera-follow-speed', '0.12')
  await expect(page.getByTestId('drive-camera-settings')).toHaveCount(0)

  // REQ-042: touch mode picker defaults to dual-stick on first mount;
  // the data attribute mirrors the live mode so a test can assert the
  // persistence layer wired through. The panel itself only renders
  // inside the pause menu (REQ-039); without a car mounted the menu
  // cannot open and the panel stays absent.
  await expect(root).toHaveAttribute('data-touch-mode', 'dual-stick')
  await expect(page.getByTestId('drive-touch-settings')).toHaveCount(0)

  // REQ-035: touch input runtime reports both joysticks as inactive on
  // a fresh load. The pointer event listeners install only when a car
  // is mounted, so the empty-grid drive scene never flips these flags;
  // the data-attribute mirror is observable so a future seeded-city
  // playwright fixture (F-008) can assert the active branch end-to-end.
  await expect(root).toHaveAttribute('data-touch-steer-active', 'false')
  await expect(root).toHaveAttribute('data-touch-throttle-active', 'false')
  await expect(page.getByTestId('drive-touch-steer-ring')).toHaveCount(0)
  await expect(page.getByTestId('drive-touch-throttle-ring')).toHaveCount(0)

  // REQ-041: keyboard rebinding panel mirrors the live bindings via the
  // `data-key-bindings` attribute on the scene root. The panel itself
  // only renders inside the pause menu (REQ-039); without a car mounted
  // the menu cannot open and the panel stays absent. The default
  // signature is the WASD plus arrow keys map sorted alphabetically by
  // KeyboardEvent.code.
  await expect(root).toHaveAttribute(
    'data-key-bindings',
    'ArrowDown:brake,ArrowLeft:steerLeft,ArrowRight:steerRight,ArrowUp:throttle,KeyA:steerLeft,KeyD:steerRight,KeyS:brake,KeyW:throttle',
  )
  await expect(page.getByTestId('drive-keyboard-settings')).toHaveCount(0)

  // REQ-037: drive mode is a city-builder loop, not a racing game. The
  // anti-feature lockdown asserts that no lap timer, checkpoint banner,
  // race timer, or other race-HUD element ever ships on the drive
  // surface. The forbidden testid list lives in driveAntiFeatures.ts
  // so the unit tests and the e2e suite share the same vocabulary.
  for (const testid of RACE_HUD_FORBIDDEN_TESTIDS) {
    await expect(page.getByTestId(testid)).toHaveCount(0)
  }

  // REQ-055: the build / drive transition curtain mounts as a hidden
  // descendant of the drive Edit CTA. With no navigation in flight,
  // useLinkStatus().pending is false so the curtain renders nothing.
  await expect(
    page.getByTestId('scene-transition-curtain-edit'),
  ).toHaveCount(0)
})

test('drive route shows the empty-state prompt for a fresh slug (REQ-053)', async ({
  page,
}) => {
  const response = await page.goto('/drive-empty-spec')
  expect(response?.status()).toBe(200)

  const root = page.getByTestId('drive-scene-root')
  await expect(root).toHaveAttribute('data-empty', 'true')
  await expect(root).toHaveAttribute('data-piece-count', '0')
  await expect(root).toHaveAttribute('data-building-count', '0')
  // REQ-036: spawn anchor falls back to grid origin when no pieces.
  await expect(root).toHaveAttribute('data-spawn-row', '0')
  await expect(root).toHaveAttribute('data-spawn-col', '0')
  // REQ-047: placeholder car is omitted on the empty grid.
  await expect(root).toHaveAttribute('data-vehicle', 'false')
  // REQ-034: keyboard controls stay dormant on the empty grid.
  await expect(root).toHaveAttribute('data-controls-active', 'false')
  // REQ-033: chase camera stays out of the empty grid; the orbit aim
  // keeps the empty-state prompt centered against a neutral backdrop.
  await expect(root).toHaveAttribute('data-camera-mode', 'orbit')
  // REQ-039: pause state defaults to running; the listener is gated to
  // the car-mounted branch so an empty grid cannot toggle the menu.
  await expect(root).toHaveAttribute('data-pause-state', 'running')
  // REQ-030: building collision flag stays false on the empty grid;
  // there is no car to land on a building cell.
  await expect(root).toHaveAttribute('data-on-building', 'false')
  // REQ-054: off-street flag stays false on the empty grid; the
  // listener gate that mounts the car also gates the per-frame check
  // so the flag never flips on an empty grid.
  await expect(root).toHaveAttribute('data-off-street', 'false')
  // REQ-032 / REQ-065: closest-piece resolver does not fire on the
  // empty grid (no car to walk wheels through). The default `none` flag
  // and empty mirror attributes ride on the root so a future debug HUD
  // or per-piece-type tuning has the contract to read.
  await expect(root).toHaveAttribute('data-closest-piece', 'none')
  await expect(root).toHaveAttribute('data-closest-piece-index', '')
  await expect(root).toHaveAttribute('data-closest-piece-type', '')
  await expect(root).toHaveAttribute('data-closest-piece-segment', '')
  await expect(root).toHaveAttribute('data-closest-piece-wheel', '')
  // REQ-066: drive HUD stays hidden on the empty grid; the listener
  // gate that mounts the car also gates the HUD overlays so an author
  // cannot see a speed readout for a car that is not on screen.
  await expect(root).toHaveAttribute('data-hud-visible', 'false')
  // REQ-030 / REQ-054: HUD surface label stays at the street default on
  // an empty grid; the listener gate that mounts the car also gates the
  // per-frame mirror so the attribute never flips on an empty grid.
  await expect(root).toHaveAttribute('data-hud-surface', 'street')
  // REQ-019 / REQ-064 / REQ-066: city validity defaults to closed on the
  // empty grid because `validateConnections` of an empty piece list
  // returns the empty array. The HUD city-validity span only mounts
  // when the count is non-zero so it stays absent here.
  await expect(root).toHaveAttribute('data-city-validity', 'closed')
  await expect(root).toHaveAttribute('data-unmatched-port-count', '0')
  await expect(page.getByTestId('drive-hud-city-validity')).toHaveCount(0)
  await expect(page.getByTestId('drive-hud-speed')).toHaveCount(0)
  await expect(page.getByTestId('drive-hud-surface')).toHaveCount(0)
  // REQ-066: same direction-span gate as the scaffold spec; the empty
  // state branch hides the speed HUD wrapper so the direction readout
  // is absent. Unit tests cover the populated label map.
  await expect(page.getByTestId('drive-hud-direction')).toHaveCount(0)
  await expect(page.getByTestId('drive-hud-controls')).toHaveCount(0)
  // REQ-067: pressing R on the empty grid does not mount a car or fire
  // the respawn handler; the listener is gated on the car being mounted
  // so a stray R in the empty-state branch is a no-op.
  await page.keyboard.press('KeyR')
  await expect(root).toHaveAttribute('data-vehicle', 'false')

  // REQ-068: pressing M on the empty grid does not toggle the engine
  // mute or build the audio rig; the listener is gated on the car being
  // mounted so a stray M in the empty-state branch is a no-op. The
  // mute toggle button is also absent so a player cannot click to
  // toggle a rig that does not exist yet.
  await page.keyboard.press('KeyM')
  await expect(root).toHaveAttribute('data-engine-audio-muted', 'false')
  await expect(root).toHaveAttribute('data-engine-audio-started', 'false')
  await expect(page.getByTestId('drive-engine-mute-toggle')).toHaveCount(0)

  // REQ-069: minimap stays hidden on the empty grid; the bounds are
  // null when the city has no footprint so the SVG layer never mounts.
  await expect(root).toHaveAttribute('data-minimap-visible', 'false')
  await expect(page.getByTestId('drive-minimap')).toHaveCount(0)

  // REQ-040: camera tuning data attributes ride on the root even on the
  // empty grid; the panel itself stays absent because the pause menu
  // listener is gated on the car-mounted branch.
  await expect(root).toHaveAttribute('data-camera-fov', '60')
  await expect(root).toHaveAttribute('data-camera-follow-speed', '0.12')
  await expect(page.getByTestId('drive-camera-settings')).toHaveCount(0)

  // REQ-042: touch mode data attribute rides on the root even on the
  // empty grid; the panel itself stays absent because the pause menu
  // listener is gated on the car-mounted branch.
  await expect(root).toHaveAttribute('data-touch-mode', 'dual-stick')
  await expect(page.getByTestId('drive-touch-settings')).toHaveCount(0)

  // REQ-035: touch input runtime stays dormant on the empty grid; the
  // pointer event listeners are gated on the car being mounted so a
  // stray tap on the empty-state branch does not start a steering
  // joystick. The data-attribute mirrors confirm the dormant state.
  await expect(root).toHaveAttribute('data-touch-steer-active', 'false')
  await expect(root).toHaveAttribute('data-touch-throttle-active', 'false')
  await expect(page.getByTestId('drive-touch-steer-ring')).toHaveCount(0)
  await expect(page.getByTestId('drive-touch-throttle-ring')).toHaveCount(0)

  // REQ-041: keyboard rebinding data attribute rides on the root even
  // on the empty grid; the panel itself stays absent because the pause
  // menu listener is gated on the car-mounted branch.
  await expect(root).toHaveAttribute(
    'data-key-bindings',
    'ArrowDown:brake,ArrowLeft:steerLeft,ArrowRight:steerRight,ArrowUp:throttle,KeyA:steerLeft,KeyD:steerRight,KeyS:brake,KeyW:throttle',
  )
  await expect(page.getByTestId('drive-keyboard-settings')).toHaveCount(0)

  // REQ-037: race-HUD anti-feature lockdown also applies on the empty
  // grid. The forbidden testids must not exist regardless of whether a
  // car is mounted because a future regression could ship a race
  // surface that renders before the car-mounted gate.
  for (const testid of RACE_HUD_FORBIDDEN_TESTIDS) {
    await expect(page.getByTestId(testid)).toHaveCount(0)
  }

  const prompt = page.getByTestId('drive-empty-prompt')
  await expect(prompt).toBeVisible()
  await expect(prompt).toContainText('Place a road first')

  // The Open editor link is the empty-state CTA back into the editor.
  const cta = page.getByTestId('drive-empty-create-cta')
  await expect(cta).toBeVisible()
  await expect(cta).toHaveAttribute('href', '/drive-empty-spec/edit')

  // The pause overlay must not render on the empty grid even if Esc is
  // pressed (the listener is gated on the car being mounted).
  await page.keyboard.press('Escape')
  await expect(root).toHaveAttribute('data-pause-state', 'running')
  await expect(page.getByTestId('drive-pause-menu')).toHaveCount(0)

  // Clicking the Open editor link routes to the editor.
  await cta.click()
  await page.waitForURL('**/drive-empty-spec/edit')
  expect(page.url()).toMatch(/\/drive-empty-spec\/edit$/)
})

test('drive HUD share-copy button copies the canonical drive URL (REQ-006, REQ-053)', async ({
  browser,
  baseURL,
}) => {
  // Grant clipboard read / write permissions so the playwright headless
  // browser does not refuse the navigator.clipboard.writeText call. The
  // permission has to be granted on a fresh context that targets the
  // page origin so the secure-context check passes against the dev
  // server's localhost origin.
  const context = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  try {
    const page = await context.newPage()
    const response = await page.goto('/share-copy-spec')
    expect(response?.status()).toBe(200)

    const root = page.getByTestId('drive-scene-root')
    await expect(root).toHaveAttribute(
      'data-share-copy-status',
      'idle',
    )

    const button = page.getByTestId('drive-share-copy')
    await expect(button).toBeVisible()
    await expect(button).toHaveAttribute('data-share-status', 'idle')
    await expect(button).toHaveText('Copy share URL')
    await expect(button).toHaveAttribute(
      'aria-label',
      'Copy share URL for share-copy-spec',
    )

    await button.click()

    await expect(button).toHaveText('Copied!')
    await expect(button).toHaveAttribute('data-share-status', 'copied')
    await expect(root).toHaveAttribute('data-share-copy-status', 'copied')
    await expect(button).toHaveAttribute(
      'aria-label',
      'Copied share URL for share-copy-spec',
    )

    // The clipboard now holds the canonical drive URL composed from the
    // page origin plus the slug. We read it back via the page's
    // navigator.clipboard so the assertion exercises the same surface
    // the click handler wrote to.
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
    const expectedOrigin = baseURL ?? page.url().replace(/\/share-copy-spec.*/, '')
    expect(clipboardText).toBe(`${expectedOrigin.replace(/\/$/, '')}/share-copy-spec`)

    // After SHARE_COPY_RESET_DELAY_MS (1600 ms) the button resets.
    await expect(button).toHaveText('Copy share URL', { timeout: 4000 })
    await expect(button).toHaveAttribute('data-share-status', 'idle')
    await expect(root).toHaveAttribute('data-share-copy-status', 'idle')
  } finally {
    await context.close()
  }
})
