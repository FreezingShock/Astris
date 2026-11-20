/**
 * Every tunable number of the map, with the mockup's values.
 * Index 0 of the per-rank arrays is unused so that a rank (1 to 5) indexes directly.
 */
export const CONFIG = {
  /** Star sprite half-size per rank, in map units. */
  size: [0, 15, 11.5, 9, 6.2, 5.4],
  /** Star brightness per rank. */
  starAlpha: [0, 1, 0.96, 0.86, 0.72, 0.6],
  /** Thread brightness per rank. */
  threadAlpha: [0, 0.5, 0.36, 0.28, 0.15, 0.11],
  /** Inner and outer distance from the centre per rank. */
  band: [
    [0, 0],
    [72, 112],
    [112, 184],
    [184, 228],
    [228, 330],
    [330, 368],
  ],
  /** The outer edge of a constellation. */
  rMax: 368,
  /** Extra angle per unit of distance, which gives the wedges their spiral. */
  spiral: 0.0021,
  /** Stars closer than this connect straight to the centre. */
  centreThreadRadius: 128,
  /** A thread longer than this falls back to the centre. */
  maxThread: 150,
  /** How far a thread bows sideways, as a share of its length. */
  threadBend: 0.14,

  /** Bloom: the ring of light and the stars that appear behind it. */
  bloomRingMs: 1150,
  bloomSpreadMs: 1050,
  bloomLeadMs: 120,
  starPopMs: 420,
  threadDrawMs: 340,
  centrePopMs: 520,

  /** Travel and memories. */
  memoryDim: 0.3,
  memoryScale: 0.46,
  olderMemoryScale: 0.86,
  olderMemoryDim: 0.55,
  memoryDistance: 610,
  memoryMoveMs: 1150,
  maxMemories: 3,
  dissolveMs: 430,
  dissolveSpreadMs: 460,
  dissolveReach: 520,
  dissolveDrift: 34,
  trailLength: 14,

  /** Points of light running inward along threads. */
  pulses: 12,
  pulseMs: 1500,

  /** Titles. */
  maxLabels: 46,
  fontCentre: "600 21px 'Linux Libertine', Georgia, serif",
  fontMemory: "400 14px 'Linux Libertine', Georgia, serif",
  fontStrong: "14px 'Linux Libertine', Georgia, serif",
  fontSoft: "11.5px -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",

  /** Camera. */
  cameraEase: 0.0052,
  zoomMin: 0.3,
  zoomMax: 3.2,
  fitMin: 0.45,
  fitMax: 1.25,
  wideScreen: 900,
  panelWidth: 350,
  panelOffset: 168,
  zoomStep: 1.4,
  wheelSpeed: 0.0015,
  maxPixelRatio: 2,

  /** Input. */
  pickRadius: 15,
  memoryPickRadius: 24,
  clickSlop: 5,
} as const;
