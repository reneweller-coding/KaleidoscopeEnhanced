//---------------------------------------------------------------------------
//                              SceneScheduler
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  Picks the next scene/combine effect and drives the cross-fade state machines (probability-weighted rejection
 *  sampling, beat-quantised timing) that the render pipeline reads back every frame.
 *
 *  @author René Weller
 */

#ifndef SCENESCHEDULER_H
#define SCENESCHEDULER_H

// Scene scheduler, split out of RenderPipeline (refactor 3/4, part c).
//
// Decides WHEN to change and to WHAT - the render pipeline only queries it
// (actTexture/nextTexture/texInterp/...):
//  - state machines for the effect and combine cross-fades (solo -> fade),
//    beat-quantised to the downbeat (with timeout + no-music escape)
//  - musical triggers: novelty/key change, section change (with
//    SONG-STRUCTURE MEMORY: chorus #2 plays exactly the look of chorus #1),
//    EDM drops; pin suppresses all forced cuts
//  - choice of the next effect: chance + complexity budget + useShader
//    + moodAccept (arousal busyness, mood tags, learned taste via callback)
//  - long runs (LongRunVariety.h): a no-repeat memory of three quarters of
//    the preset, kept across restarts by the caller (setHistory, the history
//    callback), and the walking chain labs' share of the screen time
//    (setLabShare: a lab when the clock calls for one, never two in a row)
//  - review mode (Test* presets): alphabetical, a fixed time per scene
//  - a remote direct jump (forceScene) beats everything
//  - transition choice: one shader from Transitions/ per fade (weighted by
//    probability and mood; the cross-fade stays the most frequent)
//
// Clocks: EngineClock (coreclock.h) - the wall-time semantics of the old
// QElapsedTimer in a live show (freeze/pin re-arm the clocks every held
// frame), the frame clock in a video export.
// Qt-free (a RendererCore building block); PERSISTING the taste (QSettings)
// stays with the caller and comes in as the tasteFor callback.

#include <chrono>
#include <functional>
#include <map>
#include <string>
#include <vector>

#include "LongRunVariety.h"
#include "coreclock.h"

class EffectShader;

/** @class SceneScheduler
 *
 * Chooses which effect/combine shader plays next and owns the cross-fade timing between them.
 *
 * SceneScheduler is the "director" that used to live inline in RenderPipeline:
 * it runs two parallel Solo/Fade state machines (one for the texture/effect
 * slot, one for the combine slot), each beat-quantised to the next downbeat
 * with a timeout and a no-music escape hatch. Effect selection is
 * probability-weighted rejection sampling bounded by #MaxSearch retries,
 * combining a shader-complexity budget, the @c useShader flag, and
 * moodAccept() (arousal-driven busyness target, mood-tag bonus/malus, and a
 * learned taste factor pulled through the tasteFor callback). It also tracks
 * musical triggers (harmonic novelty, section changes with a per-section
 * "song structure memory" so a repeated chorus replays its earlier look,
 * and EDM drops), a review mode that walks every scene alphabetically for a
 * fixed ReviewSoloSecs each, and a remote forceScene() jump that pre-empts everything
 * else. For shows that run for days it keeps a no-repeat memory of three
 * quarters of the preset (stored by the caller: setHistory(),
 * setHistoryCallback()) and gives the walking chain labs the share of the
 * screen time the preset asks for (setLabShare()). The render pipeline only ever reads the public accessors
 * (actTexture()/nextTexture()/texInterp()/...); it never touches the state
 * machine directly. The class is Qt-free (a RendererCore building block);
 * persisting the learned taste is left to the caller via setTasteCallback().
 **/
class SceneScheduler
{
public:
    /**  Bind the effect/FX/transition lists to iterate (ownership stays with the caller).
     *
     * @param textures     Pointer to the pipeline's effect-shader list (the "texture" slot). (in)
     * @param fxShaders    Pointer to the pipeline's FX/overlay-shader list. (in)
     * @param transitions  Pointer to the pipeline's scene-transition shader list (Transitions/ — one shader per
     *                     blend style, rolled per fade). (in)
     **/
    void attach( std::vector<EffectShader *> *textures,
                 std::vector<EffectShader *> *fxShaders,
                 std::vector<EffectShader *> *transitions )
    {
        m_textures = textures;
        m_fxShaders = fxShaders;
        m_transitions = transitions;
    }

    /** Roll the initial act/next scene and combine picks and (re)start both clocks (the old start() block). */
    void reset();

    // ---- Configuration / state from outside ----
    /** Review bench pacing: how long each scene holds in review mode (Test* presets).
     *
     * 25 s is a full musical phrase at ~120 BPM, so a scene's slow camera arcs and palette drifts complete at least
     * once before the walk moves on -- 8 s showed only the opening moment.
     **/
    static constexpr float ReviewSoloSecs = 25.f;

    /**  Enable/disable review mode (alphabetical walk, fixed ReviewSoloSecs per scene).
     *
     * @param on  True to enter review mode, false to return to normal random selection. (in)
     *
     * @sideeffects
     *   Changes EffectShader::M_ReviewSolo.
     **/
    void setReviewMode( bool on );
    /**  Preset-wide floor on every natural scene fade (seconds, 0 = none).
     *
     * @param secs  Floor in seconds; values <= 0 disable it. (in)
     *
     * A preset that sets it (Ambient, SpaceAmbient) also never hard-cuts on a detected drop, and a musical trigger
     * (a section, a drop) ends a scene there only after 20 s on screen, as a natural change with the calm fade: the
     * whole point of such a preset is that nothing snaps.
     **/
    void setSceneFadeMin( float secs ) { m_sceneFadeMin = secs > 0.f ? secs : 0.f; }
    /**  True while stepping the alphabetical Test*-preset review order.
     *
     * @return
     *   True while stepping the alphabetical Test*-preset review order.
     **/
    bool reviewMode() const
    {
        return m_reviewMode;
    }
    /**  Snapshot the current mood values used by moodAccept()'s busyness/tag bias.
     *
     * @param arousal  Arousal 0..1 (drives the target shader-complexity/busyness). (in)
     * @param valence  Valence 0..1 (drives the bright/dark mood-tag bonus). (in)
     * @param ambient  Ambient level 0..1 (drives the calm/aggressive mood-tag bonus). (in)
     **/
    void setMood( float arousal, float valence, float ambient )
    {
        m_lastArousal = arousal;
        m_lastValence = valence;
        m_lastAmbient = ambient;
    }
    /**  Install the learned-taste callback (skip-malus / favourite-bonus per fragment path).
     *
     * @param f  Callback mapping a fragment path to a taste multiplier; persistence is the caller's job. Without a
     *           callback every shader counts as 1.0. (in)
     **/
    void setTasteCallback( std::function<float( const char * )> f ) { m_tasteFor = std::move( f ); }
    /**  The walking chain labs' share of the screen time the preset asks for (attribute labShare).
     *
     * @param share  0..1; 0 (the default) leaves the labs ordinary entries of the random pick. (in)
     *
     * Above 0 the labs (EffectShader::isWalkingLab()) leave the random pick: a lab comes when the clock says the
     * labs are behind their share, never two in a row, and never the same lab file twice in succession.  Set it
     * before reset().
     **/
    void setLabShare( float share ) { m_labClock.setTarget( share ); }
    /**  The no-repeat memory a previous run left (shader file names, oldest first).
     *
     * @param names  The stored names; reset() trims them to the memory's capacity. (in)
     *
     * Set it before reset(), which takes it over -- the first scenes of the session then come from outside it too.
     **/
    void setHistory( const std::vector<std::string> &names ) { m_pendingHistory = names; }
    /**  Install the callback that stores the no-repeat memory (called whenever a scene has come on screen).
     *
     * @param f  Receives the memory, oldest first; persistence is the caller's job.  Not called in review mode.
     *           (in)
     **/
    void setHistoryCallback( std::function<void( const std::vector<std::string> & )> f )
    {
        m_onHistory = std::move( f );
    }

    // ---- VJ / Remote ----
    /**  Request an early cut on the next tick (manual 'n' or remote request).
     *
     * @param alsoFx  If true, also force the FX slot to change (not just the effect). (in)
     **/
    void requestChange( bool alsoFx )
    {
        m_forceEffectChange = true;
        m_forceIsManual = true;
        if ( alsoFx )
            m_forceFxChange = true;
    }
    /** A natural scene change on the next tick: the change a section or a drop asks for, not a person's cut (in a
     * calm preset it waits for a real stay and fades with the preset's fade floor).  A new song's.
     **/
    void requestNaturalChange()
    {
        m_forceEffectChange = true;
        m_forceIsManual = false;
    }
    /**  A new song: the section memory starts empty, so no look of the last song is replayed in this one. */
    void newSong()
    {
        m_sectionEffect.clear();
        m_sectionFx.clear();
        m_sectionParams.clear();
        m_sectionStamp.clear();
        m_sectionTime.clear();
        m_pendingSectionStore = -1;
        m_pendingSectionRestore = -1;
        m_dropInSong = false;
    }
    /**  Jump directly to a given effect index, pre-empting the normal selection (remote scene browser).
     *
     * @param idx  Index into the attached texture/effect list to jump to; out-of-range or a missing attach() is
     *             silently ignored. (in)
     **/
    void forceScene( int idx );
    /**  Force the next combine-effect (overlay) to @p idx, bypassing the complexity budget, mood and mesh-calm
     * filters.
     *
     * @param idx  Index into fxNames(); ignored if out of range. (in)
     *
     * For measuring FX the way KALEIDO_SCENE_SWEEP measures scenes: an
     * overlay that does nothing is a real failure class (43 silent FX and
     * transitions were once found at one go), and the random picker cannot
     * be relied on to show a given one at a known moment.
     **/
    void forceFx( int idx );
    /**  Solo age of the current effect (skip-malus window, !status etc.).
     *
     * @return
     *   Seconds since it went solo.
     *
     * Seconds since the current effect went solo (used for the skip-malus window, !status, etc.).
     **/
    float actElapsedSec() const
    {
        return secsSince( m_clockEffectTexture );
    }
    /** Re-arm both effect/combine clocks so no change is "due" the moment a freeze/pin lifts. */
    void rearmEffectClocks()
    {
        restart( m_clockEffectTexture );
        restart( m_clockEffectFx );
    }
    /**  Subtract a frame hitch from the running Solo/Fade clocks.
     *
     * @param secs  Length of the hitch in seconds. (in)
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
     *  exactly that time from the books.
     **/
    void absorbHitch( float secs )
    {
        const auto d = std::chrono::duration_cast<ClockT::duration>(
            std::chrono::duration<float>( secs ) );
        m_clockEffectTexture += d;
        m_clockEffectFx += d;
    }

    /** Per-frame inputs consumed by tick()/tickFx(). */
    struct Tick
    {
        float dt = 0.f;             ///< Scene time step, seconds (timeSinceLastFrameSec; scaled by a freeze/DJ stop).
        bool  downbeatTick = false; ///< True on the frame a downbeat lands (quantises pending changes).
        float gateSmooth = 0.f;     ///< Smoothed music-presence gate; below 0.25 triggers the no-music escape.
        float timingScale = 1.f;    ///< Divides fade/solo durations (e.g. break-time stretch).
        bool  pinned = false;       ///< VJ pin ('u'): suppresses every forced cut while held.
        // Trigger
        float harmonicChange = 0.f; ///< Harmonic/key-change novelty strength (combined with musicPresence to force a
                                    ///< cut).
        float musicPresence = 0.f;  ///< Gates the novelty trigger; no forced cuts from silence.
        int   sectionCount = 0; ///< Running count of detected song sections; a rising edge signals a section change.
        int   sectionId = -1; ///< Identity of the current section (looked up in the song-structure memory). A recycled
                              ///< LRU slot index -- never treat "id seen before" as "section returning" without
                              ///< #sectionKnown.
        bool sectionKnown = false;  ///< True only if the analyzer RECOGNISED the section by fingerprint; false for a
                                    ///< newly stored one (even when its id slot was recycled from an older section).
        int dropCount = 0;          ///< Running count of detected EDM drops; a rising edge triggers a drop cut.
        // Transition timing
        float rhythmStrength = 0.f; ///< Beat confidence 0..1; above 0.55 lets the 4-beat cross-fade duration kick in.
        float estimatedBPM = 0.f;   ///< Estimated tempo, used to compute the 4-beat cross-fade duration.
        float logAttackTime = 0.f;  ///< Articulation (staccato vs. legato); shortens the cross-fade for staccato
                                    ///< material.
        // Direction: the arc onto the drop
        float buildUp = 0.f; ///< Build-up tension 0..1 (analyzer); a rising edge past 0.45 arms the drop-synchronous
                             ///< arc.
        float phraseSecsLeft = 0.f; ///< Seconds to the next 8-bar boundary = the predicted drop; 0 when the tempo is
                                    ///< unknown.
    };

    /**  Evaluate musical triggers and advance the effect (texture) Solo/Fade state machine.
     *
     * @param t  Frame inputs (timing, triggers, gate). (in)
     *
     * Runs before the effect passes.
     **/
    void tick( const Tick &t );
    /**  Advance the combine Solo/Fade state machine.
     *
     * @param t               Frame inputs (timing, triggers, gate). (in)
     * @param trueStereoHold  True while an eye-packed true-stereo 3D frame must not enter a combine cross-fade;
     *                        freezes combine switching until it lifts. (in)
     *
     * Runs after the effect passes, at the point trueStereoHold is known.
     **/
    void tickFx( const Tick &t, bool trueStereoHold );

    // ---- Queries from the pipeline ----
    /**  Index of the currently active (solo or fade-from) effect/texture shader.
     *
     * @return
     *   Index of the currently active (solo or fade-from) effect/texture shader.
     **/
    unsigned int actTexture() const
    {
        return m_actTexture;
    }
    /**  Index of the effect/texture shader being faded to (or picked for next).
     *
     * @return
     *   Index of the effect/texture shader being faded to (or picked for next).
     **/
    unsigned int nextTexture() const
    {
        return m_nextTexture;
    }
    /**  Index of the currently active combine shader.
     *
     * @return
     *   Index of the currently active combine shader.
     **/
    unsigned int actFx() const { return m_actFx; }
    /**  Index of the combine shader being faded to (or picked for next).
     *
     * @return
     *   Index of the combine shader being faded to (or picked for next).
     **/
    unsigned int nextFx() const
    {
        return m_nextFx;
    }
    /**  Effect state machine phase: 0 = Solo (one scene on screen), 1 = Fade (cross-fading actTexture() ->
     * nextTexture()).
     *
     * @return
     *   Effect state machine phase: 0 = Solo (one scene on screen), 1 = Fade (cross-fading actTexture() ->
     *   nextTexture()).
     **/
    int texState() const
    {
        return m_texState;
    }
    /**  Combine state machine phase: 0 = Solo, 1 = Fade.
     *
     * @return
     *   Combine state machine phase: 0 = Solo, 1 = Fade.
     **/
    int fxState() const { return m_fxState; }
    /**  Effect cross-fade blend factor: 1 while solo, then runs 1 -> 0 over the fade (weight of the outgoing
     * actTexture()); the transition shaders receive it as their progress uniform.
     *
     * @return
     *   Effect cross-fade blend factor: 1 while solo, then runs 1 -> 0 over the fade (weight of the outgoing
     *   actTexture()); the transition shaders receive it as their progress uniform.
     **/
    float texInterp() const
    {
        return m_texInterp;
    }
    /**  Combine cross-fade blend factor, 1 -> 0 over the fade.
     *
     * @return
     *   Combine cross-fade blend factor, 1 -> 0 over the fade.
     **/
    float fxInterp() const { return m_fxInterp; }
    /**  Index of the transition shader rolled for the current/last scene fade.
     *
     * @return
     *   Index of the transition shader rolled for the current/last scene fade.
     **/
    unsigned int actTransition() const
    {
        return m_actTransition;
    }
    /**  The running fade's length (meaningful while texState() != 0).
     *
     * @return
     *   Seconds.
     **/
    float texFadeDur() const { return m_texFadeDur; }

private:
    using ClockT = EngineClock; ///< The engine clock behind every Solo/Fade timer: monotonic wall time like the
                                ///< QElapsedTimer this class replaced (never affected by system-time changes), frame
                                ///< time in a video export.
    /**  Reset a clock's reference point to now.
     *
     * @param tp  The clock's reference point; receives the current time. (out)
     **/
    static void restart( ClockT::time_point &tp ) { tp = ClockT::now(); }
    /**  Elapsed engine time since a clock's reference point.
     *
     * @param tp  Reference time point captured by restart(). (in)
     *
     * @return
     *   Seconds elapsed since @p tp.
     **/
    static float secsSince( const ClockT::time_point &tp )
    {
        return std::chrono::duration<float>( ClockT::now() - tp ).count();
    }

    /**  Probabilistic mood-based accept/reject test used by the rejection-sampling selection loops.
     *
     * @param s  Candidate effect or combine shader to evaluate. (in)
     *
     * @return
     *   True if the candidate is accepted (weighted random roll), false to keep searching.
     **/
    bool moodAccept( EffectShader *s ) const;
    /**  Look up the learned-taste multiplier for a fragment path via the taste callback.
     *
     * @param frag  Fragment shader path to look up. (in)
     *
     * @return
     *   Taste multiplier (1.0 if no callback is installed).
     **/
    float tasteOf( const char *frag ) const { return m_tasteFor ? m_tasteFor( frag ) : 1.f; }

    /**  Find a registered transition by fragment basename (e.g. "Shatter.frag").
     *
     * @param basename  File name without path to look for. (in)
     *
     * @return
     *   Index into the transition list, or -1 if absent/empty.
     **/
    int findTransition( const char *basename ) const;

    std::vector<EffectShader *> *m_textures = nullptr;    ///< Effect/texture shader list (not owned).
    std::vector<EffectShader *> *m_fxShaders = nullptr;   ///< FX/overlay shader list (not owned).
    std::vector<EffectShader *> *m_transitions = nullptr; ///< Scene-transition shader list (not owned).

    // Selection state
    unsigned int m_actTexture = 0;                           ///< Currently active effect/texture shader index.
    unsigned int m_nextTexture = 0;                          ///< Effect/texture shader index being faded to.
    unsigned int m_actFx = 0;                                ///< Currently active combine shader index.
    unsigned int m_nextFx = 0;                               ///< Combine shader index being faded to.
    int          m_forcedNextFx = -1; ///< FX index forced by forceFx(); -1 = free choice. Consumed once.
    int          m_texState = 0;                             ///< Effect state machine phase: 0 = Solo, 1 = Fade.
    int          m_fxState = 0;                              ///< Combine state machine phase: 0 = Solo, 1 = Fade.
    float        m_texInterp = 1.f;                          ///< Effect cross-fade blend factor.
    float        m_fxInterp = 1.f;                           ///< Combine cross-fade blend factor.
    float        m_texFadeDur = 10.f; ///< Duration in seconds of the effect slot's CURRENT phase: the solo span while
                               ///< m_texState == 0, the fade span while m_texState == 1 (one dual-purpose field, as in
                               ///< the old inline code).
    float              m_fxFadeDur = 10.f;                   ///< Current Solo *or* Fade duration for the combine slot.
    ClockT::time_point m_clockEffectTexture = ClockT::now(); ///< Reference clock for the effect slot's Solo/Fade
                                                             ///< timing.
    ClockT::time_point m_clockEffectFx = ClockT::now(); ///< Reference clock for the combine slot's Solo/Fade timing.
    // Some pools (the FX/combine list, and Transitions/) are dominated by one
    // near-probability=1.0 "carrier" entry (FxPlain, Crossfade) plus a long
    // tail of rare accent shaders at probability ~0.002-0.08 each -- a
    // simulation against Komplett.xml's real numbers showed 100 tries left
    // ~10-40% of picks exhausting the search entirely (falling back to
    // whatever the last, unweighted candidate happened to be, defeating the
    // intended ~90% dominance). Raised well past where that simulation showed
    // exhaustion become negligible (<1% by 300 tries).
    static const unsigned int MaxSearch = 300; ///< Retry bound for every rejection-sampling selection loop.
    // Sum-of-complexities ceiling a candidate must stay under to be accepted
    // (busyness budget: don't stack two very busy layers at once). Complexity
    // values run 1..5 with a handful of scenes at 10; the OLD ceiling of 20
    // (ComplexityBudget) / 12 (ComplexityBudgetInitial) meant a complexity=10
    // scene only ever passed when the three OTHER slots were all near their
    // minimum simultaneously -- effectively excluding it most of the time.
    // Raised so a complexity=10 candidate stays reachable alongside a normal
    // (non-minimal) combo, while an all-four-maxed-out combo is still capped.
    static const unsigned int ComplexityBudget = 28; ///< Ceiling for the 4-term (act+next texture, act+next combine)
                                                     ///< sum used by tick()/tickFx()'s normal picks and reset()'s
                                                     ///< second (combine-inclusive) pick.
    static const unsigned int ComplexityBudgetInitial = 17; ///< Ceiling for reset()'s first, texture-only (2-term)
                                                            ///< pick, before the combine pair exists yet -- kept at
                                                            ///< the same ratio to ComplexityBudget as the original
                                                            ///< 12:20.

    // Direction: the arc onto the drop
    float m_buildUpPrev = 0.f; ///< Last frame's buildUp, for the rising edge past 0.45.
    float m_arcCooldown = 0.f; ///< Seconds until the next arc re-timing is allowed (20 s).
    float m_regieWarm = 0.f;   ///< Seconds since start; the arc regie ignores build-ups in the first 20 s (analyzer
                               ///< baselines still settling).

    // Forced changes + beat quantisation
    bool m_forceEffectChange = false; ///< Set by requestChange()/forceScene()/triggers; consumed at the next Solo-phase
                                      ///< check.
    // A MANUAL cut (key 'n', remote) may fire after a brief 0.6 s solo; a
    // musical TRIGGER (section/novelty/drop) must respect a longer minimum
    // solo, otherwise a trigger landing right after a fade completes cuts the
    // freshly faded-in scene away again after 0.6 s -- the reported
    // "a scene flashes in for a fraction of a second and is replaced".
    bool m_forceIsManual = false; ///< The pending m_forceEffectChange came from requestChange()/forceScene() (short min
                                  ///< solo), not from a musical trigger.
    bool m_forceFxChange = false; ///< Set by requestChange(alsoFx)/triggers; consumed at the next FX Solo-phase check.
    int  m_forcedNextTexture = -1; ///< Remote direct-jump target index (-1 = none); wins over review mode and random
                                   ///< pick.
    bool m_pendingEffectChange = false; ///< True while an effect change is due but waiting on beat quantisation.
    bool m_pendingEffectForced = false; ///< True if the pending effect change was manual/forced (fires immediately,
                                        ///< skips the downbeat wait).
    float m_pendingEffectAge = 0.f; ///< Seconds the pending effect change has been waiting (timeout escape at 2.5 s).
    bool  m_pendingFxChange = false;    ///< True while a combine change is due but waiting on beat quantisation.
    bool  m_pendingFxForced = false;    ///< True if the pending combine change was manual/forced.
    float m_pendingFxAge = 0.f;         ///< Seconds the pending combine change has been waiting.

    // Trigger bookkeeping
    float m_noveltyCooldown = 0.f; ///< Seconds until another harmonic-novelty/section trigger is allowed to fire (rate
                                   ///< limit).
    float m_harmCutCooldown = 0.f; ///< Seconds until another harmonic cut is allowed (45 s apart: chord changes are
                                   ///< frequent, a cut on each would be restless).
    int   m_lastSectionCount = 0;  ///< Last seen Tick::sectionCount, to detect the rising edge of a new section.
    int   m_lastDropCount = 0;     ///< Last seen Tick::dropCount, to detect the rising edge of a new drop.
    bool  m_dropInSong = false;    ///< A drop has come in this song (newSong() clears it): the phrase grid is anchored.
    float m_secsSinceDrop = 1e9f;  ///< Seconds since the last drop; the phrase grid drifts with the tempo error.
    float m_spectacleFor = 0.f;    ///< Seconds the spectacle reserve still waits for its predicted drop (0 = none).
    // A drop triggered the change: when it fires, it becomes a HARD cut
    // (music-video look) or the shatter transition instead of the normal
    // cross-fade.
    bool m_dropCutPending = false; ///< A drop triggered the pending change: when it fires, use a hard cut or the
                                   ///< shatter transition instead of a normal cross-fade.

    // Song-structure memory.  Keyed by the analyzer's section id, which
    // is a RECYCLED 8-slot LRU index: a new section of a later song inherits
    // an id some earlier, unrelated section once carried.  These maps are
    // never cleared (there is no track-change signal), so a replay decision
    // must ALSO require Tick::sectionKnown and a fresh m_sectionStamp --
    // without both, after the first ~8 sections of a session every id was
    // "known" and the scheduler replayed the same handful of scenes for the
    // rest of the evening (the reported "always the same 10-20 scenes").
    std::map<int, unsigned int> m_sectionEffect;       ///< Section id -> effect/texture index last played during that
                                                       ///< section.
    std::map<int, unsigned int>       m_sectionFx;     ///< Section id -> combine index last played during that section.
    std::map<int, std::vector<float>> m_sectionParams; ///< Section id -> snapshotted shader parameters to restore on
                                                       ///< replay.
    std::map<int, int> m_sectionStamp; ///< Section id -> Tick::sectionCount at store time (staleness guard: no replay
                                       ///< across songs).
    /// Section id -> when it was stored: without a title source to say where a song ends, a look older than 8
    /// minutes is no longer this song's (the sections alone span several songs: 2-10 per track).
    std::map<int, ClockT::time_point> m_sectionTime;

    // Recently shown scenes.  The random roll only ever excluded the scene
    // on screen, so any filter that narrowed the pool (the build-up rule
    // preferring staged scenes, the mood test) could bring one scene back
    // every few minutes.  The memory holds three quarters of the preset's
    // scenes (by shader file) and is refused during the first two thirds of
    // the search; a section replay and a manual pick bypass it -- those repeat
    // on purpose.  It used to hold at most 40 scenes, so every scene came back
    // two or three times a day; now a preset of 400 scenes runs some five
    // hours before one returns, and the memory survives a restart.
    RecentScenes             m_recent;         ///< The no-repeat memory (shader file names, oldest first).
    std::vector<std::string> m_pendingHistory; ///< Memory from a previous run, taken over by reset().
    std::function<void( const std::vector<std::string> & )> m_onHistory; ///< Stores the memory (setHistoryCallback()).
    /**  True if texture @p idx is inside the no-repeat memory.
     *
     * @param idx  Texture index into the attached texture list. (in)
     *
     * @return
     *   True if a scene of the same shader file was shown within the memory's span.
     **/
    bool isRecentTexture( unsigned int idx ) const;
    /**  Records that texture @p idx has come on screen: a hand-made scene goes into the no-repeat memory, a walking
     * lab becomes the last lab (the next lab is another file).
     *
     * @param idx  Texture index that has just become the active scene. (in)
     **/
    void noteTextureShown( unsigned int idx );
    /**  Rolls the scene to follow scene @p act: a walking lab when the lab clock calls for one, otherwise a hand-made
     * scene outside the no-repeat memory.
     *
     * @param act      The scene it follows; -1 for the first scene of the session. (in)
     * @param initial  The picks of reset(): no mood test, and the looser texture-only complexity budget
     *                 (ComplexityBudgetInitial) instead of the four-term one. (in)
     *
     * @return
     *   The texture index; never @p act while the pool holds another scene.
     **/
    unsigned int pickScene( int act, bool initial );
    /**  Rolls a scene for a predicted drop to cut to: a hand-made 2D scene of interest >= #SpectacleInterest, outside
     * the no-repeat memory, within the complexity budget, through useShader() and moodAccept().
     *
     * @param act  The scene on screen. (in)
     *
     * @return
     *   The texture index, or -1 when the preset has none (no interest in its entries) or none passed.
     **/
    int pickSpectacle( int act );
    /** The show value a scene needs to be a drop's target (pickSpectacle()). */
    static const int SpectacleInterest = 8;

    // The walking chain labs' share of the screen time (setLabShare()).
    LabShareClock     m_labClock;              ///< Lab time against all time, and the share the preset asks for.
    std::vector<char> m_isLab;                 ///< Per texture index: a walking chain lab (built by reset()).
    bool              m_labsScheduled = false; ///< A share was asked for and the preset has labs: the clock decides.
    size_t            m_labFiles = 0;          ///< Distinct lab files among the labs (the next lab is another one).
    std::string       m_lastLab;               ///< File name of the lab shown last.
    float             m_shownSecs = 0.f;       ///< Screen time of the scene on screen so far (its solo and its fade).
    static const int  SectionMemorySpan = 24;  ///< Max sectionCount distance for a replay (sections are >= ~12 s apart,
                                               ///< so ~5+ min -- within one song, not across the set).
    int m_pendingSectionStore = -1;   ///< Section id whose final look should be stored at the next fade-end (-1 = none
                                      ///< pending).
    int m_pendingSectionRestore = -1; ///< Section id whose stored look should be restored at the next fade-start (-1 =
                                      ///< none pending).
    // A recurring section's replay target arriving WHILE a fade is already in
    // flight must not overwrite m_nextTexture/m_nextFx directly -- the render
    // pipeline reads nextTexture()/nextFx() fresh every frame, so that would
    // silently swap the incoming scene under an already-rolled transition
    // (the reported "jump to a completely different scene right after a
    // switch"). Deferred here instead and applied at the next fade-END, the
    // same mid-fade-safe pattern forceScene() already uses via m_forcedNextTexture.
    int m_pendingSectionNext = -1;   ///< Deferred effect-slot replay target texture index (-1 = none pending).
    int m_pendingSectionNextId = -1; ///< Section id owning m_pendingSectionNext, so its stored params still get
                                     ///< restored at that fade's start.
    int m_pendingSectionNextFx = -1; ///< Deferred combine-slot replay target index (-1 = none pending).

    // Review mode
    bool  m_reviewMode = false;       ///< True while walking scenes alphabetically instead of picking randomly.
    float m_sceneFadeMin = 0.f;       ///< Preset-wide floor on natural scene fades (seconds); 0 = none. See
                                      ///< setSceneFadeMin().
    std::vector<int> m_reviewOrder;   ///< Texture indices sorted alphabetically by fragment basename (built lazily).
    int              m_reviewPos = 0; ///< Current position within m_reviewOrder.

    // Transition choice (one shader per fade, from Transitions/)
    unsigned int m_actTransition = 0; ///< Transition shader rolled for the effect slot's current/last fade.

    // Mood snapshot for moodAccept
    float m_lastArousal = 0.5f; ///< Last mood arousal snapshot (0..1) from setMood().
    float m_lastValence = 0.5f; ///< Last mood valence snapshot (0..1) from setMood().
    float m_lastAmbient = 0.f;  ///< Last mood ambient-level snapshot (0..1) from setMood().

    std::function<float( const char * )> m_tasteFor; ///< Learned-taste callback (fragment path -> multiplier); unset
                                                     ///< means neutral 1.0 for everything.
public:
    /** Default construction, which the declared copy operations would otherwise suppress. */
    SceneScheduler() = default;

private:
    /** Not copyable (CGVR template: copy constructor and assignment are always declared). */
    SceneScheduler( const SceneScheduler & ) = delete;
    /**  Not assignable; see the copy constructor.
     *
     * @return
     *   Nothing: the operator is deleted, so no call compiles.
     **/
    SceneScheduler &operator=( const SceneScheduler & ) = delete;
};

#endif
