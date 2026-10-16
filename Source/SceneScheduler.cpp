/*****************************************************************************\
 *                              SceneScheduler
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Implementation of SceneScheduler: initial random pick, the effect/combine Solo-Fade state machines, musical
 *  trigger handling, and the mood-weighted rejection-sampling selection.
 *
 *  @author René Weller
 */

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <cstring>

#include "SceneScheduler.h"
#include "EffectShader.h"

/**  Enable/disable review mode (alphabetical walk, fixed ReviewSoloSecs per scene).
 *
 * The parameter is documented in SceneScheduler.h. Besides flipping the
 * mode, this publishes the span to EffectShader (ReviewSoloSecs while on,
 * 0 when off) so `sceneProgress` normalises over the time a scene is
 * actually SHOWN here rather than over its rolled solo span -- otherwise a
 * staged scene never finishes its arc on the bench.
 **/
void SceneScheduler::setReviewMode( bool on )
{
    m_reviewMode = on;
    EffectShader::M_ReviewSolo = on ? ReviewSoloSecs : 0.f;
}

// Basename of a fragment path, and a case-insensitive comparison of two (the review order).
/**  Return the basename (after the last slash/backslash) of a fragment path.
 *
 * @param p  Path string (may be null). (in)
 *
 * @return
 *   Pointer into @p p at the basename, or "?" if @p p is null.
 **/
static const char *fragBase( const char *p )
{
    if ( !p )
        return "?";
    const char *b = p;
    for ( const char *c = p; *c; ++c )
        if ( *c == '\\' || *c == '/' )
            b = c + 1;
    return b;
}

/**  Which review BLOCK a scene belongs to: the flat scenes first, the 3D ones after.
 *
 * @param p  Fragment path. (in)
 *
 * @return
 *   0 for Scene2D (and anything else), 1 for Scene3D.
 *
 *  A review pass compares like with like. Walking one alphabetical list across
 *  both folders interleaves a fullscreen fractal with a lit 3D model every
 *  couple of scenes, and the eye spends its time re-adjusting instead of
 *  judging. Two blocks, each alphabetical inside, keeps the comparison honest.
 **/
static int reviewBlock( const char *p )
{
    return ( p && ( strstr( p, "Scene3D" ) || strstr( p, "scene3d" ) ) ) ? 1 : 0;
}

/**  Case-insensitive "basename of a < basename of b" comparator for the review-mode sort.
 *
 * @param a  First fragment path. (in)
 * @param b  Second fragment path. (in)
 *
 * @return
 *   True if basename(a) sorts before basename(b).
 **/
static bool baseLess( const char *a, const char *b )
{
    const int ba = reviewBlock( a ), bb = reviewBlock( b );
    if ( ba != bb )
        return ba < bb;
    const char *x = fragBase( a ), *y = fragBase( b );
    while ( *x && *y )
    {
        int cx = std::tolower( static_cast<unsigned char>( *x ) ),
            cy = std::tolower( static_cast<unsigned char>( *y ) );
        if ( cx != cy )
            return cx < cy;
        ++x;
        ++y;
    }
    return *y != 0;
}

/**  Roll the initial act/next effect and combine picks and start both clocks.
 *
 * Mirrors the old inline start() block, including its slightly different
 * (looser) complexity budgets for the very first pick: 12 for the texture
 * pair alone, 20 once the combine pair is added in. Each pick is a bounded
 * rejection-sampling loop (up to #MaxSearch tries) that requires useShader()
 * and, for "next", a distinct index from "act" within the complexity budget
 * (pickScene()). Before the picks it sorts the walking chain labs out of the
 * ordinary pool (when the preset asks for a lab share), sizes the no-repeat
 * memory and takes over the memory a previous run left (setHistory()), so
 * the first scenes of a session come from outside it too.
 **/
void SceneScheduler::reset()
{
    const std::vector<EffectShader *> &tex = *m_textures;
    // Which entries are walking chain labs, and how many hand-made scenes the
    // preset has (by shader file: a mesh family is one scene).  The memory
    // holds three quarters of them and leaves at least two free.
    m_isLab.assign( tex.size(), 0 );
    std::vector<std::string> regular, labs;
    for ( unsigned int i = 0; i < tex.size(); ++i )
    {
        const std::string name = fragBase( tex[i]->fragmentName() );
        m_isLab[i] = tex[i]->isWalkingLab() ? 1 : 0;
        std::vector<std::string> &into = ( m_isLab[i] && m_labClock.target() > 0.f ) ? labs : regular;
        if ( std::find( into.begin(), into.end(), name ) == into.end() )
            into.push_back( name );
    }
    m_labsScheduled = !labs.empty();
    m_labFiles = labs.size();
    const size_t n = regular.size();
    m_recent.setCapacity( n > 2 ? std::min( n * 3 / 4, n - 2 ) : 0 );
    m_recent.assign( m_pendingHistory );
    m_pendingHistory.clear();
    m_lastLab.clear();
    m_shownSecs = 0.f;
    if ( m_labsScheduled )
        fprintf( stderr,
                 "SCHED %zu scenes, no-repeat memory %zu (%zu stored); %zu lab file(s) at %.0f %% of the time\n", n,
                 m_recent.capacity(), m_recent.size(), m_labFiles, 100.f * m_labClock.target() );

    // Initial random pick - the old start() block (including the slightly
    // different complexity budgets 12 and 20 of the first pick).
    m_actTexture = pickScene( -1, true );
    noteTextureShown( m_actTexture );
    m_nextTexture = pickScene( static_cast<int>( m_actTexture ), true );

    // KALEIDO_SEED: the first scene rolls its own seeded stream too.  It does not
    // pass through resetParameters() otherwise, and keeps the rolls made while
    // loading -- from the global stream, which depends on how many presets were
    // loaded before it (another hidden preset in the folder changed the roll).
    static const bool Seeded = getenv( "KALEIDO_SEED" ) != nullptr;
    if ( Seeded )
        ( *m_textures )[m_actTexture]->resetParameters();
    m_texFadeDur = static_cast<float>( ( *m_textures )[m_actTexture]->getTimeSolo() );

    for ( unsigned int i = 0; i < MaxSearch; ++i )
    {
        m_actFx = rand() % m_fxShaders->size();
        if ( ( *m_fxShaders )[m_actFx]->useShader() )
            break;
    }
    // NOTE: unlike the texture pick above, this deliberately does NOT exclude
    // m_nextFx == m_actFx -- see the long comment on the identical pick in
    // tickFx()'s fade-end for why forbidding a dominant-probability FX (e.g.
    // FxPlain at probability=1.0) from following itself mathematically caps
    // it at ~50%, regardless of its configured probability.
    for ( unsigned int i = 0; i < MaxSearch; ++i )
    {
        m_nextFx = rand() % m_fxShaders->size();
        if ( ( ( ( *m_textures )[m_actTexture]->getComplexity() + ( *m_textures )[m_nextTexture]->getComplexity()
                 + ( *m_fxShaders )[m_actFx]->getComplexity() + ( *m_fxShaders )[m_nextFx]->getComplexity() )
               < ComplexityBudget )
             && ( *m_fxShaders )[m_nextFx]->useShader() )
            break;
    }

    if ( Seeded )
        ( *m_fxShaders )[m_actFx]->resetParameters();
    m_fxFadeDur = static_cast<float>( ( *m_fxShaders )[m_actFx]->getTimeSolo() );

    m_texState = 0;
    m_fxState = 0;
    m_texInterp = 1.f;
    m_fxInterp = 1.f;
    restart( m_clockEffectTexture );
    restart( m_clockEffectFx );
}

// Remote scene browser: jump DIRECTLY to scene idx (the same immediate path
// as a manual 'n' cut, but with a chosen target instead of a random roll).
/**  Jump directly to effect index @p idx (remote scene browser).
 *
 * Takes the same immediate path as a manual 'n' cut (forceEffectChange).
 * m_nextTexture is decided one fade cycle in advance (rolled/forced at the
 * PREVIOUS fade's end, see tick()'s fade-end branch) -- while idle (Solo),
 * that value is just sitting there waiting for the next fade to start, so
 * it is safe and correct to overwrite it right here for an immediate jump
 * to @p idx. Mid-fade, the current fade is already committed to its
 * outgoing/incoming pair (retargeting it would jump the interpolation), so
 * @p idx is instead queued in m_forcedNextTexture and only applied once
 * that fade finishes, exactly as before. The parameter is documented in
 * SceneScheduler.h (an out-of-range @p idx or a missing attach() is
 * silently ignored).
 **/
void SceneScheduler::forceScene( int idx )
{
    if ( !m_textures || idx < 0 || idx >= static_cast<int>( m_textures->size() ) )
        return;
    if ( m_texState == 0 )
    {
        m_nextTexture = idx;
        m_forcedNextTexture = -1;
    }
    else
        m_forcedNextTexture = idx;
    m_forceEffectChange = true;
    m_forceIsManual = true;
}

/**  Force the next combine-effect (overlay) to @p idx.
 *
 * The parameter is documented in SceneScheduler.h (an out-of-range @p idx
 * or a missing attach() is ignored).
 * Bypasses the complexity budget, the mood filter and the mesh-calm rule:
 * an FX sweep exists to SEE the one that was asked for, including the ones
 * those filters would normally veto.
 **/
void SceneScheduler::forceFx( int idx )
{
    if ( !m_fxShaders || idx < 0 || idx >= static_cast<int>( m_fxShaders->size() ) )
        return;
    m_forcedNextFx = idx;
    m_forceFxChange = true;
}

/**  Tells whether a combine/FX shader is "calm" enough to run over a loaded mesh model.
 *
 * @param fragPath  Fragment-shader path of the FX candidate (EffectShader::fragmentName(); any directory prefix,
 *                  either separator) -- only its basename is compared. nullptr yields false. (in)
 *
 * @return
 *   True if the basename is on the calm allow-list, false for every other or unknown FX.
 *
 * FX that are welcome over a loaded model. The first cut of this rule forced
 * FxPlain outright, which threw away every harmless overlay along with the
 * harmful ones; what actually matters is only whether the overlay DISPLACES
 * the scene image over time (zoom pulses, shakes, warps, wobbles -- a
 * full-frame displacement moves the model with it, which reads as the object
 * twitching). Colour grades, halftone/mosaic stylisations, depth fog, rim
 * light and godrays sample the scene at rest and may pulse their LIGHT as
 * much as they like -- that is the background carrying the beat, by design.
 * Classified by reading all 29 fragment sources; a new FX defaults to NOT
 * calm until someone reads it and adds it here -- the safe direction.
 * Deliberately absent: FxLens (displaces even if statically) and
 * FxOilPaintFlow (its brush field flows over time).
 **/
static bool isMeshCalmFx( const char *fragPath )
{
    if ( !fragPath )
        return false;
    const char *base = fragPath;
    for ( const char *q = fragPath; *q; ++q )
        if ( *q == '\\' || *q == '/' )
            base = q + 1;
    static const char *calm[] = {
        "FxPlain.frag",
        "FxGrey.frag",
        "FxDarkRed.frag",
        "FxAmbientOcclusion.frag",
        "FxDepthField.frag",
        "FxDepthFog.frag",
        "FxEdgeInk.frag",
        "FxRimLight.frag",
        "FxSunShafts.frag",
        "FxLichtenstein.frag",
        "FxOilPaint.frag",
        "FxHexagon.frag",
    };
    for ( const char *c : calm )
        if ( strcmp( base, c ) == 0 )
            return true;
    return false;
}

/**  Find a registered transition shader by fragment basename.
 *
 * Parameter and return value are documented in SceneScheduler.h (e.g.
 * "Crossfade.frag"; -1 if not registered). Compares only the basename
 * (text after the last path separator, either '\\' or '/') so the
 * dramaturgy hooks ("Shatter.frag" on a drop, the Portal depth gate) stay
 * independent of how the preset spelled the path.
 **/
int SceneScheduler::findTransition( const char *basename ) const
{
    if ( !m_transitions || !basename )
        return -1;
    for ( unsigned int i = 0; i < m_transitions->size(); ++i )
    {
        const char *frag = ( *m_transitions )[i]->fragmentName();
        if ( !frag )
            continue;
        const char *b = frag;
        for ( const char *p = frag; *p; ++p )
            if ( *p == '\\' || *p == '/' )
                b = p + 1;
        if ( strcmp( b, basename ) == 0 )
            return static_cast<int>( i );
    }
    return -1;
}

/**  Tells whether texture @p idx was shown within the no-repeat memory.
 *
 * The memory holds three quarters of the preset's scenes and leaves at least
 * two free, so a small preset still has scenes to choose from.  Parameter and
 * return value are documented in SceneScheduler.h.
 **/
bool SceneScheduler::isRecentTexture( unsigned int idx ) const
{
    // By SHADER, not by entry: a mesh family registers one entry per model
    // (ShipFlyby 29, Hologram 26, ...), and "ShipFlyby again, other ship"
    // is still ShipFlyby again -- the probe run showed it nine times in
    // twelve minutes while every single entry was inside the window.
    const std::vector<EffectShader *> &tex = *m_textures;
    if ( idx >= tex.size() )
        return false;
    return m_recent.contains( fragBase( tex[idx]->fragmentName() ) );
}

/**  Records that texture @p idx is on screen.
 *
 * A walking lab under a lab share stays out of the memory -- the labs never
 * run out, and the memory would hold them back for hours -- and only becomes
 * the last lab, so the next lab is another file.  The parameter is documented
 * in SceneScheduler.h.
 **/
void SceneScheduler::noteTextureShown( unsigned int idx )
{
    const std::vector<EffectShader *> &tex = *m_textures;
    if ( idx >= tex.size() )
        return;
    const char *name = fragBase( tex[idx]->fragmentName() );
    if ( m_labsScheduled && idx < m_isLab.size() && m_isLab[idx] )
        m_lastLab = name;
    else
        m_recent.push( name );
}

/**  Rolls the scene to follow scene @p act.
 *
 * Without a lab share every entry is in the pool, exactly as before (the
 * random stream is untouched).  With one the lab clock first decides between
 * the walking labs and the hand-made scenes, and only that pool is searched:
 * a lab that is not the last lab's file, or a scene outside the no-repeat
 * memory -- both conditions for the first two thirds of the search only, so a
 * narrow pool still finds a scene.  The other conditions are the old ones:
 * not @p act, the complexity budget, useShader() and moodAccept().
 * Parameters and return value are documented in SceneScheduler.h.
 **/
unsigned int SceneScheduler::pickScene( int act, bool initial )
{
    const std::vector<EffectShader *> &tex = *m_textures;
    const std::vector<EffectShader *> &comb = *m_fxShaders;
    const unsigned int                 n = static_cast<unsigned int>( tex.size() );
    if ( n == 0 )
        return 0;
    const bool                act_lab = act >= 0 && static_cast<unsigned int>( act ) < m_isLab.size() && m_isLab[act];
    const bool want_lab = m_labsScheduled
                          && m_labClock.wantLab( act_lab,
                                                 static_cast<float>( rand() ) / static_cast<float>( RAND_MAX ) );
    std::vector<unsigned int> pool;
    if ( m_labsScheduled )
        for ( unsigned int i = 0; i < n && i < m_isLab.size(); ++i )
            if ( ( m_isLab[i] != 0 ) == want_lab )
                pool.push_back( i );

    unsigned int pick = 0;
    for ( unsigned int i = 0; i < MaxSearch; ++i )
    {
        pick = pool.empty() ? rand() % n : pool[rand() % pool.size()];
        // Nothing from the memory (a lab: not the last lab's file), unless the
        // search is running dry (a small preset, a narrow filter).
        if ( i < MaxSearch * 2 / 3
             && ( want_lab ? ( m_labFiles > 1 && m_lastLab == fragBase( tex[pick]->fragmentName() ) )
                           : isRecentTexture( pick ) ) )
            continue;
        // No more preference for STAGED scenes (sceneProgress) when the
        // tension rises (29.09.2026).  The rule was meant to lay their climax
        // onto the drop, but pulled forward exactly the scenes that tend to be
        // the calm, boring ones in the programme -- 51 % of all changes for
        // 12 % of the catalogue.  If a staged scene happens to be running,
        // setClimaxIn() still bends its arc onto the drop; it is not picked
        // for it.
        if ( static_cast<int>( pick ) == act )
            continue;
        if ( act >= 0 )
        {
            const unsigned int sum = initial ? tex[act]->getComplexity() + tex[pick]->getComplexity()
                                             : tex[act]->getComplexity() + tex[pick]->getComplexity()
                                                   + comb[m_actFx]->getComplexity() + comb[m_nextFx]->getComplexity();
            if ( sum >= ( initial ? ComplexityBudgetInitial : ComplexityBudget ) )
                continue;
        }
        if ( tex[pick]->useShader() && ( initial || moodAccept( tex[pick] ) ) )
            break;
    }
    // Unlucky to the end on the scene on screen: the next one of the pool.
    if ( static_cast<int>( pick ) == act )
    {
        if ( pool.size() > 1 )
            pick = pool[( static_cast<size_t>( std::find( pool.begin(), pool.end(), pick ) - pool.begin() ) + 1 )
                        % pool.size()];
        else if ( pool.empty() )
            pick = ( pick + 1 ) % n;
    }
    if ( want_lab )
        fprintf( stderr, "SCHED lab share %.0f %% (asked %.0f %%) -> %s\n", 100.f * m_labClock.share(),
                 100.f * m_labClock.target(), tex[pick]->fragmentName() );
    return pick;
}

// Mood-based selection bias - two components:
//   1. Busyness: the shader's complexity should roughly match the arousal.
//   2. Mood TAGS (config mood="dark,bright,calm,aggressive"): bonus on a
//      match, malus on a clear contradiction; untagged shaders stay
//      neutral.  Probabilistic - a bias, not a hard filter.
/**  Probabilistic mood-based accept test for a selection candidate.
 *
 * Combines three signals into an acceptance probability, then rolls a
 * uniform random draw against it: (1) busyness match, how close the
 * shader's complexity is to an arousal-derived target of 1..10; (2) the
 * learned taste multiplier from tasteOf(); (3) mood-tag bonus/malus for
 * bright/dark/aggressive/calm tags weighted by valence/arousal/ambient.
 * A floor (0.05..0.15, scaled down further for disliked shaders) keeps
 * every shader reachable — this is a bias, never a hard exclusion.
 * Parameter and return value are documented in SceneScheduler.h: @p s is
 * the candidate effect or combine shader, and the result is true when the
 * uniform random draw falls below the computed acceptance probability.
 **/
bool SceneScheduler::moodAccept( EffectShader *s ) const
{
    float target = 1.f + m_lastArousal * 9.f; // desired busyness 1..10
    float diff = fabsf( static_cast<float>( s->getComplexity() ) - target ) / 9.f;
    float accept = 1.f - 0.6f * diff; // closer match -> likelier

    // Learned taste (skip-malus / favourite-bonus, persisted by the caller).
    accept *= tasteOf( s->fragmentName() );

    unsigned int f = s->moodFlags();
    if ( f )
    {
        float bonus = 0.f;
        if ( f & EffectShader::MOOD_BRIGHT )
            bonus += ( m_lastValence - 0.5f ) * 0.8f;
        if ( f & EffectShader::MOOD_DARK )
            bonus += ( 0.5f - m_lastValence ) * 0.8f;
        if ( f & EffectShader::MOOD_AGGRESSIVE )
            bonus += ( m_lastArousal - 0.5f ) * 0.8f + ( 0.3f - m_lastAmbient ) * 0.4f;
        if ( f & EffectShader::MOOD_CALM )
            bonus += ( 0.5f - m_lastArousal ) * 0.6f + ( m_lastAmbient - 0.3f ) * 0.6f;
        accept += bonus;
    }
    // Floor keeps every shader reachable (never a hard exclusion); a disliked
    // shader gets a lower floor, but never zero.
    float floorv = 0.15f * std::min( tasteOf( s->fragmentName() ), 1.f );
    if ( floorv < 0.05f )
        floorv = 0.05f;
    if ( accept < floorv )
        accept = floorv;
    return ( static_cast<float>( rand() ) / static_cast<float>( RAND_MAX ) ) < accept;
}

/**  Evaluate musical triggers, then advance the effect (texture) Solo/Fade state machine.
 *
 * Trigger handling (novelty, section change with song-structure memory,
 * drop, pin) runs first and only sets/clears the forced-change flags; the
 * actual Solo/Fade transition logic follows and is symmetric with
 * tickFx()'s combine version. Key subtleties:
 *  - Novelty and section triggers are rate-limited by m_noveltyCooldown
 *    (~8 s) so they don't fight the beat-quantised pending mechanism; a
 *    harmonic cut needs a strong jump (> 0.95) and comes at most every 45 s
 *    (the chord changes themselves move the scenes and the labs' walk).
 *  - A recognised, already-known section whose stored shader is already on
 *    screen deliberately does NOT re-apply its stored parameters immediately
 *    (that used to cause a hard mid-shot jump); it only replays them the
 *    NEXT time that shader is faded into, via m_pendingSectionRestore.
 *  - Pending changes are held until the next downbeat (beat quantisation),
 *    but escape via a 2.5 s timeout or a low music-presence gate; a forced
 *    change fires as soon as a short minimum solo time has elapsed (0.6 s
 *    for a person's cut, 2 s for a musical trigger), so cuts never come
 *    back-to-back.  In a calm preset (setSceneFadeMin) a musical trigger is
 *    no forced change: it waits for 20 s of solo and then fades like a
 *    natural change.
 *  - The cross-fade duration is normally the shorter of the two shaders'
 *    configured interpolation times, optionally clamped to ~4 beats when
 *    rhythm confidence is high, then shortened further for staccato
 *    material (logAttackTime). A drop cut overrides all of that afterwards
 *    with either a near-instant hard cut or the shatter transition.
 *  - Section-memory parameter restore happens at FADE START (not fade end)
 *    so the incoming shader blends in already showing the stored look,
 *    instead of snapping to it the instant the fade completes.
 **/
void SceneScheduler::tick( const Tick &t )
{
    std::vector<EffectShader *> &tex = *m_textures;
    std::vector<EffectShader *> &comb = *m_fxShaders;

    // Musical novelty: a strong harmonic / section change (a drop, a key
    // change) forces an early cross-fade - rate-limited, only while music
    // actually plays.
    // A trigger that lands WHILE a cross-fade is already running must not
    // queue a SECOND change: the fade in flight already is the scene change
    // the music asked for.  Forcing another one made the freshly faded-in
    // scene get cut away again after the 0.6 s minimum solo -- the reported
    // "scene flashes in for a fraction of a second and is replaced".
    const bool mid_fade = ( m_texState != 0 );

    // Screen time of the scene on screen, for the lab clock (a stall counts
    // at most a second: the books are kept for hours, not frames).
    if ( t.dt > 0.f )
        m_shownSecs += t.dt < 1.f ? t.dt : 1.f;

    // Only a strong harmonic jump (a key change, an abrupt new harmony) cuts,
    // and at most every 45 s: since the harmonic change measures chord changes
    // (16.10.2026) a song's every chord crossed the old 0.5, which would have
    // cut its scene every 8 s.  The chord changes themselves go to the scenes
    // and the chain labs' walk.
    m_noveltyCooldown -= t.dt;
    m_harmCutCooldown -= t.dt;
    if ( !m_reviewMode && m_noveltyCooldown <= 0.f && m_harmCutCooldown <= 0.f
         && t.harmonicChange * t.musicPresence > 0.95f )
    {
        if ( !mid_fade )
            m_forceEffectChange = true;
        m_noveltyCooldown = 8.0f; // at most one musical cut every ~8 s
        m_harmCutCooldown = 45.f;
    }
    // DIRECTION: lay the arc onto the drop.  When the tension rises (buildUp
    // above 0.45, rising edge) and a STAGED scene is running (sceneProgress /
    // rig progress), its progress is bent so that the climax lands on the
    // next 8-bar boundary -- that is where the drop falls in dance music.
    // An assembly's last piece then settles on the beat instead of at some
    // point.  Continuous (no jump back), only when the prediction lies in
    // 4..45 s, at most every 20 s.
    m_arcCooldown -= t.dt;
    m_regieWarm += t.dt;
    // After a drop the groove comes back, and the analyzer reads exactly that
    // return as a build-up (edges at 238/243 s after a jump at 222 s on DMT).
    // An arc for a drop that is already over is none: 15 s of rest after
    // every drop.
    if ( t.dropCount != m_lastDropCount )
        m_arcCooldown = ( m_arcCooldown > 15.f ) ? m_arcCooldown : 15.f;
    // For the first 20 s the analyzer reads EVERY groove as a build-up (its
    // 10 s baselines are still climbing: buildUp 0.67 in the intro, 0.43 in
    // the real build-up).  The analyzer itself spares its drop arming the
    // same way.
    if ( !m_reviewMode && m_regieWarm > 20.f && t.buildUp > 0.45f && m_buildUpPrev <= 0.45f
         && m_arcCooldown <= 0.f && t.phraseSecsLeft >= 4.f && t.phraseSecsLeft <= 45.f
         && m_actTexture < tex.size() && tex[m_actTexture]->usesProgress() )
    {
        tex[m_actTexture]->setClimaxIn( t.phraseSecsLeft );
        m_arcCooldown = 20.f;
        fprintf( stderr, "REGIE: Bogen auf den Drop in %.1f s (%s)\n",
                 t.phraseSecsLeft, tex[m_actTexture]->fragmentName() );
    }
    m_buildUpPrev = t.buildUp;

    // SECTION change (verse -> chorus -> bridge) + song-structure memory: a
    // RECURRING section (chorus #2 = chorus #1) plays the shader, combine and
    // exact parameters of back then; a NEW one rolls fresh and its look is
    // stored under the id after the change.
    if ( !m_reviewMode && t.sectionCount == m_lastSectionCount + 1 )
    {
        int  id = t.sectionId;
        auto it = m_sectionEffect.find( id );
        // "Known" needs all three: the analyzer RECOGNISED the section by
        // fingerprint (the id alone is a recycled LRU slot and says nothing),
        // we have a look stored under that id, and that look is fresh (stored
        // within this song, not inherited from a set played an hour ago).
        auto st = m_sectionStamp.find( id );
        auto tm = m_sectionTime.find( id );
        bool fresh = st != m_sectionStamp.end()
                     && ( t.sectionCount - st->second ) <= SectionMemorySpan
                     && tm != m_sectionTime.end() && secsSince( tm->second ) < 480.f;
        bool known = t.sectionKnown && ( id >= 0 ) && it != m_sectionEffect.end()
                     && it->second < tex.size() && fresh;
        fprintf( stderr, "SCHED section id=%d %s%s -> %s\n", id,
                 t.sectionKnown ? "recognised" : "new",
                 ( t.sectionKnown && !known ) ? " (no fresh memory)" : "",
                 known ? "replay" : "fresh roll" );
        if ( known && it->second == m_actTexture )
        {
            // The right shader is already on screen.  Formerly the stored
            // parameters were applied here AT ONCE - a hard, unblended jump
            // to a completely different look in the middle of the running
            // picture.  Visual continuity beats replay fidelity: the current
            // look simply stays.
        }
        else
        {
            if ( known )
            {
                auto ic = m_sectionFx.find( id );
                int  fx_target = ( ic != m_sectionFx.end()
                                   && ic->second < comb.size()
                                   && ic->second != m_actFx )
                                     ? static_cast<int>( ic->second )
                                     : -1;

                // Texture/scene slot and combine/FX slot are TWO INDEPENDENT
                // state machines with their own Solo/Fade timing (tick() vs
                // tickFx()) -- each retarget must be guarded by ITS OWN state,
                // not the other one's. Retargeting m_nextTexture while
                // m_texState==1 (or m_nextFx while m_fxState==1) makes the
                // already-visible, currently-blending fade silently swap to a
                // DIFFERENT destination than the one it was rolled for -- the
                // reported "jump to a completely different scene/effect right
                // after a switch" (this exact bug previously existed for BOTH
                // slots sharing one m_texState guard, which incorrectly let a
                // mid-fade COMBINE retarget through whenever the unrelated
                // TEXTURE slot happened to be idle at that moment).
                if ( !mid_fade )
                {
                    m_nextTexture = it->second;   // replay that section's shader
                    m_pendingSectionRestore = id; //   ... with its exact params
                }
                else
                {
                    // Mid-fade: becomes the target of the NEXT change (applied at
                    // this fade's end), but does NOT force that change early --
                    // the scene now fading in gets its full solo first.
                    m_pendingSectionNext = static_cast<int>( it->second );
                    m_pendingSectionNextId = id;
                }

                if ( fx_target >= 0 )
                {
                    if ( m_fxState == 0 )
                    {
                        m_nextFx = fx_target;
                        m_forceFxChange = true;
                    }
                    else
                    {
                        m_pendingSectionNextFx = fx_target;
                        m_forceFxChange = true; // consumed once tickFx() is back in Solo, by which point the deferred
                                                // m_nextFx has already been applied at its fade-end
                    }
                }
            }
            else
            {
                m_pendingSectionStore = id; // remember the new look
                // A stale deferred replay (from a section that is over now)
                // must not surface at the next fade-end.
                m_pendingSectionNext = -1;
                m_pendingSectionNextId = -1;
                if ( ( t.sectionCount & 1 ) == 0 )
                    m_forceFxChange = true; // bigger scenery change
            }
            if ( !mid_fade )
                m_forceEffectChange = true;
        }
        m_noveltyCooldown = 8.0f; // hold off the harmonic hook right after
    }
    m_lastSectionCount = t.sectionCount;

    // DROP: immediate scene cut (still beat-quantised by the pending machinery,
    // but a drop IS a downbeat-scale accent).
    if ( !m_reviewMode && t.dropCount == m_lastDropCount + 1 )
    {
        if ( mid_fade )
        {
            // The change is already under way: land it ON the drop as a hard
            // cut (finish the running fade within ~0.15 s) instead of queuing
            // a second cut right behind it.
            float ts = secsSince( m_clockEffectTexture );
            if ( m_sceneFadeMin <= 0.f && m_texFadeDur > ts + 0.15f )
                m_texFadeDur = ts + 0.15f;
        }
        else
        {
            m_forceEffectChange = true;
            m_dropCutPending = true;
        }
        m_noveltyCooldown = 8.0f;
    }
    m_lastDropCount = t.dropCount;

    // VJ PIN ('u'): suppress every forced cut while the current look is held.
    if ( t.pinned )
    {
        m_forceEffectChange = false;
        m_forceIsManual = false;
        m_forceFxChange = false;
        m_dropCutPending = false;
        // A pending section store/restore must not attach to some LATER,
        // unrelated switch after unpinning - drop it.
        m_pendingSectionStore = -1;
        m_pendingSectionRestore = -1;
        m_pendingSectionNext = -1;
        m_pendingSectionNextId = -1;
        m_pendingSectionNextFx = -1;
    }

    // A chain lab walking with the music takes the music's cues itself: a new
    // section, a drop or a harmonic change walks its chain on (EffectShader::
    // stepChainWalk) instead of cutting the scene away, so one lab can carry a
    // whole set.  A manual change ('n', the remote) still goes through, and the
    // entry's solo time still ends the scene.
    if ( m_texState == 0 && m_actTexture < tex.size() && tex[m_actTexture]->walksWithMusic()
         && !m_forceIsManual )
    {
        m_forceEffectChange = false;
        m_dropCutPending = false;
    }

    // ---- Effect state machine: Solo ----
    if ( m_texState == 0 )
    {
        m_texInterp = 1.0;

        float ts = secsSince( m_clockEffectTexture );

        // REVIEW MODE: a fixed span per scene, regardless of config/music
        // pacing -- long enough to actually judge a scene's motion, which is
        // why it is a named constant rather than a number buried here.
        if ( m_reviewMode && m_texFadeDur > ReviewSoloSecs )
            m_texFadeDur = ReviewSoloSecs;

        // End the solo early on a manual ('n') or trigger-driven request, but
        // only after a minimum so cuts never come back-to-back.  A human
        // pressing 'n' gets 0.6 s; a musical trigger (section/novelty/drop)
        // landing right after a fade completed must let the new scene stand
        // for a real shot first -- 0.6 s read as "flashes in, gets replaced".
        // In a calm preset (timeSceneFadeMin) a musical trigger may end a scene
        // only after a real stay (20 s), and then as a natural change: on the
        // beat, with the preset's calm fade.  As a forced change it took the
        // 0.8 s cut of a key press and skipped the fade floor -- with the
        // section detector firing every 12 s on ambient music (16.10.2026),
        // Ambient cut its scenes every quarter of a minute.  A person's cut
        // stays a cut.
        bool       forced = m_forceEffectChange;
        const bool calm_trigger = forced && !m_forceIsManual && m_sceneFadeMin > 0.f;
        float      min_solo = m_forceIsManual ? 0.6f : ( m_sceneFadeMin > 0.f ? 20.f : 2.0f );
        if ( ts > m_texFadeDur || ( forced && ts > min_solo ) )
        {
            m_forceEffectChange = false;
            m_forceIsManual = false;
            m_pendingEffectChange = true;
            m_pendingEffectForced = m_pendingEffectForced || ( forced && !calm_trigger );
        }

        // Beat-quantised: a due change is held PENDING until the next downbeat
        // lands.  Timeout + no-music escape; a MANUAL cut fires immediately.
        if ( m_pendingEffectChange )
        {
            m_pendingEffectAge += t.dt;
            if ( m_pendingEffectForced || m_reviewMode || t.downbeatTick
                 || m_pendingEffectAge > 2.5f || t.gateSmooth < 0.25f )
            {
                bool forced_go = m_pendingEffectForced;
                m_pendingEffectChange = false;
                m_pendingEffectForced = false;
                m_pendingEffectAge = 0.f;

                m_texState = 1;

                // Roll the TRANSITION for this fade: probability-weighted
                // rejection sampling over the registered Transitions/ shaders,
                // mood-biased like every other slot (Crossfade carries
                // probability 1.0 in the presets, so the classic linear mix
                // stays the most common).  Portal needs REAL depth on both
                // sides - without two 3D scenes it falls back to ZoomThrough.
                if ( m_transitions && !m_transitions->empty() )
                {
                    std::vector<EffectShader *> &tr = *m_transitions;
                    for ( unsigned int i = 0; i < MaxSearch; ++i )
                    {
                        m_actTransition = rand() % tr.size();
                        if ( tr[m_actTransition]->useShader()
                             && moodAccept( tr[m_actTransition] ) )
                            break;
                    }
                    if ( findTransition( "Portal.frag" ) == static_cast<int>( m_actTransition )
                         && !( tex[m_actTexture]->is3D()
                               && tex[m_nextTexture]->is3D() ) )
                    {
                        int zoom = findTransition( "ZoomThrough.frag" );
                        if ( zoom < 0 )
                            zoom = findTransition( "Crossfade.frag" );
                        if ( zoom >= 0 )
                            m_actTransition = static_cast<unsigned int>( zoom );
                    }
                    // Dev hook: KALEIDO_TRANS_STYLE forces a transition (probes
                    // of single transitions without luck of the dice) - a
                    // file name ("Shatter.frag") or a list index.
                    if ( const char *fs = getenv( "KALEIDO_TRANS_STYLE" ) )
                    {
                        int idx = findTransition( fs );
                        if ( idx < 0 && fs[0] >= '0' && fs[0] <= '9' )
                            idx = atoi( fs ) % static_cast<int>( tr.size() );
                        if ( idx >= 0 )
                            m_actTransition = static_cast<unsigned int>( idx );
                    }
                    // Per-activation variety: re-roll the transition's own
                    // <float>/<interpolator> params for THIS fade.
                    tr[m_actTransition]->resetParameters();
                    tr[m_actTransition]->startInterpolators();
                }

                unsigned int time_act = tex[m_actTexture]->getTimeInterpolation();
                unsigned int time_next = tex[m_nextTexture]->getTimeInterpolation();

                // Manual cut -> short snappy cross-fade; natural change ->
                // config time, or exactly 4 BEATS with a confident rhythm
                // (never longer than the config asked for).
                {
                    float cfg_t = static_cast<float>( std::min( time_act, time_next ) ) / t.timingScale;
                    if ( !forced_go && t.rhythmStrength > 0.55f
                         && t.estimatedBPM > 0.004f )
                    {
                        float four_beats = 4.f * 60.f / ( 40.f + 160.f * t.estimatedBPM );
                        cfg_t = fminf( fmaxf( four_beats, 1.2f ), cfg_t );
                    }
                    // ARTICULATION: staccato material gets snappier cross-fades,
                    // legato keeps the full dissolve.
                    cfg_t *= 1.f - 0.35f * t.logAttackTime;
                    m_texFadeDur = ( forced_go || m_reviewMode ) ? 0.8f : cfg_t;

                    // FLOORS (never for a manual cut or the review bench).
                    // The four-beat clamp suits a cross-fade; a transition that
                    // sweeps rings and spirals across the frame changes the
                    // picture many times as much over the same progress and read
                    // as "very, very fast" at two seconds (user, 14.09.2026).
                    // Each transition carries its own measured floor (minFade);
                    // a calm preset adds one for every fade (timeSceneFadeMin).
                    float floor_t = 0.f;
                    if ( !forced_go && !m_reviewMode )
                    {
                        floor_t = m_sceneFadeMin;
                        if ( m_transitions && m_actTransition < m_transitions->size() )
                            floor_t = fmaxf( floor_t, ( *m_transitions )[m_actTransition]->minFade() );
                        m_texFadeDur = fmaxf( m_texFadeDur, floor_t );
                    }
                    // KALEIDO_FADE_LOG: one line per scene fade -- which transition,
                    // how long, and what the floor was -- to verify the floors in a
                    // real run instead of trusting the arithmetic.
                    static const bool FadeLog = getenv( "KALEIDO_FADE_LOG" ) != nullptr;
                    if ( FadeLog )
                        fprintf( stderr, "FADE %s via %s: %.2f s (beat/config %.2f, floor %.2f)\n",
                                 tex[m_nextTexture]->fragmentName(),
                                 ( m_transitions && m_actTransition < m_transitions->size() )
                                     ? ( *m_transitions )[m_actTransition]->fragmentName()
                                     : "-",
                                 m_texFadeDur, cfg_t, floor_t );
                }

                // Drop dramaturgy: the change came from a detected DROP.  A
                // music-video cut instead of a dissolve - half hard (2-3
                // frames), half as a shatter (the old scene bursts on the
                // hit).  AFTER the duration computation, so nothing
                // overwrites it.
                if ( m_dropCutPending && !m_reviewMode && m_sceneFadeMin > 0.f )
                    m_dropCutPending = false; // a calm preset never snaps on a drop
                if ( m_dropCutPending && !m_reviewMode )
                {
                    m_dropCutPending = false;
                    int cross = findTransition( "Crossfade.frag" );
                    int shatter = findTransition( "Shatter.frag" );
                    if ( ( rand() % 2 || shatter < 0 ) && cross >= 0 )
                    {
                        m_actTransition = static_cast<unsigned int>( cross );
                        m_texFadeDur = 0.15f;
                    }
                    else if ( shatter >= 0 )
                    {
                        m_actTransition = static_cast<unsigned int>( shatter );
                        m_texFadeDur = 0.7f;
                    }
                }

                tex[m_nextTexture]->startInterpolators();

                // Song-structure memory: set the stored parameters of the
                // recurring section NOW - the effect then already fades in
                // WITH the stored look.  (Formerly this happened only at the
                // END OF THE FADE: the scene faded in with freshly rolled
                // parameters and jumped hard to the stored look at the moment
                // of completion - the "jump to a completely different picture
                // right after the scene change" the user reported.)
                if ( m_pendingSectionRestore >= 0 )
                {
                    auto ip = m_sectionParams.find( m_pendingSectionRestore );
                    if ( ip != m_sectionParams.end() )
                        tex[m_nextTexture]->restoreParameters( ip->second );
                    m_pendingSectionRestore = -1;
                }

                restart( m_clockEffectTexture );
            }
        }
    }
    // ---- Effect state machine: fade running ----
    else
    {
        float ts = secsSince( m_clockEffectTexture );

        m_texInterp = ( 1 - ts / m_texFadeDur );

        if ( ts > m_texFadeDur )
        {
            m_texState = 0;

            // The scene going out was on screen for its solo and this fade:
            // that time goes on the lab clock.
            m_labClock.add( m_shownSecs, m_actTexture < m_isLab.size() && m_isLab[m_actTexture] );
            m_shownSecs = 0.f;
            tex[m_actTexture]->resetParameters();
            m_actTexture = m_nextTexture;
            noteTextureShown( m_actTexture );
            if ( m_onHistory && !m_reviewMode )
                m_onHistory( m_recent.names() );

            // Song-structure memory: the RESTORE now happens at the START OF
            // THE FADE (see above, the effect fades in with the stored look);
            // here at completion only the look of a NEW section is stored
            // (the final parameters must be settled for that - the end of
            // the fade is the right moment).
            if ( m_pendingSectionStore >= 0 )
            {
                m_sectionEffect[m_pendingSectionStore] = m_actTexture;
                m_sectionFx[m_pendingSectionStore] =
                    ( m_fxState != 0 ) ? m_nextFx : m_actFx;
                m_sectionParams[m_pendingSectionStore] =
                    tex[m_actTexture]->snapshotParameters();
                m_sectionStamp[m_pendingSectionStore] = t.sectionCount;
                m_sectionTime[m_pendingSectionStore] = ClockT::now();
                m_pendingSectionStore = -1;
            }

            // A remote direct jump wins over EVERYTHING (review too).
            if ( m_forcedNextTexture >= 0
                 && m_forcedNextTexture < static_cast<int>( tex.size() ) )
            {
                m_nextTexture = m_forcedNextTexture;
                m_forcedNextTexture = -1;
                // A remote jump supersedes a deferred section replay too --
                // it must not surface later at some unrelated fade-end.
                m_pendingSectionNext = -1;
                m_pendingSectionNextId = -1;
                fprintf( stderr, "Forced: %s\n", tex[m_nextTexture]->fragmentName() );
                // Resume the review walk AFTER the scene that was jumped to.
                for ( unsigned int k = 0; k < m_reviewOrder.size(); ++k )
                    if ( m_reviewOrder[k] == static_cast<int>( m_nextTexture ) )
                    {
                        m_reviewPos = ( k + 1 ) % static_cast<int>( m_reviewOrder.size() );
                        break;
                    }
            }
            else if ( m_reviewMode && !tex.empty() )
            {
                // REVIEW MODE: step strictly alphabetically (built lazily).
                if ( m_reviewOrder.size() != tex.size() )
                {
                    m_reviewOrder.clear();
                    for ( unsigned int k = 0; k < tex.size(); ++k )
                        m_reviewOrder.push_back( static_cast<int>( k ) );
                    std::sort( m_reviewOrder.begin(), m_reviewOrder.end(),
                               [&tex]( int a, int b )
                    { return baseLess( tex[a]->fragmentName(),
                                       tex[b]->fragmentName() ); } );
                    m_reviewPos = 0;
                }
                m_nextTexture = m_reviewOrder[m_reviewPos % m_reviewOrder.size()];
                m_reviewPos = ( m_reviewPos + 1 ) % static_cast<int>( m_reviewOrder.size() );
                fprintf( stderr, "Review: %s\n", tex[m_nextTexture]->fragmentName() );
            }
            else if ( m_pendingSectionNext >= 0
                      && static_cast<unsigned>( m_pendingSectionNext ) < tex.size() )
            {
                // A section-repeat retarget that arrived mid-fade earlier:
                // apply it now, at a safe (Solo-just-ended) point, instead of
                // where it originally landed.
                m_nextTexture = static_cast<unsigned>( m_pendingSectionNext );
                m_pendingSectionRestore = m_pendingSectionNextId;
                m_pendingSectionNext = -1;
                m_pendingSectionNextId = -1;
            }
            else
                m_nextTexture = pickScene( static_cast<int>( m_actTexture ), false );

            if ( m_nextTexture == m_actTexture )
            {
                m_nextTexture += 1;
                if ( m_nextTexture == tex.size() )
                    m_nextTexture = 0;
            }

            m_texInterp = 1.0;

            // A chain lab walking with the music sets its own pace (its walk runs in
            // music time), so its stay is not shortened by the music's timing scale:
            // at 2.6 a 3-minute lab would have ended after 70 s.
            m_texFadeDur = static_cast<float>( tex[m_actTexture]->getTimeSolo() )
                           / ( tex[m_actTexture]->walksWithMusic() ? 1.f : t.timingScale );

            restart( m_clockEffectTexture );
        }
    }
}

/**  Advance the combine Solo/Fade state machine.
 *
 * Structurally the same two-phase machine as the effect side in tick(),
 * with one addition: @p trueStereoHold freezes the combine machine outright
 * (no pending-change accrual, no beat-quantised firing) for as long as an
 * eye-packed true-stereo 3D frame is on screen, since a combine cross-fade
 * mid-frame would corrupt the packed stereo pair; the pending change simply
 * resumes accruing once the hold lifts. Unlike the effect side, the combine
 * machine has no review-mode fast path and no song-structure memory of its
 * own (its "which combine replays with a section" wiring lives in tick()).
 * Both parameters (@p t, the per-frame inputs; @p trueStereoHold, the
 * stereo freeze) are documented in SceneScheduler.h.
 **/
void SceneScheduler::tickFx( const Tick &t, bool trueStereoHold )
{
    std::vector<EffectShader *> &tex = *m_textures;
    std::vector<EffectShader *> &comb = *m_fxShaders;

    // ---- Combine state machine: Solo ----
    if ( m_fxState == 0 )
    {
        m_fxInterp = 1.0;

        float ts = secsSince( m_clockEffectFx );
        bool  forced_c = m_forceFxChange;
        // The true-stereo hold freezes combine switching: an eye-packed 3D
        // frame must not enter a combine cross-fade (the pending change fires
        // as soon as the hold lifts).
        if ( !trueStereoHold
             && ( ts > m_fxFadeDur || ( forced_c && ts > 0.6f ) ) )
        {
            m_forceFxChange = false;
            m_pendingFxChange = true;
            m_pendingFxForced = m_pendingFxForced || forced_c;
        }

        // Beat-quantised, like the texture-effect change (manual cuts fire
        // immediately here too).
        if ( m_pendingFxChange && !trueStereoHold )
        {
            m_pendingFxAge += t.dt;
            if ( m_pendingFxForced || t.downbeatTick
                 || m_pendingFxAge > 2.5f || t.gateSmooth < 0.25f )
            {
                bool forced_go = m_pendingFxForced;
                m_pendingFxChange = false;
                m_pendingFxForced = false;
                m_pendingFxAge = 0.f;

                m_fxState = 1;

                unsigned int time_act = comb[m_actFx]->getTimeInterpolation();
                unsigned int time_next = comb[m_nextFx]->getTimeInterpolation();

                {
                    float cfg_t = static_cast<float>( std::min( time_act, time_next ) ) / t.timingScale;
                    if ( !forced_go && t.rhythmStrength > 0.55f
                         && t.estimatedBPM > 0.004f )
                    {
                        float four_beats = 4.f * 60.f / ( 40.f + 160.f * t.estimatedBPM );
                        cfg_t = fminf( fmaxf( four_beats, 1.2f ), cfg_t );
                    }
                    cfg_t *= 1.f - 0.35f * t.logAttackTime;
                    m_fxFadeDur = forced_go ? 0.8f : cfg_t;
                }

                comb[m_nextFx]->startInterpolators();

                restart( m_clockEffectFx );
            }
        }
    }
    // ---- Combine state machine: fade running ----
    else
    {
        float ts = secsSince( m_clockEffectFx );

        m_fxInterp = ( 1 - ts / m_fxFadeDur );

        if ( ts > m_fxFadeDur )
        {
            m_fxState = 0;

            comb[m_actFx]->resetParameters();
            m_actFx = m_nextFx;

            if ( m_pendingSectionNextFx >= 0
                 && static_cast<unsigned>( m_pendingSectionNextFx ) < comb.size() )
            {
                // A section-repeat combine retarget that arrived mid-fade
                // earlier (see tick()): apply it now, at a safe point.
                m_nextFx = static_cast<unsigned>( m_pendingSectionNextFx );
                m_pendingSectionNextFx = -1;
            }
            else
            { // braces added: the calm-FX filter declares a local, and the old
                // brace-less else made only its first statement the else branch
                // Deliberately NOT excluding m_nextFx == m_actFx here (unlike the
                // texture pick's equivalent loop): a preset FX pool is typically
                // dominated by one near-probability=1.0 "carrier" (FxPlain here,
                // probability=1.00, vs the other ~28 at 0.002-0.006 each) plus a
                // long tail of rare accent overlays. Forbidding a candidate from
                // following ITSELF turns "act -> exclude self -> pick next" into a
                // two-state Markov chain where leaving the dominant candidate is
                // mandatory and returning to it is merely LIKELY: solving that
                // chain's stationary distribution caps the dominant candidate at
                // ~50% NO MATTER HOW HIGH its configured probability is (verified
                // empirically: removing the exclusion took a simulation using
                // Komplett.xml's real FX probabilities from 44% actual Plain share
                // up to 88%, matching its ~89% theoretical probability-weighted
                // share). A "fade" that lands back on the same FX is visually a
                // no-op blend anyway -- it just re-rolls that FX's own <float>/
                // <expr> parameters and resets its solo timer, exactly like
                // letting it simply continue.
                // Over a loaded model only CALM overlays are admissible (see
                // isMeshCalmFx above) -- the rejection loop simply demands it, so the
                // accent variety survives: a model can still get godrays, a halftone,
                // a colour grade, just nothing that displaces the frame.
                const bool mesh_calm_needed =
                    tex[m_actTexture]->isMeshScene()
                    || ( m_texState != 0 && tex[m_nextTexture]->isMeshScene() );
                // forceFx() bypasses every acceptance test below -- the whole point
                // of an FX sweep is to see the one that was ASKED for, including
                // the ones the budget or the mesh-calm rule would normally veto.
                if ( m_forcedNextFx >= 0 && m_forcedNextFx < static_cast<int>( comb.size() ) )
                {
                    m_nextFx = static_cast<unsigned int>( m_forcedNextFx );
                    m_forcedNextFx = -1;
                }
                else
                {
                    for ( unsigned int i = 0; i < MaxSearch; ++i )
                    {
                        m_nextFx = rand() % comb.size();
                        if ( ( ( tex[m_actTexture]->getComplexity() + tex[m_nextTexture]->getComplexity()
                                 + comb[m_actFx]->getComplexity() + comb[m_nextFx]->getComplexity() )
                               < ComplexityBudget )
                             && comb[m_nextFx]->useShader() && moodAccept( comb[m_nextFx] )
                             && ( !mesh_calm_needed || isMeshCalmFx( comb[m_nextFx]->fragmentName() ) ) )
                            break;
                    }
                    // Unlucky rolls on a mesh scene fall back to the pass-through --
                    // never to a warping overlay.
                    if ( mesh_calm_needed && !isMeshCalmFx( comb[m_nextFx]->fragmentName() ) )
                    {
                        for ( unsigned int i = 0; i < comb.size(); ++i )
                        {
                            const char *frag = comb[i]->fragmentName();
                            if ( !frag )
                                continue;
                            const char *base = frag;
                            for ( const char *q = frag; *q; ++q )
                                if ( *q == '\\' || *q == '/' )
                                    base = q + 1;
                            if ( strcmp( base, "FxPlain.frag" ) == 0 )
                            {
                                m_nextFx = i;
                                break;
                            }
                        }
                    }
                } // end: no forced FX choice
            }

            m_fxInterp = 1.0;

            m_fxFadeDur = static_cast<float>( comb[m_actFx]->getTimeSolo() ) / t.timingScale;

            restart( m_clockEffectFx );
        }
    }
}
