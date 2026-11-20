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

  /** New stars fly out from their parent along their thread over this long, and land at `born`. */
  flyMs: 420,
  /** Making room: stars about to be cleared sink to this brightness over roomMs; then they dissolve over clearMs. */
  roomMs: 700,
  roomAlpha: 0.45,
  clearMs: 650,
  clearDelayMs: 220,
  clearDrift: 46,
  /** Particles. */
  maxParticles: 260,
  trailCount: 22,
  trailSpanMs: 520,
  trailLifeMs: 900,
  trailSize: 9,
  burstCount: 30,
  burstSpeed: 0.2,
  burstLifeMs: 900,
  burstSize: 8,
  dustCount: 70,
  dustLifeMs: 1000,
  dustSize: 6,
  /** The chosen star while it loads: a halo that grows and breathes, and sparks circling it. */
  haloSize: 62,
  haloBreathe: 0.004,
  orbitCount: 5,
  orbitRadius: 30,
  orbitSpeed: 0.0042,
  orbitSize: 7,
  /** On arrival the centre star swells by this much and settles back over centreBoostMs. */
  centreBoost: 0.55,
  centreBoostMs: 520,
  /** The camera leans in by this factor while a star loads, then settles to the fitted zoom. */
  pushIn: 1.07,

  /** Bloom: the ring of light and the stars that appear behind it. */
  bloomRingMs: 1150,
  bloomSpreadMs: 1050,
  bloomLeadMs: 120,
  /** Extra per-star delay, spread by the title's hash so that a band does not land all at once. */
  bloomJitterMs: 110,
  starPopMs: 420,
  threadDrawMs: 340,
  centrePopMs: 520,
  /** The ring: a thin bright line with a wide faint halo just inside it. */
  ringAlpha: 0.55,
  ringWidth: 2,
  ringHaloAlpha: 0.07,
  ringHaloWidth: 22,

  /** Stars. Sizes follow the square root of the zoom, clamped to this range. */
  zoomSizeMin: 0.55,
  zoomSizeMax: 2.2,
  /** Sprite half-size as a multiple of the star's size, and the white core's share of it. */
  glowScale: 2.1,
  coreScale: 0.5,
  /** Ranks up to this one get the white core. */
  coreRank: 1,
  twinkleSpeed: 0.0022,
  twinkleAmount: 0.16,
  /** Slowest twinkle, and how much faster a star's hash can make it. */
  twinkleRateMin: 0.6,
  twinkleRateSpread: 0.9,
  /** Stars this far outside the view are skipped. */
  cullMargin: 30,
  /** Below these brightnesses a constellation, a thread group or a dissolving star is not drawn. */
  dimCutoff: 0.015,
  threadCutoff: 0.008,
  dissolveCutoff: 0.01,

  /** The centre star: half-size on the map and on the main page, and its slow breathing. */
  centreSize: 30,
  centreSizeMini: 20,
  centreGrowFrom: 0.35,
  centreBreatheSpeed: 0.0016,
  centreBreatheAmount: 0.05,

  /** Travel and memories. */
  memoryDim: 0.3,
  memoryScale: 0.46,
  olderMemoryScale: 0.86,
  olderMemoryDim: 0.55,
  memoryDistance: 610,
  memoryMoveMs: 1150,
  maxMemories: 3,
  /** The map grows: a new constellation is laid out at this share of full size, so that clusters pack close. */
  childScale: 0.78,
  /** A new constellation clears this share of its own reach of older stars. */
  clearShare: 1,
  /** The least distance between two stars of the map. */
  starGap: 15,
  /** Past this many stars the oldest outer stars are dropped, outermost first. */
  maxWorldStars: 2600,
  /** A visited centre is drawn at this share of the live centre's size. */
  visitedCentreScale: 0.55,
  /** Below this zoom the faint outer threads are not drawn. */
  lodThreadZoom: 0.5,
  /** Adaptive detail: the time between frames, smoothed, above which detail drops and below which it may return. */
  lodSlowMs: 22,
  lodFastMs: 18,
  /** Frames of steady speed before detail is raised again. */
  lodCalm: 150,
  /** Frames between two changes of detail, and the highest level. */
  lodHold: 24,
  lodMax: 3,
  /** Past the highest level the canvas is drawn at a lower pixel ratio, by this step each time, down to this share. */
  shrinkStep: 0.75,
  shrinkMin: 0.5,
  /** Panning and zooming never draw above this detail level of the quiet map, so that they stay smooth. */
  lodMoving: 1,
  /** Glow of rank 4 and 5 stars at detail levels 2 and 3. */
  lodGlow: 0.55,
  /** How fast a pan keeps gliding after the pointer lets go, and how soon it stops. */
  glideDecay: 0.006,
  glideMin: 0.00002,
  /** A new centre keeps the reader's zoom when it is within this range of the fitted zoom. */
  keepZoomLow: 0.7,
  keepZoomHigh: 1.5,
  /** Threads from rank-4 and rank-5 stars that were already on the map are not drawn. */
  dupThreadMaxRank: 3,
  dissolveMs: 430,
  dissolveSpreadMs: 460,
  dissolveReach: 520,
  dissolveDrift: 34,
  /** A dissolving star shrinks by this share as it goes. */
  dissolveShrink: 0.5,
  /** A memory keeps its stars up to this rank. The rest dissolve. */
  memoryKeepRank: 2,
  /** How long a memory's outer threads take to fade. */
  memoryThreadFadeMs: 420,
  /** A memory's centre star is this much brighter than its other stars. */
  memoryCentreBoost: 0.25,
  /** A constellation that was dropped is removed once it is this faint. */
  goneCutoff: 0.02,
  trailLength: 14,
  /** The dotted trail between memories. */
  trailWidth: 1.5,
  trailDash: [2, 7],
  trailAlphaMax: 0.55,
  trailAlphaBoost: 0.2,

  /** Points of light running inward along threads. */
  pulses: 12,
  pulseMs: 1500,
  /** Delay between the first pulses, and the longest wait before one sets off again. */
  pulseStaggerMs: 240,
  pulseRestMs: 900,
  /** Pulses start from one of this many stars nearest the centre. */
  pulsePool: 90,
  pulseSize: 5,
  pulseAlpha: 0.9,

  /** Titles. */
  maxLabels: 46,
  fontCentre: "600 21px 'Linux Libertine', Georgia, serif",
  fontMemory: "400 14px 'Linux Libertine', Georgia, serif",
  fontStrong: "14px 'Linux Libertine', Georgia, serif",
  fontSoft: "11.5px -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  fontMini: '600 15px Georgia, serif',
  titleFadeMs: 500,
  /** Distance below the centre star of the live title, a memory's title and the main page's title. */
  titleOffset: 46,
  memoryTitleOffset: 26,
  miniTitleOffset: 34,
  memoryTitleAlphaMax: 0.9,
  memoryTitleAlphaBoost: 0.35,
  /** The space a centre title reserves: padding each side, rise above the baseline, and height. */
  titleBoxPad: 4,
  titleBoxRise: 18,
  titleBoxHeight: 24,
  /** A star gets its title once it has grown this far. */
  labelMinGrow: 0.9,
  /** Ranks up to this one use the strong font. */
  labelStrongRank: 2,
  /** Ranks above labelFarRank are titled only at this zoom or closer. */
  labelFarRank: 3,
  labelFarZoom: 1.15,
  /** Where a title sits beside its star, and the box it reserves. */
  labelOffset: 0.9,
  labelGap: 5,
  labelRise: 8,
  labelBaseline: 4,
  labelHeight: 15,
  labelSpacing: 4,
  labelEdge: 6,

  /** Camera. */
  cameraEase: 0.0052,
  /** The longest step one frame may take, so that a stalled tab does not jump. */
  maxFrameMs: 64,
  /** A new map starts this much zoomed out and eases in. */
  resetZoom: 0.82,
  zoomMin: 0.3,
  zoomMax: 3.2,
  fitMin: 0.45,
  fitMax: 1.25,
  /** Fit: the map units that must fit, and the room left for the bars around the map. */
  fitSpan: 800,
  fitMarginX: 60,
  fitMarginY: 150,
  wideScreen: 900,
  panelWidth: 350,
  panelOffset: 168,
  zoomStep: 1.4,
  wheelSpeed: 0.0015,
  maxPixelRatio: 2,
  /** With reduced motion the loop stops once the camera and the memories are this close to rest. */
  settlePan: 0.05,
  settleZoom: 0.0005,
  settleDim: 0.01,
  /** Background stars: how far they follow the camera, and their brightness. */
  dustParallax: 0.12,
  dustAlpha: 0.9,
  dustTile: 512,

  /** The main page's small map. */
  miniDelayMs: 200,
  miniSpan: 760,
  miniAspect: 1.5,
  miniPulses: 5,

  /** Input. */
  pickRadius: 15,
  memoryPickRadius: 24,
  clickSlop: 5,
  /** A star can be picked, or carry the marker, once it has grown this far. */
  pickMinGrow: 0.5,
  hoverRingGap: 6,
  hoverRingAlpha: 0.8,
  /** A star highlighted from the keyboard is brought at least this far inside the view. */
  highlightMargin: 40,
  /** The dashed ring around the race target. */
  markerRadius: 13,
  markerPulse: 3,
  markerPulseSpeed: 0.005,
  markerWidth: 1.6,
  markerDash: [3, 3],
} as const;
