import type { PieceType, Rotation } from '@/lib/schemas'
import { CELL_PIXELS } from './snapGrid'

/**
 * SVG glyph for a single track piece. Ports VibeRacer's `PieceGlyph`
 * (`../VibeRacer/src/components/TrackEditor.tsx:3292`) so VibeCity's
 * editor shows the actual gray road shape (straight, curve, sweep,
 * hairpin, mega sweep, arc45, diagonal, intersection) instead of just
 * a colored cell tile with connector dots.
 *
 * The component renders into the local cell box (origin at the piece
 * anchor's top-left, size `CELL_PIXELS x CELL_PIXELS`). Multi-cell
 * pieces (mega sweep, hairpin, arc45, diagonal) intentionally draw
 * paths that extend beyond the single-cell box; the SVG root in the
 * snap grid does not clip so the curve crosses cell boundaries
 * exactly as it does in VibeRacer.
 *
 * Callers wrap this in their own `<g transform="translate(cellX,
 * cellY)">` to place the glyph at the right cell. Rotation is baked
 * in via the inner `<g transform="rotate(deg cx cy)">` so the caller
 * does not need to compose a rotation transform.
 *
 * Colors and stroke widths mirror VibeRacer so the two editors look
 * the same. `roadWidth` is `CELL * 0.4` (the road body), `stroke` is
 * the centerline stripe at `strokeWidth=2` with a `4 4` dash.
 */
export const ROAD_COLOR = '#4a5a70'
export const STRIPE_COLOR = '#ffd36b'

const CELL = CELL_PIXELS
const ROAD_WIDTH = CELL * 0.4

export interface PieceGlyphProps {
  type: PieceType
  rotation: Rotation
  /**
   * Optional opacity for ghost / preview rendering. Defaults to 1.
   * The hover ghost passes a lower value so the preview reads as a
   * pending placement.
   */
  opacity?: number
}

export function PieceGlyph({ type, rotation, opacity = 1 }: PieceGlyphProps) {
  const cx = CELL / 2
  const cy = CELL / 2
  const roadWidth = ROAD_WIDTH
  const stroke = STRIPE_COLOR
  const road = ROAD_COLOR

  return (
    <g
      transform={`rotate(${rotation} ${cx} ${cy})`}
      opacity={opacity}
      pointerEvents="none"
    >
      {type === 'straight' ? (
        <>
          <rect
            x={cx - roadWidth / 2}
            y={0}
            width={roadWidth}
            height={CELL}
            fill={road}
          />
          <line
            x1={cx}
            y1={4}
            x2={cx}
            y2={CELL - 4}
            stroke={stroke}
            strokeWidth={2}
            strokeDasharray="4 4"
          />
        </>
      ) : null}
      {type === 'right90' ? (
        <>
          <path
            d={`M ${cx - roadWidth / 2} ${CELL}
                L ${cx - roadWidth / 2} ${cx + roadWidth / 2}
                A ${cx + roadWidth / 2} ${cx + roadWidth / 2} 0 0 0 ${CELL} ${cx - roadWidth / 2}
                L ${CELL} ${cx + roadWidth / 2}
                A ${cx - roadWidth / 2} ${cx - roadWidth / 2} 0 0 1 ${cx + roadWidth / 2} ${CELL}
                Z`}
            fill={road}
          />
          <path
            d={`M ${cx} ${CELL} A ${cx} ${cx} 0 0 0 ${CELL} ${cx}`}
            stroke={stroke}
            strokeWidth={2}
            strokeDasharray="4 4"
            fill="none"
          />
        </>
      ) : null}
      {type === 'left90' ? (
        <>
          <path
            d={`M ${cx + roadWidth / 2} ${CELL}
                L ${cx + roadWidth / 2} ${cx + roadWidth / 2}
                A ${cx + roadWidth / 2} ${cx + roadWidth / 2} 0 0 1 0 ${cx - roadWidth / 2}
                L 0 ${cx + roadWidth / 2}
                A ${cx - roadWidth / 2} ${cx - roadWidth / 2} 0 0 0 ${cx - roadWidth / 2} ${CELL}
                Z`}
            fill={road}
          />
          <path
            d={`M ${cx} ${CELL} A ${cx} ${cx} 0 0 1 0 ${cx}`}
            stroke={stroke}
            strokeWidth={2}
            strokeDasharray="4 4"
            fill="none"
          />
        </>
      ) : null}
      {type === 'scurve' || type === 'scurveLeft' ? (
        <g
          transform={
            type === 'scurveLeft'
              ? `translate(${2 * cx} 0) scale(-1 1)`
              : undefined
          }
        >
          <path
            d={`M ${cx - roadWidth / 2} ${CELL}
                L ${cx - roadWidth / 2} ${CELL * 0.78}
                C ${cx - roadWidth / 2} ${CELL * 0.6} ${cx + CELL * 0.32 - roadWidth / 2} ${CELL * 0.6} ${cx + CELL * 0.32 - roadWidth / 2} ${CELL * 0.42}
                C ${cx + CELL * 0.32 - roadWidth / 2} ${CELL * 0.24} ${cx - roadWidth / 2} ${CELL * 0.24} ${cx - roadWidth / 2} ${CELL * 0.06}
                L ${cx - roadWidth / 2} 0
                L ${cx + roadWidth / 2} 0
                L ${cx + roadWidth / 2} ${CELL * 0.06}
                C ${cx + roadWidth / 2} ${CELL * 0.24} ${cx + CELL * 0.32 + roadWidth / 2} ${CELL * 0.24} ${cx + CELL * 0.32 + roadWidth / 2} ${CELL * 0.42}
                C ${cx + CELL * 0.32 + roadWidth / 2} ${CELL * 0.6} ${cx + roadWidth / 2} ${CELL * 0.6} ${cx + roadWidth / 2} ${CELL * 0.78}
                L ${cx + roadWidth / 2} ${CELL}
                Z`}
            fill={road}
          />
          <path
            d={`M ${cx} ${CELL}
                L ${cx} ${CELL * 0.78}
                C ${cx} ${CELL * 0.6} ${cx + CELL * 0.32} ${CELL * 0.6} ${cx + CELL * 0.32} ${CELL * 0.42}
                C ${cx + CELL * 0.32} ${CELL * 0.24} ${cx} ${CELL * 0.24} ${cx} ${CELL * 0.06}
                L ${cx} 0`}
            stroke={stroke}
            strokeWidth={2}
            strokeDasharray="4 4"
            fill="none"
          />
        </g>
      ) : null}
      {type === 'sweepRight' || type === 'sweepLeft' ? (
        <g
          transform={
            type === 'sweepLeft'
              ? `translate(${2 * cx} 0) scale(-1 1)`
              : undefined
          }
        >
          <path
            d={`M ${cx} ${CELL}
                C ${cx} ${CELL * 0.2} ${CELL * 0.8} ${cy} ${CELL} ${cy}`}
            stroke={road}
            strokeWidth={roadWidth}
            strokeLinecap="butt"
            fill="none"
          />
          <path
            d={`M ${cx} ${CELL}
                C ${cx} ${CELL * 0.2} ${CELL * 0.8} ${cy} ${CELL} ${cy}`}
            stroke={stroke}
            strokeWidth={2}
            strokeDasharray="4 4"
            fill="none"
          />
        </g>
      ) : null}
      {type === 'megaSweepRight' || type === 'megaSweepLeft' ? (
        <g
          transform={
            type === 'megaSweepLeft'
              ? `translate(${2 * cx} 0) scale(-1 1)`
              : undefined
          }
        >
          <path
            d={`M ${cx} ${CELL}
                C ${cx} ${CELL * -0.12} ${CELL * -0.12} ${cy} ${CELL} ${cy}`}
            stroke={road}
            strokeWidth={roadWidth}
            strokeLinecap="butt"
            fill="none"
          />
          <path
            d={`M ${cx} ${CELL}
                C ${cx} ${CELL * -0.12} ${CELL * -0.12} ${cy} ${CELL} ${cy}`}
            stroke={stroke}
            strokeWidth={2}
            strokeDasharray="4 4"
            fill="none"
          />
        </g>
      ) : null}
      {type === 'hairpin' ? (
        <>
          <path
            d={`M 0 ${cy - CELL * 0.36}
                C ${CELL * 0.82} ${cy - CELL * 0.36} ${CELL * 0.82} ${cy + CELL * 0.36} 0 ${cy + CELL * 0.36}`}
            stroke={road}
            strokeWidth={roadWidth}
            strokeLinecap="butt"
            fill="none"
          />
          <path
            d={`M 0 ${cy - CELL * 0.36}
                C ${CELL * 0.82} ${cy - CELL * 0.36} ${CELL * 0.82} ${cy + CELL * 0.36} 0 ${cy + CELL * 0.36}`}
            stroke={stroke}
            strokeWidth={2}
            strokeDasharray="4 4"
            fill="none"
          />
        </>
      ) : null}
      {type === 'arc45' ? (
        <>
          <path
            d={`M ${cx} ${CELL}
                C ${cx} ${CELL * 0.45} ${CELL * 0.45} ${CELL * 0.08} ${CELL} 0`}
            stroke={road}
            strokeWidth={roadWidth}
            strokeLinecap="butt"
            fill="none"
          />
          <path
            d={`M ${cx} ${CELL}
                C ${cx} ${CELL * 0.45} ${CELL * 0.45} ${CELL * 0.08} ${CELL} 0`}
            stroke={stroke}
            strokeWidth={2}
            strokeDasharray="4 4"
            fill="none"
          />
        </>
      ) : null}
      {type === 'diagonal' ? (
        <>
          <path
            d={`M 0 ${CELL}
                C ${CELL * 0.35} ${CELL * 0.45} ${CELL * 0.65} ${CELL * 0.45} ${CELL} ${CELL}`}
            stroke={road}
            strokeWidth={roadWidth}
            strokeLinecap="butt"
            fill="none"
          />
          <path
            d={`M 0 ${CELL}
                C ${CELL * 0.35} ${CELL * 0.45} ${CELL * 0.65} ${CELL * 0.45} ${CELL} ${CELL}`}
            stroke={stroke}
            strokeWidth={2}
            strokeDasharray="4 4"
            fill="none"
          />
        </>
      ) : null}
      {type === 'intersection' ? (
        <>
          <rect
            x={cx - roadWidth / 2}
            y={0}
            width={roadWidth}
            height={CELL}
            fill={road}
          />
          <rect
            x={0}
            y={cy - roadWidth / 2}
            width={CELL}
            height={roadWidth}
            fill={road}
          />
          <line
            x1={cx}
            y1={4}
            x2={cx}
            y2={cy - roadWidth / 2}
            stroke={stroke}
            strokeWidth={2}
            strokeDasharray="4 4"
          />
          <line
            x1={cx}
            y1={cy + roadWidth / 2}
            x2={cx}
            y2={CELL - 4}
            stroke={stroke}
            strokeWidth={2}
            strokeDasharray="4 4"
          />
          <line
            x1={4}
            y1={cy}
            x2={cx - roadWidth / 2}
            y2={cy}
            stroke={stroke}
            strokeWidth={2}
            strokeDasharray="4 4"
          />
          <line
            x1={cx + roadWidth / 2}
            y1={cy}
            x2={CELL - 4}
            y2={cy}
            stroke={stroke}
            strokeWidth={2}
            strokeDasharray="4 4"
          />
        </>
      ) : null}
    </g>
  )
}
