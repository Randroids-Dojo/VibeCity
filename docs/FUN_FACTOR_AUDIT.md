# Fun Factor Gap Audit

> **Backlog generator.** Run this audit when `docs/GDD_COVERAGE.json` is ≥80% `done`. Re-run after every major system lands. This is the source of the P0 / P1 polish work that prevents the loop from terminating before the product is good. Each gap identified here becomes a `Q-NNN` open question or an `F-NNN` followup.
>
> This doc exists because the Flatline failure mode is: every coverage row is `done`, every test passes, every checkbox is green, but the product is not actually fun. Coverage rows say a *system* exists. They cannot say the system *delivers experience*. This audit asks the questions coverage cannot.

## How to run an audit

1. Set today's date as the audit header (`## Audit YYYY-MM-DD`).
2. Walk each prompt below. Write a one-sentence answer for each. Be honest. "Yes" answers do not generate work; gaps do.
3. For each gap, decide: is this a question (`Q-NNN`) or a followup (`F-NNN`)?
4. Add the entry. Reference the audit date in the entry's Context line.
5. Save the audit. Do not delete previous audits; let the file grow.

Append-only. Earlier audits are preserved.

## Prompts

### The first session

- Does the first 90 seconds make the player want to keep playing?
- What is the first specific moment that surprises a new user (positive or negative)?
- Where does a new user get stuck or confused?

### The core action

- Does the core action feel good at every skill level (novice, mid, expert)?
- Is there meaningful skill expression? Can two players visibly perform differently at the same task?
- Does the core action have texture (light cues, weight, follow-through), or does it feel binary?

### Variety

- Do the variations within the system feel distinct, or do they feel like recolors?
- If the player picks a "different" option (track / character / mode / layout), do they have a different experience?
- Is there a surprise still waiting for a player who has played for an hour?

### Difficulty arc

- Where is the difficulty too high (frustration without learning)?
- Where is the difficulty too low (boredom)?
- Is there a clear "I want to keep going to get better" pull?

### Stickiness

- What brings a player back the next day?
- What makes a player tell a friend about this?
- What is the smallest change that would meaningfully improve retention?

### Polish you have been postponing

- List up to five "we know this needs work" items you have been quietly avoiding. Be specific.
- For each, name the smallest slice that would meaningfully address it.

## Audit log

### Audit 2026-05-05 (first populated run)

Auditor: research-loop iteration on `research/20260505-fun-factor-and-asset-bumps`. Coverage at audit time: 60/69 done = 87% (past the 80% trigger). Method: code inspection of home page, editor client, drive scene, schema, and HUD modules; no live playtest this audit.

#### The first session

- Does the first 90 seconds make the player want to keep playing?
  Probably not. The home page (`src/app/page.tsx`) presents a brand header, a city count, a slug-text input, and a recent-cities list of plain text links. There is no preview thumbnail, no example city to drive, no animation. A first-time visitor sees a form. After typing a slug and creating, the editor opens to an empty SVG grid with palette tiles and an autosave indicator. The drive CTA is reachable but a brand-new slug has nothing to drive on. The 90-second arc is "type a name, see a grid, place a few brown squares, switch to drive mode, see a red box car on a brown street". No moment in there pulls the player forward.
- First specific moment of surprise (positive or negative)?
  Likely negative: "the cars are red boxes". Likely positive only later: "the build / drive flip is fast" (the curtain ships sub-200ms, REQ-055). The positive surprise is structural, not visual.
- Where does a new user get stuck or confused?
  No first-session hint. The editor's CTA copy mentions the Streets / Buildings category switch but does not prompt "click any cell to place your first piece". A new player with no prior city-builder vocabulary may not realize the palette tile must be selected before the cell click.

#### The core action

- Does the core action feel good at every skill level?
  Build feels okay (one-click placement). Drive feels approachable (off-street drag is soft, not a hard wall) but lacks chassis personality. Engine pitch ramps with speed (REQ-068) which is one cue. There is no suspension bob, no tire screech, no brake light, no skid mark. Mid and expert players see no skill ceiling in driving.
- Skill expression?
  Build: yes, route choice and piece selection visibly differ. Drive: no, two players driving the same city look identical because the kinematic integrator has no momentum-shift-on-curves vocabulary that rewards line choice.
- Texture (light cues, weight, follow-through)?
  Engine pitch (yes), HUD speed bar (yes), off-street drag (yes), respawn key (yes). Missing: tire screech audio, suspension visual response, brake light on the car, dust / particles on off-street.

#### Variety

- Variations distinct or recolors?
  13 piece types in `PieceTypeSchema`: straight, left90, right90, scurve, scurveLeft, sweepRight, sweepLeft, megaSweepRight, megaSweepLeft, hairpin, arc45, diagonal, intersection. arc45 and diagonal lack geometry (F-003, F-004). Mega sweep and hairpin render. The four building types (small-house, mid-house, shop, factory) differentiate by color only in the editor, by extruded box dimensions in the drive view per piece type. Pieces feel distinct; buildings feel like recolors.
- Different option, different experience?
  A city of straights vs a city of mega-sweeps does feel different to drive (the curve geometry changes the steer rhythm). A city of small-houses vs a city of factories looks different at the cell level but reads as box-color from inside the car.
- Surprise after an hour?
  No. Nothing is hidden. No unlock. No procedural / random element. The CityMood field exists but has no rendering layer.

#### Difficulty arc

- Where is the difficulty too high?
  Nowhere. The drive is forgiving (off-street is a soft drag, building cells are off-street with the same penalty per Q-005 default A). The respawn key (REQ-067) recovers from any wreck.
- Where is the difficulty too low?
  Everywhere. Pillar 3 and REQ-037 fence laps / checkpoints / time goals out of v1 by contract. The player has no challenge surface, so the "I want to keep going to get better" pull is structurally absent. This is a designed-in gap, not a bug. Per Q-009 a non-race "explore challenge" (collect N coins, visit every intersection, deliver from A to B) could exist without violating the race fence, but it is also out of scope under the current pillar 3.
- Clear "I want to keep going to get better" pull?
  No. The loop today is "build, drive a lap or two, fix the road that felt wrong, repeat". The build side carries the meaningful skill progression; the drive side is a feedback channel for the build, not its own skill surface.

#### Stickiness

- What brings a player back the next day?
  The slug is unique to them. They can return to `/<their-slug>` and see their city preserved. But the city does not change between visits. Nothing rewards a return.
- What makes a player tell a friend about this?
  The share URL is the city. REQ-053 polished the copy-share affordance. The friend lands on the drive view (per REQ-006) and can drive the city. The story-shaped pitch is "I built this city, drive around it". The pitch is weak when the city is brown squares with red box cars. The pitch is strong when the city has visual interest.
- Smallest change that meaningfully improves retention?
  Three candidates, ranked: (1) real car model (REQ-047 fidelity bump dot), (2) lit-window night ambience (lit-window dot), (3) ambient AI traffic (ambient-ai dot, blocked on Q-009 + centerline foundation). All are visible-from-inside-the-car within 30 seconds. None require schema changes.

#### Polish you have been postponing

1. **arc45 / diagonal still do not drive correctly.** Schema and palette landed; geometry / wheel contact is F-003 / F-004. Smallest slice: the sampled-centerline foundation dot, then the arc45-diagonal dot. Already in backlog.
2. **Placeholder primitive car.** REQ-047 anticipates the swap. Smallest slice: copy `car.glb` from VibeRacer + load via GLTFLoader. Already in backlog.
3. **Home page card has no visual.** Slug text only. Smallest slice: thumbnail SVG generated from the city's pieces (the editor SVG already exists; render server-side from the city payload). New gap, F-011.
4. **Editor has no first-session hint.** Tutorial overlay or first-cell pulse hint. New gap, F-012.
5. **Drive feel has no texture beyond engine pitch.** Tire screech on hard turns, suspension bob, brake light when braking, off-street dust. New gap, F-013.

#### Audit conclusions

The loop is structurally complete (build, drive, share, persist) but visually thin and skill-flat. The four ranked smallest changes are: (a) real car model, (b) lit-window night ambience, (c) home-card thumbnail, (d) drive-feel texture pass. Items (a) and (b) are already in the dot backlog from this iteration. Items (c) and (d) become F-011 and F-013. Item F-012 (editor onboarding hint) is the single highest-leverage tutorial slice.

The pillar 3 fence (no sim, no race) is doing its job: it kept the v1 scope tight. The flatline failure mode warning in `IMPLEMENTATION_PLAN.md` reads as the current state, every coverage row is done or partial, every test passes, but the product is not yet *fun*. The five smallest visible changes above are the path to closing that gap without breaking the fence.

### Audit 2026-05-03 (initial)

(populate when first run, after at least one full system has landed and coverage is non-trivial)

### Earlier audits

(append previous audits below this line as they age out, newest above oldest)