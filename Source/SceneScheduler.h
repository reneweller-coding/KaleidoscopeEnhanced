/**
 * @file SceneScheduler.h
 * @brief Picks the next scene/combine effect and drives the cross-fade state
 *        machines (probability-weighted rejection sampling, beat-quantised
 *        timing) that the render pipeline reads back every frame.
 */
#ifndef SCENESCHEDULER_H
#define SCENESCHEDULER_H

// Szenen-Scheduler, herausgelöst aus RenderPipeline (Refactor 3/4 Teil c).
//
// Entscheidet WANN gewechselt wird und WOHIN - die Render-Pipeline fragt nur
// noch ab (actTexture/nextTexture/texInterp/...):
//  - Zustandsmaschinen für Effekt- und Combine-Überblendung (Solo -> Fade),
//    beat-quantisiert auf den Downbeat (mit Timeout + No-Music-Escape)
//  - Musikalische Trigger: Novelty/Key-Change, Section-Wechsel (mit
//    SONG-STRUKTUR-GEDÄCHTNIS: Refrain #2 spielt exakt den Look von
//    Refrain #1), EDM-Drops; Pin unterdrückt alle erzwungenen Cuts
//  - Auswahl des nächsten Effekts: Zufall + Komplexitätsbudget + useShader
//    + moodAccept (Arousal-Busyness, Mood-Tags, gelerntes Taste via Callback)
//  - Review-Modus (Test*-Presets): alphabetisch, fix 8 s pro Szene
//  - Remote-Direktsprung (forceScene) schlägt alles
//  - Übergangs-Wahl: ein Shader aus Transitions/ pro Fade (probability- und
//    mood-gewichtet; Crossfade bleibt der häufigste)
//
// Uhren: std::chrono::steady_clock - exakt die Wandzeit-Semantik der alten
// QElapsedTimer (Freeze/Pin re-armen die Uhren jeden gehaltenen Frame).
// Qt-frei (RendererCore-Baustein); das Taste-PERSISTIEREN (QSettings) bleibt
// beim Aufrufer und kommt als tasteFor-Callback herein.

#include <chrono>
#include <functional>
#include <map>
#include <vector>

class EffectShader;

/**
 * @brief Chooses which effect/combine shader plays next and owns the
 *        cross-fade timing between them.
 *
 * SceneScheduler is the "director" that used to live inline in RenderPipeline:
 * it runs two parallel Solo/Fade state machines (one for the texture/effect
 * slot, one for the combine slot), each beat-quantised to the next downbeat
 * with a timeout and a no-music escape hatch. Effect selection is
 * probability-weighted rejection sampling bounded by #kMaxSearch retries,
 * combining a shader-complexity budget, the @c useShader flag, and
 * moodAccept() (arousal-driven busyness target, mood-tag bonus/malus, and a
 * learned taste factor pulled through the tasteFor callback). It also tracks
 * musical triggers (harmonic novelty, section changes with a per-section
 * "song structure memory" so a repeated chorus replays its earlier look,
 * and EDM drops), a review mode that walks every scene alphabetically for a
 * fixed kReviewSoloSecs each, and a remote forceScene() jump that pre-empts everything
 * else. The render pipeline only ever reads the public accessors
 * (actTexture()/nextTexture()/texInterp()/...); it never touches the state
 * machine directly. The class is Qt-free (a RendererCore building block);
 * persisting the learned taste is left to the caller via setTasteCallback().
 */
class SceneScheduler
{
public:
	/** @brief Bind the effect/FX/transition lists to iterate (ownership stays with the caller).
	 * @param textures Pointer to the pipeline's effect-shader list (the "texture" slot).
	 * @param fxShaders Pointer to the pipeline's FX/overlay-shader list.
	 * @param transitions Pointer to the pipeline's scene-transition shader list
	 *        (Transitions/ — one shader per blend style, rolled per fade).
	 */
	void attach( std::vector<EffectShader *> *textures,
	             std::vector<EffectShader *> *fxShaders,
	             std::vector<EffectShader *> *transitions )
	{ m_textures = textures; m_fxShaders = fxShaders; m_transitions = transitions; }

	/** @brief Roll the initial act/next scene and combine picks and (re)start both clocks (the old start() block). */
	void reset();

	// ---- Konfiguration / Zustand von außen ----
	/** Review bench pacing: how long each scene holds in review mode
	 * (Test* presets). 25 s is a full musical phrase at ~120 BPM, so a
	 * scene's slow camera arcs and palette drifts complete at least once
	 * before the walk moves on -- 8 s showed only the opening moment.
	 */
	static constexpr float kReviewSoloSecs = 25.f;

	/** @brief Enable/disable review mode (alphabetical walk, fixed kReviewSoloSecs per scene).
	 * @param on True to enter review mode, false to return to normal random selection.
	 */
	void setReviewMode( bool on )   { m_reviewMode = on; }
	bool reviewMode() const         { return m_reviewMode; }   ///< True while stepping the alphabetical Test*-preset review order.
	/** @brief Snapshot the current mood values used by moodAccept()'s busyness/tag bias.
	 * @param arousal Arousal 0..1 (drives the target shader-complexity/busyness).
	 * @param valence Valence 0..1 (drives the bright/dark mood-tag bonus).
	 * @param ambient Ambient level 0..1 (drives the calm/aggressive mood-tag bonus).
	 */
	void setMood( float arousal, float valence, float ambient )
	{ m_lastArousal = arousal; m_lastValence = valence; m_lastAmbient = ambient; }
	/** Gelerntes Taste (Skip-Malus/Favoriten-Bonus): Faktor je Fragment-Pfad.
	 *  Persistenz macht der Aufrufer; ohne Callback zählt alles als 1.0. */
	/** @brief Install the learned-taste callback (skip-malus / favourite-bonus per fragment path).
	 * @param f Callback mapping a fragment path to a taste multiplier; persistence is the caller's job. Without a callback every shader counts as 1.0.
	 */
	void setTasteCallback( std::function<float(const char *)> f ) { m_tasteFor = std::move(f); }

	// ---- VJ / Remote ----
	/** @brief Request an early cut on the next tick (manual 'n' or remote request).
	 * @param alsoFx If true, also force the FX slot to change (not just the effect).
	 */
	void requestChange( bool alsoFx )
	{ m_forceEffectChange = true; m_forceIsManual = true; if( alsoFx ) m_forceFxChange = true; }
	/** @brief Jump directly to a given effect index, pre-empting the normal selection (remote scene browser).
	 * @param idx Index into the attached texture/effect list to jump to.
	 */
	void forceScene( int idx );
	/** Solo-Alter des aktuellen Effekts (Skip-Malus-Fenster, !status etc.). */
	float actElapsedSec() const { return secsSince( m_clockEffectTexture ); }   ///< Seconds since the current effect went solo (used for the skip-malus window, !status, etc.).
	/** Freeze/Pin: Effekt-/Combine-Uhren re-armen, damit hinter dem
	 *  gehaltenen Bild kein Wechsel "fällig" wird. */
	/** @brief Re-arm both effect/combine clocks so no change is "due" the moment a freeze/pin lifts. */
	void rearmEffectClocks() { restart( m_clockEffectTexture ); restart( m_clockEffectFx ); }
	/** @brief Subtract a frame hitch from the running Solo/Fade clocks.
	 *
	 *  Both slots time themselves on wall clocks, which is right for music but
	 *  wrong across a STALL: a mesh scene's first activation compiles its
	 *  shader and loads its model synchronously, and a multi-second freeze
	 *  then counts as elapsed show time. The fade "completes" inside the
	 *  frozen frame (the scene pops instead of blending), the 2-second
	 *  minimum solo is already spent when the picture unfreezes, and a queued
	 *  trigger cuts away a scene the viewer saw for well under a second --
	 *  both reported, both worst in the first minutes while the working set
	 *  is cold. Shifting the reference points forward by the stall removes
	 *  exactly that time from the books. */
	void absorbHitch( float secs )
	{
		const auto d = std::chrono::duration_cast<Clock::duration>(
			std::chrono::duration<float>( secs ) );
		m_clockEffectTexture += d;
		m_clockEffectFx      += d;
	}

	/** @brief Per-frame inputs consumed by tick()/tickFx(). */
	struct Tick
	{
		float dt            = 0.f;    ///< timeSinceLastFrameSec (break-skaliert)
		bool  downbeatTick  = false;  ///< True on the frame a downbeat lands (quantises pending changes).
		float gateSmooth    = 0.f;    ///< Smoothed music-presence gate; below 0.25 triggers the no-music escape.
		float timingScale   = 1.f;    ///< Divides fade/solo durations (e.g. break-time stretch).
		bool  pinned        = false;  ///< VJ pin ('u'): suppresses every forced cut while held.
		// Trigger
		float harmonicChange = 0.f;   ///< Harmonic/key-change novelty strength (combined with musicPresence to force a cut).
		float musicPresence  = 0.f;   ///< Gates the novelty trigger; no forced cuts from silence.
		int   sectionCount   = 0;     ///< Running count of detected song sections; a rising edge signals a section change.
		int   sectionId      = -1;    ///< Identity of the current section (looked up in the song-structure memory). A recycled LRU slot index -- never treat "id seen before" as "section returning" without #sectionKnown.
		bool  sectionKnown   = false; ///< True only if the analyzer RECOGNISED the section by fingerprint; false for a newly stored one (even when its id slot was recycled from an older section).
		int   dropCount      = 0;     ///< Running count of detected EDM drops; a rising edge triggers a drop cut.
		// Übergangs-Timing
		float rhythmStrength = 0.f;   ///< Beat confidence 0..1; above 0.55 lets the 4-beat cross-fade duration kick in.
		float estimatedBPM   = 0.f;   ///< Estimated tempo, used to compute the 4-beat cross-fade duration.
		float logAttackTime  = 0.f;   ///< Articulation (staccato vs. legato); shortens the cross-fade for staccato material.
	};

	/** @brief Evaluate musical triggers and advance the effect (texture) Solo/Fade state machine. Runs before the effect passes.
	 * @param t Frame inputs (timing, triggers, gate).
	 */
	void tick( const Tick &t );
	/** @brief Advance the combine Solo/Fade state machine. Runs after the effect passes, at the point trueStereoHold is known.
	 * @param t Frame inputs (timing, triggers, gate).
	 * @param trueStereoHold True while an eye-packed true-stereo 3D frame must not enter a combine cross-fade; freezes combine switching until it lifts.
	 */
	void tickFx( const Tick &t, bool trueStereoHold );

	// ---- Abfragen der Pipeline ----
	unsigned int actTexture()  const { return m_actTexture; }    ///< Index of the currently active (solo or fade-from) effect/texture shader.
	unsigned int nextTexture() const { return m_nextTexture; }   ///< Index of the effect/texture shader being faded to (or picked for next).
	unsigned int actFx()  const { return m_actFx; }    ///< Index of the currently active combine shader.
	unsigned int nextFx() const { return m_nextFx; }   ///< Index of the combine shader being faded to (or picked for next).
	int   texState()   const { return m_texState; }    // 0 = Solo, 1 = Fade   ///< Effect state machine phase: 0 = Solo, 1 = Fade.
	int   fxState()  const { return m_fxState; }   ///< Combine state machine phase: 0 = Solo, 1 = Fade.
	float texInterp()  const { return m_texInterp; }   // 1 -> 0 während des Fades   ///< Effect cross-fade blend factor, 1 -> 0 over the fade.
	float fxInterp() const { return m_fxInterp; }  ///< Combine cross-fade blend factor, 1 -> 0 over the fade.
	unsigned int actTransition() const { return m_actTransition; }   ///< Index of the transition shader rolled for the current/last scene fade.

private:
	using Clock = std::chrono::steady_clock;
	static void  restart( Clock::time_point &tp ) { tp = Clock::now(); }   ///< Reset a clock's reference point to now.
	/** @brief Elapsed wall time since a clock's reference point.
	 * @param tp Reference time point captured by restart().
	 * @return Seconds elapsed since @p tp.
	 */
	static float secsSince( const Clock::time_point &tp )
	{ return std::chrono::duration<float>( Clock::now() - tp ).count(); }

	/** @brief Probabilistic mood-based accept/reject test used by the rejection-sampling selection loops.
	 * @param s Candidate effect or combine shader to evaluate.
	 * @return True if the candidate is accepted (weighted random roll), false to keep searching.
	 */
	bool  moodAccept( EffectShader *s ) const;
	/** @brief Look up the learned-taste multiplier for a fragment path via the taste callback.
	 * @param frag Fragment shader path to look up.
	 * @return Taste multiplier (1.0 if no callback is installed).
	 */
	float tasteOf( const char *frag ) const { return m_tasteFor ? m_tasteFor( frag ) : 1.f; }

	/** @brief Find a registered transition by fragment basename (e.g. "Shatter.frag").
	 * @param basename File name without path to look for.
	 * @return Index into the transition list, or -1 if absent/empty.
	 */
	int findTransition( const char *basename ) const;

	std::vector<EffectShader *> *m_textures    = nullptr;   ///< Effect/texture shader list (not owned).
	std::vector<EffectShader *> *m_fxShaders    = nullptr;   ///< FX/overlay shader list (not owned).
	std::vector<EffectShader *> *m_transitions = nullptr;   ///< Scene-transition shader list (not owned).

	// Auswahl-Zustand
	unsigned int m_actTexture  = 0;   ///< Currently active effect/texture shader index.
	unsigned int m_nextTexture = 0;   ///< Effect/texture shader index being faded to.
	unsigned int m_actFx  = 0;   ///< Currently active combine shader index.
	unsigned int m_nextFx = 0;   ///< Combine shader index being faded to.
	int   m_texState   = 0;    ///< Effect state machine phase: 0 = Solo, 1 = Fade.
	int   m_fxState  = 0;    ///< Combine state machine phase: 0 = Solo, 1 = Fade.
	float m_texInterp  = 1.f;  ///< Effect cross-fade blend factor.
	float m_fxInterp = 1.f;  ///< Combine cross-fade blend factor.
	float m_texFadeDur  = 10.f;   // aktuelle Solo- BZW. Fade-Dauer (wie zuvor doppelt genutzt)   ///< Current Solo *or* Fade duration for the effect slot (dual-purpose, as before).
	float m_fxFadeDur = 10.f;   ///< Current Solo *or* Fade duration for the combine slot.
	Clock::time_point m_clockEffectTexture = Clock::now();   ///< Reference clock for the effect slot's Solo/Fade timing.
	Clock::time_point m_clockEffectFx = Clock::now();   ///< Reference clock for the combine slot's Solo/Fade timing.
	// Some pools (the FX/combine list, and Transitions/) are dominated by one
	// near-probability=1.0 "carrier" entry (FxPlain, Crossfade) plus a long
	// tail of rare accent shaders at probability ~0.002-0.08 each -- a
	// simulation against Komplett.xml's real numbers showed 100 tries left
	// ~10-40% of picks exhausting the search entirely (falling back to
	// whatever the last, unweighted candidate happened to be, defeating the
	// intended ~90% dominance). Raised well past where that simulation showed
	// exhaustion become negligible (<1% by 300 tries).
	static const unsigned int kMaxSearch = 300;   ///< Retry bound for every rejection-sampling selection loop.
	// Sum-of-complexities ceiling a candidate must stay under to be accepted
	// (busyness budget: don't stack two very busy layers at once). Complexity
	// values run 1..5 with a handful of scenes at 10; the OLD ceiling of 20
	// (kComplexityBudget) / 12 (kComplexityBudgetInitial) meant a complexity=10
	// scene only ever passed when the three OTHER slots were all near their
	// minimum simultaneously -- effectively excluding it most of the time.
	// Raised so a complexity=10 candidate stays reachable alongside a normal
	// (non-minimal) combo, while an all-four-maxed-out combo is still capped.
	static const unsigned int kComplexityBudget        = 28;   ///< Ceiling for the 4-term (act+next texture, act+next combine) sum used by tick()/tickFx()'s normal picks and reset()'s second (combine-inclusive) pick.
	static const unsigned int kComplexityBudgetInitial  = 17;  ///< Ceiling for reset()'s first, texture-only (2-term) pick, before the combine pair exists yet -- kept at the same ratio to kComplexityBudget as the original 12:20.

	// Erzwungene Wechsel + Beat-Quantisierung
	bool  m_forceEffectChange   = false;   ///< Set by requestChange()/forceScene()/triggers; consumed at the next Solo-phase check.
	// A MANUAL cut (key 'n', remote) may fire after a brief 0.6 s solo; a
	// musical TRIGGER (section/novelty/drop) must respect a longer minimum
	// solo, otherwise a trigger landing right after a fade completes cuts the
	// freshly faded-in scene away again after 0.6 s -- the reported
	// "a scene flashes in for a fraction of a second and is replaced".
	bool  m_forceIsManual       = false;   ///< The pending m_forceEffectChange came from requestChange()/forceScene() (short min solo), not from a musical trigger.
	bool  m_forceFxChange  = false;   ///< Set by requestChange(alsoFx)/triggers; consumed at the next FX Solo-phase check.
	int   m_forcedNextTexture   = -1;      ///< Remote direct-jump target index (-1 = none); wins over review mode and random pick.
	bool  m_pendingEffectChange = false;   ///< True while an effect change is due but waiting on beat quantisation.
	bool  m_pendingEffectForced = false;   ///< True if the pending effect change was manual/forced (fires immediately, skips the downbeat wait).
	float m_pendingEffectAge    = 0.f;     ///< Seconds the pending effect change has been waiting (timeout escape at 2.5 s).
	bool  m_pendingFxChange = false;  ///< True while a combine change is due but waiting on beat quantisation.
	bool  m_pendingFxForced = false;  ///< True if the pending combine change was manual/forced.
	float m_pendingFxAge    = 0.f;    ///< Seconds the pending combine change has been waiting.

	// Trigger-Buchhaltung
	float m_noveltyCooldown  = 0.f;   ///< Seconds until another harmonic-novelty/section trigger is allowed to fire (rate limit).
	int   m_lastSectionCount = 0;     ///< Last seen Tick::sectionCount, to detect the rising edge of a new section.
	int   m_lastDropCount    = 0;     ///< Last seen Tick::dropCount, to detect the rising edge of a new drop.
	// Ein Drop hat den Wechsel ausgelöst: beim Feuern wird daraus ein HARTER
	// Schnitt (Musikvideo-Look) oder der Shatter-Übergang statt des normalen
	// Crossfades.
	bool  m_dropCutPending   = false;   ///< A drop triggered the pending change: when it fires, use a hard cut or the shatter transition instead of a normal cross-fade.

	// Song-Struktur-Gedächtnis.  Keyed by the analyzer's section id, which
	// is a RECYCLED 8-slot LRU index: a new section of a later song inherits
	// an id some earlier, unrelated section once carried.  These maps are
	// never cleared (there is no track-change signal), so a replay decision
	// must ALSO require Tick::sectionKnown and a fresh m_sectionStamp --
	// without both, after the first ~8 sections of a session every id was
	// "known" and the scheduler replayed the same handful of scenes for the
	// rest of the evening (the reported "always the same 10-20 scenes").
	std::map<int, unsigned int>       m_sectionEffect;    ///< Section id -> effect/texture index last played during that section.
	std::map<int, unsigned int>       m_sectionFx;   ///< Section id -> combine index last played during that section.
	std::map<int, std::vector<float>> m_sectionParams;    ///< Section id -> snapshotted shader parameters to restore on replay.
	std::map<int, int>                m_sectionStamp;     ///< Section id -> Tick::sectionCount at store time (staleness guard: no replay across songs).
	static const int kSectionMemorySpan = 24;   ///< Max sectionCount distance for a replay (sections are >= ~12 s apart, so ~5+ min -- within one song, not across the set).
	int   m_pendingSectionStore   = -1;   ///< Section id whose final look should be stored at the next fade-end (-1 = none pending).
	int   m_pendingSectionRestore = -1;   ///< Section id whose stored look should be restored at the next fade-start (-1 = none pending).
	// A recurring section's replay target arriving WHILE a fade is already in
	// flight must not overwrite m_nextTexture/m_nextFx directly -- the render
	// pipeline reads nextTexture()/nextFx() fresh every frame, so that would
	// silently swap the incoming scene under an already-rolled transition
	// (the reported "jump to a completely different scene right after a
	// switch"). Deferred here instead and applied at the next fade-END, the
	// same mid-fade-safe pattern forceScene() already uses via m_forcedNextTexture.
	int   m_pendingSectionNext    = -1;   ///< Deferred effect-slot replay target texture index (-1 = none pending).
	int   m_pendingSectionNextId  = -1;   ///< Section id owning m_pendingSectionNext, so its stored params still get restored at that fade's start.
	int   m_pendingSectionNextFx  = -1;   ///< Deferred combine-slot replay target index (-1 = none pending).

	// Review-Modus
	bool  m_reviewMode = false;             ///< True while walking scenes alphabetically instead of picking randomly.
	std::vector<int> m_reviewOrder;         ///< Texture indices sorted alphabetically by fragment basename (built lazily).
	int   m_reviewPos  = 0;                 ///< Current position within m_reviewOrder.

	// Übergangs-Auswahl (ein Shader pro Fade, aus Transitions/)
	unsigned int m_actTransition = 0;   ///< Transition shader rolled for the effect slot's current/last fade.

	// Mood-Snapshot für moodAccept
	float m_lastArousal = 0.5f;   ///< Last mood arousal snapshot (0..1) from setMood().
	float m_lastValence = 0.5f;   ///< Last mood valence snapshot (0..1) from setMood().
	float m_lastAmbient = 0.f;    ///< Last mood ambient-level snapshot (0..1) from setMood().

	std::function<float(const char *)> m_tasteFor;   ///< Learned-taste callback (fragment path -> multiplier); unset means neutral 1.0 for everything.
};

#endif
