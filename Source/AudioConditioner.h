/**
 * @file AudioConditioner.h
 * @brief Turns one frame's raw AudioFeatures into the anti-flicker, slew-limited
 *        copy every shader/uniform/camera term downstream actually reads, plus
 *        the handful of "virtual director" signals (camera drift, rewind,
 *        letterbox, shockwave) that aren't part of AudioFeatures itself.
 */
#ifndef AUDIOCONDITIONER_H
#define AUDIOCONDITIONER_H

// Audio-Konditionierung, herausgelöst aus RenderPipeline::paint() (Refactor,
// 2026-08-19). Reiner Zustandsautomat: liest rohe AudioFeatures + Zeitdelta,
// schreibt eine integrierte/geslewte Kopie plus ein paar Regie-Signale, die
// keinen Platz in AudioFeatures haben (Kamera-Drift, Rewind, Letterbox,
// Shockwave). Rührt selbst keinen GL-Zustand an -- der einzige GL-Touch in
// der Nähe (Title-Reveal-Upload) blieb bewusst in RenderPipeline::paint(),
// weil er echt mit dem Wandzeit-Teil dort verzahnt ist.
//
// Bewusst Qt-frei (RendererCore-Baustein, wie GpuSims/PresentPass/
// SceneScheduler).

#include "AudioFeatures.h"

/**
 * @brief Owns every per-frame audio-conditioning state variable (envelopes,
 *        slews, integrated phases, the beat PLL, the virtual camera, and the
 *        "Zeit-Regie" dramaturgy signals) and produces the anti-flicker
 *        AudioFeatures copy the rest of the pipeline consumes.
 *
 * update() must be called exactly once per rendered frame, in frame order --
 * every signal here is an integrator or a slew limiter, so skipping or
 * reordering calls changes the accumulated state, not just this frame's
 * output. dt should already reflect freeze/pin/break-hold time scaling (the
 * caller's job); this class only ever integrates the dt it's given.
 */
class AudioConditioner
{
public:
	/**
	 * @brief Per-frame inputs this class needs but does not own the source of.
	 *
	 * Everything here is read-only from AudioConditioner's point of view --
	 * globalTime and trailDepth3D are RenderPipeline members, reactivity/
	 * latencyLead are its live-tunable hotkey statics, and the four sim-head
	 * values come from GpuSims's ring-buffer accessors. Passed as plain
	 * values (not references to those owning classes) to keep this class
	 * decoupled from them.
	 */
	struct Context
	{
		float globalTime   = 0.f;   ///< Wall-clock seconds since start (day/night cycle, camera drift/gate-weave, KALEIDO_REGIE_TEST timing).
		float meshUp = 0.f;   ///< Slewed "a loaded-model scene is up" (see RenderPipeline::m_meshUp): damps the beat-driven camera punch/shake/sway, whose full-frame pump reads as the MODEL twitching.
		bool  calm   = true;  ///< Settings key calmMotion (default on): NO beat-driven motion of the whole frame -- virtual camera still, no drop rewind / break scrub, no bass shockwave. Rene has gaming sickness; see rule V7d.
		float trailDepth3D = 0.f;   ///< Previous frame's "a 3D scene is up" blend (RenderPipeline::m_trailDepth3D) -- widens the virtual camera's safety zoom.
		float reactivity   = 1.f;   ///< Global audio-motion master gain (RenderPipeline::s_reactivity).
		float latencyLead  = 0.f;   ///< Display-phase lead in seconds, for loopback/analysis/render latency compensation (RenderPipeline::s_latencyLead).
		float ssmHead      = 0.f;   ///< GpuSims::ssmHeadNorm() -- self-similarity-matrix ring write head.
		float ssmFill      = 0.f;   ///< GpuSims::ssmFillNorm() -- self-similarity-matrix ring fill.
		float spectroHead  = 0.f;   ///< GpuSims::spectroHeadNorm() -- spectrogram ring write head.
		float spectroFill  = 0.f;   ///< GpuSims::spectroFillNorm() -- spectrogram ring fill.
	};

	/**
	 * @brief Advances every envelope/slew/integrator by @p dt and returns the processed AudioFeatures copy.
	 * @param audio Raw per-frame audio-analysis snapshot (unmodified; a working copy is returned).
	 * @param dt Frame time in seconds, already scaled by the caller for freeze/pin/break-hold; internally clamped to [0, 0.1] to ignore stalls.
	 * @param ctx The frame's non-audio inputs (see Context).
	 * @return A copy of @p audio with motion integrated into continuous phases, brightness/onset signals slew-limited, and every field the master music gate should mute already gated.
	 */
	AudioFeatures update( const AudioFeatures &audio, float dt, const Context &ctx );

	bool  downbeatTick() const { return m_downbeatTick; }   ///< @return True for the one frame a downbeat just landed (beat-quantised scene/image cuts).
	float gate()         const { return m_gateSmooth; }     ///< @return The slewed music-presence gate (0 = speech/silence, 1 = full music) that scales every audio-reactive signal.
	float chasePhase()   const { return m_chasePhase; }     ///< @return 0..1 corner-cone colour-chase phase, advances 1/4 turn per onset.
	int   fakeDropCount() const { return m_fakeDrops; }     ///< @return Synthetic drops injected so far by the KALEIDO_FORCE_DROP dev hook; added to audio.dropCount by every consumer so a forced drop feeds the same drop-count-rising-edge logic as a real one.
	float beatSmooth()   const { return m_audioBeatSmooth; }   ///< @return The slew-limited beat strength BEFORE the music gate (unlike AudioFeatures::beatDecay, which is `this * gate`) -- the trail echo-warp reads this ungated value.

	float camZoom()  const { return m_camZoom; }   ///< @return Current virtual-camera zoom factor, for PresentPass.
	float camRot()   const { return m_camRot; }    ///< @return Current virtual-camera roll (per-bar sway), for PresentPass.
	float camOffX()  const { return m_camOffX; }   ///< @return Current virtual-camera horizontal pixel offset (drift + shake + gate-weave), for PresentPass.
	float camOffY()  const { return m_camOffY; }   ///< @return Current virtual-camera vertical pixel offset (drift + shake + gate-weave), for PresentPass.

	float rewindBack()   const { return m_rewindBack; }    ///< @return Seconds behind live the display should read from the PresentPass history ring (0 = live).
	float rewindMix()    const { return m_rewindMixSm; }   ///< @return Slewed visibility (0..1) of the rewind effect.
	float echoOverride() const { return m_echoOverride; }  ///< @return KALEIDO_REGIE_TEST forced time-echo amount, or -1 for "no override".
	float breath()       const { return m_breathSm; }      ///< @return Slewed "breath-hold" amount (0..1), driven by the upper half of build-up.
	float letterbox()    const { return m_letterSm; }      ///< @return Slewed letterbox-bar amount (0..1).
	float shockR()       const { return m_shockR; }        ///< @return Current radius of the expanding bass-shockwave distortion ring.
	float shockAmp()     const { return m_shockAmp; }      ///< @return Current amplitude of the bass-shockwave distortion ring.
	float phraseSecsLeft() const { return m_phraseSecsLeft; }   ///< @return Seconds until the next 8-bar boundary; 0 when the tempo is unknown.

private:
	// ---- envelopes / slews on the raw signal set ----
	float m_specVis[32]  = {};   ///< Meter-ballistics-smoothed copy of the audio spectrum (fast attack, slow release), used to drive geometry so towers/surfaces don't tremble on raw detector jitter.
	float m_gateSmooth   = 0.f;   ///< Slewed music gate (no global reactivity pumping) -- multiplies every audio-reactive signal so classifier wobble near its threshold doesn't pump the show.

	// ---- continuous beat phase (PLL) + bar tracking ----
	float m_beatPhasePLL    = 0.f;   ///< Continuous beat phase (no per-beat resync snap) -- pulled gently toward audio.beatPhase instead of resyncing/snapping on every detection.
	float m_prevPllPhase    = 0.f;   ///< Previous frame's m_beatPhasePLL, for wrap detection.
	int   m_barBeatHost     = 0;     ///< Current beat-within-bar count (0..3), advanced on each m_beatPhasePLL wrap and re-synced on a downbeat tick.
	float m_prevRawDownbeat = 0.f;   ///< Previous frame's raw audio.downbeat, for downbeat rising-edge detection.
	bool  m_downbeatTick    = false;   ///< True for THIS frame when a downbeat lands.
	// ---- 8-bar phrase (where the next drop can land) ----
	float m_phraseBeats     = 0.f;   ///< Beats integrated from the tempo since the last drop (the phrase anchor).
	int   m_phraseDrop      = 0;     ///< audio.dropCount at the last phrase reset.
	float m_phrasePos       = 0.f;   ///< 0..1 inside the current 8-bar phrase.
	float m_phraseSecsLeft  = 0.f;   ///< Seconds to the next 8-bar boundary (0 = tempo unknown).

	// ---- swell / fade-out envelopes ----
	float m_swellFast   = 0.f;   ///< Fast (~1.5 s) exponential average of overallLevel, for the swell envelope.
	float m_swellSlow   = 0.f;   ///< Slow (~8 s) exponential average of overallLevel, for the swell envelope.
	float m_fadeSlow6   = 0.f;   ///< 6 s loudness average, for song-end fade-out detection.
	float m_fadeSlow20  = 0.f;   ///< 20 s loudness average, for song-end fade-out detection.
	float m_fadeOutEnv  = 0.f;   ///< Slewed fade-out envelope (0..1) -- derived from m_fadeSlow6 sinking below m_fadeSlow20.

	// ---- melody ring ----
	float m_melody[96]  = {};   ///< dominantPitch ring (~7.7 s), sampled every 80 ms.
	int   m_melodyHead  = 0;    ///< Current write position in m_melody.
	float m_melodyAccum = 0.f;  ///< Seconds accumulated since the last m_melody sample.

	// ---- rotation / advance / symmetry ----
	float m_audioDir       = 1.f;   ///< Eased rotation direction (-1..+1), smoothly follows audio.audioFlip's sign.
	float m_smoothedSides   = 6.f;   ///< Eased kaleidoscope symmetry (no snap), gradually steps toward the beat-chosen target.
	float m_rotEnergy      = 0.f;   ///< Slowly-slewed rotation-speed envelope (no per-beat jerk).
	float m_audioRotPhase  = 0.f;   ///< Accumulated rotation phase (radians), integrated from a rate each frame.
	float m_audioAdvance   = 0.f;   ///< Accumulated tunnel forward offset, integrated from a rate each frame.

	// ---- peak-hold + release envelopes / their slewed display values ----
	float m_beatEnv          = 0.f, m_audioBeatSmooth  = 0.f;
	float m_onsetEnv         = 0.f, m_onsetSmooth      = 0.f;
	float m_downbeatEnv      = 0.f, m_downbeatSmooth   = 0.f;
	float m_kickEnv          = 0.f, m_kickSmooth       = 0.f;
	float m_snareEnv         = 0.f, m_snareSmooth      = 0.f;
	float m_hatEnv           = 0.f, m_hatSmooth        = 0.f;
	float m_audioLevelSmooth = 0.f;
	float m_audioFluxSmooth  = 0.f;

	// ---- colour-chase ----
	float m_chasePhase     = 0.f;   ///< 0..1, advances 1/4 each onset -> corner-cone colour chase.
	float m_prevChaseOnset = 0.f;   ///< Previous onset value (rising-edge detect for the chase).

	// ---- chroma-hue slew ----
	float m_chromaHueSlew = 0.f;   ///< Slewed chroma hue (0..1, wraps), eased toward audio.chromaHue at up to ~20 deg/s so key changes glide.

	// ---- virtual camera ----
	float m_camPunch = 0.f;   ///< Decaying punch-in envelope (downbeat/drop "punch-in") for the virtual camera.
	float m_camZoom  = 1.f;   ///< Current virtual-camera zoom factor.
	float m_camRot   = 0.f;   ///< Current virtual-camera roll (per-bar sway).
	float m_camOffX  = 0.f, m_camOffY = 0.f;   ///< Current virtual-camera pixel offset (drift + shake + film gate-weave).

	// ---- Zeit-Regie: drop-rewind, break-scrub, echo, letterbox, shockwave ----
	float m_rewindBack    = 0.f;      ///< Seconds behind live (0 = live).
	float m_rewindMixSm   = 0.f;      ///< Slewed visibility (0..1) of the rewind effect.
	bool  m_rewindRace    = false;    ///< True = drop-triggered rewind race in progress (slower catch-up than a DJ-stop release).
	int   m_lastDropSeen  = -1;       ///< Last-seen audio.dropCount (+ forced drops); -1 = never yet.
	float m_breathSm      = 0.f;      ///< Slewed breath-hold amount (0..1).
	float m_echoOverride  = -1.f;     ///< KALEIDO_REGIE_TEST forced time-echo amount; -1 = no override.
	float m_letterSm      = 0.f;      ///< Slewed letterbox-bar amount (0..1).
	float m_shockR        = 9.f;      ///< Current radius of the expanding bass-shockwave distortion ring.
	float m_shockAmp      = 0.f;      ///< Current amplitude of the bass-shockwave distortion ring.
	float m_prevShockKick = 0.f;      ///< Previous frame's m_kickSmooth, for kick rising-edge detection.
	float m_prevShockDrop = 0.f;      ///< Previous frame's dropPulse, for drop rising-edge detection.

	// ---- KALEIDO_FORCE_DROP dev hook ----
	int   m_fakeDrops   = 0;     ///< Synthetic drop count injected by KALEIDO_FORCE_DROP.
	float m_fakePulse   = 0.f;   ///< Decaying synthetic drop pulse.
	float m_forceDropAt = -2.f;  ///< Global time to inject the next forced drop; < -1 = not yet read from the environment.
};

#endif // AUDIOCONDITIONER_H
