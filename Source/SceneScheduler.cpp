/**
 * @file SceneScheduler.cpp
 * @brief Implementation of SceneScheduler: initial random pick, the
 *        effect/combine Solo-Fade state machines, musical trigger handling,
 *        and the mood-weighted rejection-sampling selection.
 */
#include <algorithm>
#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <cstring>

#include "SceneScheduler.h"
#include "EffectShader.h"

// Basename eines Fragment-Pfads, case-insensitiver Vergleich (Review-Sortierung).
/** @brief Return the basename (after the last slash/backslash) of a fragment path.
 * @param p Path string (may be null).
 * @return Pointer into @p p at the basename, or "?" if @p p is null.
 */
static const char *fragBase( const char *p )
{
	if( !p ) return "?";
	const char *b = p;
	for( const char *c = p; *c; ++c )
		if( *c == '\\' || *c == '/' )
			b = c + 1;
	return b;
}

/** @brief Case-insensitive "basename of a < basename of b" comparator for the review-mode sort.
 * @param a First fragment path.
 * @param b Second fragment path.
 * @return True if basename(a) sorts before basename(b).
 */
static bool baseLess( const char *a, const char *b )
{
	const char *x = fragBase( a ), *y = fragBase( b );
	while( *x && *y )
	{
		int cx = std::tolower( (unsigned char)*x ), cy = std::tolower( (unsigned char)*y );
		if( cx != cy ) return cx < cy;
		++x; ++y;
	}
	return *y != 0;
}

/**
 * @brief Roll the initial act/next effect and combine picks and start both clocks.
 *
 * Mirrors the old inline start() block exactly, including its slightly
 * different (looser) complexity budgets for the very first pick: 12 for the
 * texture pair alone, 20 once the combine pair is added in. Each pick is a
 * bounded rejection-sampling loop (up to #kMaxSearch tries) that requires
 * useShader() and, for "next", a distinct index from "act" within the
 * complexity budget; if the loop still lands on the same index as "act" it
 * is nudged forward by one (wrapping) rather than retried further.
 */
void SceneScheduler::reset()
{
	// Initiale Zufallswahl - exakt der alte start()-Block (inkl. der etwas
	// anderen Komplexitätsbudgets 12 bzw. 20 der Erst-Wahl).
	for( unsigned int i = 0; i < kMaxSearch; i++ )
	{
		m_actTexture = rand() % m_textures->size();
		if( (*m_textures)[m_actTexture]->useShader() )
			break;
	}

	for( unsigned int i = 0; i < kMaxSearch; i++ )
	{
		m_nextTexture = rand() % m_textures->size();
		if( m_nextTexture != m_actTexture &&
			(( (*m_textures)[m_actTexture]->getComplexity() +
			(*m_textures)[m_nextTexture]->getComplexity() ) < kComplexityBudgetInitial )
			&& (*m_textures)[m_nextTexture]->useShader()
			)
			break;
	}
	if( m_nextTexture == m_actTexture )
	{
		m_nextTexture += 1;
		if( m_nextTexture == m_textures->size() )
			m_nextTexture = 0;
	}

	m_texFadeDur = (float) ((*m_textures)[m_actTexture]->getTimeSolo());

	for( unsigned int i = 0; i < kMaxSearch; i++ )
	{
		m_actFx = rand() % m_fxShaders->size();
		if( (*m_fxShaders)[m_actFx]->useShader() )
			break;
	}
	// NOTE: unlike the texture pick above, this deliberately does NOT exclude
	// m_nextFx == m_actFx -- see the long comment on the identical pick in
	// tickFx()'s fade-end for why forbidding a dominant-probability FX (e.g.
	// FxPlain at probability=1.0) from following itself mathematically caps
	// it at ~50%, regardless of its configured probability.
	for( unsigned int i = 0; i < kMaxSearch; i++ )
	{
		m_nextFx = rand() % m_fxShaders->size();
		if( (( (*m_textures)[m_actTexture]->getComplexity() +
			(*m_textures)[m_nextTexture]->getComplexity() +
			(*m_fxShaders)[m_actFx]->getComplexity() +
			(*m_fxShaders)[m_nextFx]->getComplexity() ) < kComplexityBudget )
			&& (*m_fxShaders)[m_nextFx]->useShader()
			)
			break;
	}

	m_fxFadeDur = (float) ((*m_fxShaders)[m_actFx]->getTimeSolo());

	m_texState  = 0;
	m_fxState = 0;
	m_texInterp  = 1.f;
	m_fxInterp = 1.f;
	restart( m_clockEffectTexture );
	restart( m_clockEffectFx );
}

// Remote-Szenen-Browser: DIREKT zu Szene idx springen (gleicher Sofort-Pfad
// wie ein manueller 'n'-Cut, aber mit gewähltem Ziel statt Zufalls-Roll).
/**
 * @brief Jump directly to effect index @p idx (remote scene browser).
 *
 * Takes the same immediate path as a manual 'n' cut (forceEffectChange).
 * m_nextTexture is decided one fade cycle in advance (rolled/forced at the
 * PREVIOUS fade's end, see tick()'s fade-end branch) -- while idle (Solo),
 * that value is just sitting there waiting for the next fade to start, so
 * it is safe and correct to overwrite it right here for an immediate jump
 * to @p idx. Mid-fade, the current fade is already committed to its
 * outgoing/incoming pair (retargeting it would jump the interpolation), so
 * @p idx is instead queued in m_forcedNextTexture and only applied once
 * that fade finishes, exactly as before.
 * @param idx Index into the attached texture list; out-of-range or missing
 *            attach() is silently ignored.
 */
void SceneScheduler::forceScene( int idx )
{
	if( !m_textures || idx < 0 || idx >= (int)m_textures->size() )
		return;
	if( m_texState == 0 )
	{
		m_nextTexture       = idx;
		m_forcedNextTexture = -1;
	}
	else
		m_forcedNextTexture = idx;
	m_forceEffectChange = true;
	m_forceIsManual     = true;
}

/**
 * @brief Find a registered transition shader by fragment basename.
 *
 * Compares only the basename (text after the last path separator) so the
 * dramaturgy hooks ("Shatter.frag" on a drop, the Portal depth gate) stay
 * independent of how the preset spelled the path.
 * @param basename File name without path, e.g. "Crossfade.frag".
 * @return Index into the transition list, or -1 if not registered.
 */
int SceneScheduler::findTransition( const char *basename ) const
{
	if( !m_transitions || !basename )
		return -1;
	for( unsigned int i = 0; i < m_transitions->size(); i++ )
	{
		const char *frag = (*m_transitions)[i]->fragmentName();
		if( !frag ) continue;
		const char *b = frag;
		for( const char *p = frag; *p; ++p )
			if( *p == '\\' || *p == '/' ) b = p + 1;
		if( strcmp( b, basename ) == 0 )
			return (int) i;
	}
	return -1;
}

// Mood-basierter Auswahl-Bias - zwei Komponenten:
//   1. Busyness: Shader-Komplexität soll grob zum Arousal passen.
//   2. Mood-TAGS (config mood="dark,bright,calm,aggressive"): Bonus bei
//      Übereinstimmung, Malus bei klarem Widerspruch; ungetaggte bleiben
//      neutral.  Probabilistisch - ein Bias, kein harter Filter.
/**
 * @brief Probabilistic mood-based accept test for a selection candidate.
 *
 * Combines three signals into an acceptance probability, then rolls a
 * uniform random draw against it: (1) busyness match, how close the
 * shader's complexity is to an arousal-derived target of 1..10; (2) the
 * learned taste multiplier from tasteOf(); (3) mood-tag bonus/malus for
 * bright/dark/aggressive/calm tags weighted by valence/arousal/ambient.
 * A floor (0.05..0.15, scaled down further for disliked shaders) keeps
 * every shader reachable — this is a bias, never a hard exclusion.
 * @param s Candidate effect or combine shader.
 * @return True if the random draw falls below the computed acceptance probability.
 */
bool SceneScheduler::moodAccept( EffectShader *s ) const
{
	float target = 1.f + m_lastArousal * 9.f;               // desired busyness 1..10
	float diff   = fabsf(float(s->getComplexity()) - target) / 9.f;
	float accept = 1.f - 0.6f * diff;                       // closer match -> likelier

	// Learned taste (skip-malus / favourite-bonus, persistent beim Aufrufer).
	accept *= tasteOf( s->fragmentName() );

	unsigned int f = s->moodFlags();
	if (f)
	{
		float bonus = 0.f;
		if (f & EffectShader::MOOD_BRIGHT)
			bonus += (m_lastValence - 0.5f) * 0.8f;
		if (f & EffectShader::MOOD_DARK)
			bonus += (0.5f - m_lastValence) * 0.8f;
		if (f & EffectShader::MOOD_AGGRESSIVE)
			bonus += (m_lastArousal - 0.5f) * 0.8f + (0.3f - m_lastAmbient) * 0.4f;
		if (f & EffectShader::MOOD_CALM)
			bonus += (0.5f - m_lastArousal) * 0.6f + (m_lastAmbient - 0.3f) * 0.6f;
		accept += bonus;
	}
	// Floor keeps every shader reachable (never a hard exclusion); a disliked
	// shader gets a lower floor, but never zero.
	float floorv = 0.15f * std::min( tasteOf( s->fragmentName() ), 1.f );
	if (floorv < 0.05f) floorv = 0.05f;
	if (accept < floorv) accept = floorv;
	return (float(rand()) / float(RAND_MAX)) < accept;
}

/**
 * @brief Evaluate musical triggers, then advance the effect (texture) Solo/Fade state machine.
 *
 * Trigger handling (novelty, section change with song-structure memory,
 * drop, pin) runs first and only sets/clears the forced-change flags; the
 * actual Solo/Fade transition logic follows and is symmetric with
 * tickFx()'s combine version. Key subtleties:
 *  - Novelty and section triggers are rate-limited by m_noveltyCooldown
 *    (~8 s) so they don't fight the beat-quantised pending mechanism.
 *  - A recognised, already-known section whose stored shader is already on
 *    screen deliberately does NOT re-apply its stored parameters immediately
 *    (that used to cause a hard mid-shot jump); it only replays them the
 *    NEXT time that shader is faded into, via m_pendingSectionRestore.
 *  - Pending changes are held until the next downbeat (beat quantisation),
 *    but escape via a 2.5 s timeout or a low music-presence gate; a forced
 *    (manual/drop) change instead fires as soon as a short 0.6 s minimum
 *    solo time has elapsed, so cuts never come back-to-back.
 *  - The cross-fade duration is normally the shorter of the two shaders'
 *    configured interpolation times, optionally clamped to ~4 beats when
 *    rhythm confidence is high, then shortened further for staccato
 *    material (logAttackTime). A drop cut overrides all of that afterwards
 *    with either a near-instant hard cut or the shatter transition.
 *  - Section-memory parameter restore happens at FADE START (not fade end)
 *    so the incoming shader blends in already showing the stored look,
 *    instead of snapping to it the instant the fade completes.
 */
void SceneScheduler::tick( const Tick &t )
{
	std::vector<EffectShader *> &tex  = *m_textures;
	std::vector<EffectShader *> &comb = *m_fxShaders;

	// Musical novelty: a strong harmonic / section change (a drop, a key
	// change) forces an early cross-fade - rate-limited, only while music
	// actually plays.
	// A trigger that lands WHILE a cross-fade is already running must not
	// queue a SECOND change: the fade in flight already is the scene change
	// the music asked for.  Forcing another one made the freshly faded-in
	// scene get cut away again after the 0.6 s minimum solo -- the reported
	// "scene flashes in for a fraction of a second and is replaced".
	const bool midFade = ( m_texState != 0 );

	m_noveltyCooldown -= t.dt;
	if( !m_reviewMode && m_noveltyCooldown <= 0.f &&
	    t.harmonicChange * t.musicPresence > 0.5f )
	{
		if( !midFade )
			m_forceEffectChange = true;
		m_noveltyCooldown = 8.0f;   // at most one musical cut every ~8 s
	}

	// SECTION change (Strophe -> Refrain -> Bridge) + Song-Struktur-Gedächtnis:
	// eine WIEDERKEHRENDE Section (Refrain #2 = Refrain #1) spielt Shader,
	// Combine und exakte Parameter von damals; eine NEUE rollt frisch und ihr
	// Look wird nach dem Wechsel unter der id gespeichert.
	if( !m_reviewMode && t.sectionCount == m_lastSectionCount + 1 )
	{
		int  id = t.sectionId;
		auto it = m_sectionEffect.find( id );
		// "Known" needs all three: the analyzer RECOGNISED the section by
		// fingerprint (the id alone is a recycled LRU slot and says nothing),
		// we have a look stored under that id, and that look is fresh (stored
		// within this song, not inherited from a set played an hour ago).
		auto st = m_sectionStamp.find( id );
		bool fresh = st != m_sectionStamp.end()
		             && ( t.sectionCount - st->second ) <= kSectionMemorySpan;
		bool known = t.sectionKnown && (id >= 0) && it != m_sectionEffect.end()
		             && it->second < tex.size() && fresh;
		fprintf( stderr, "SCHED section id=%d %s%s -> %s\n", id,
		         t.sectionKnown ? "recognised" : "new",
		         ( t.sectionKnown && !known ) ? " (no fresh memory)" : "",
		         known ? "replay" : "fresh roll" );
		if( known && it->second == m_actTexture )
		{
			// Der richtige Shader ist bereits auf dem Schirm.  Frueher wurden
			// hier SOFORT die gespeicherten Parameter draufgesetzt - ein
			// harter, unueberblendeter Sprung auf einen komplett anderen Look
			// mitten im laufenden Bild.  Visuelle Kontinuitaet schlaegt
			// Replay-Treue: der aktuelle Look bleibt einfach stehen.
		}
		else
		{
			if( known )
			{
				auto ic = m_sectionFx.find( id );
				int  fxTarget = ( ic != m_sectionFx.end()
				                   && ic->second < comb.size()
				                   && ic->second != m_actFx )
				                 ? (int) ic->second : -1;

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
				if( !midFade )
				{
					m_nextTexture           = it->second;   // replay that section's shader
					m_pendingSectionRestore = id;           //   ... with its exact params
				}
				else
				{
					// Mid-fade: becomes the target of the NEXT change (applied at
					// this fade's end), but does NOT force that change early --
					// the scene now fading in gets its full solo first.
					m_pendingSectionNext   = (int) it->second;
					m_pendingSectionNextId = id;
				}

				if( fxTarget >= 0 )
				{
					if( m_fxState == 0 )
					{
						m_nextFx        = fxTarget;
						m_forceFxChange = true;
					}
					else
					{
						m_pendingSectionNextFx = fxTarget;
						m_forceFxChange        = true;   // consumed once tickFx() is back in Solo, by which point the deferred m_nextFx has already been applied at its fade-end
					}
				}
			}
			else
			{
				m_pendingSectionStore = id;             // remember the new look
				// A stale deferred replay (from a section that is over now)
				// must not surface at the next fade-end.
				m_pendingSectionNext   = -1;
				m_pendingSectionNextId = -1;
				if( (t.sectionCount & 1) == 0 )
					m_forceFxChange = true;        // bigger scenery change
			}
			if( !midFade )
				m_forceEffectChange = true;
		}
		m_noveltyCooldown = 8.0f;     // hold off the harmonic hook right after
	}
	m_lastSectionCount = t.sectionCount;

	// DROP: immediate scene cut (still beat-quantised by the pending machinery,
	// but a drop IS a downbeat-scale accent).
	if( !m_reviewMode && t.dropCount == m_lastDropCount + 1 )
	{
		if( midFade )
		{
			// The change is already under way: land it ON the drop as a hard
			// cut (finish the running fade within ~0.15 s) instead of queuing
			// a second cut right behind it.
			float ts = secsSince( m_clockEffectTexture );
			if( m_texFadeDur > ts + 0.15f )
				m_texFadeDur = ts + 0.15f;
		}
		else
		{
			m_forceEffectChange = true;
			m_dropCutPending    = true;
		}
		m_noveltyCooldown = 8.0f;
	}
	m_lastDropCount = t.dropCount;

	// VJ PIN ('u'): suppress every forced cut while the current look is held.
	if( t.pinned )
	{
		m_forceEffectChange  = false;
		m_forceIsManual      = false;
		m_forceFxChange = false;
		m_dropCutPending     = false;
		// A pending section store/restore must not attach to some LATER,
		// unrelated switch after unpinning - drop it.
		m_pendingSectionStore   = -1;
		m_pendingSectionRestore = -1;
		m_pendingSectionNext    = -1;
		m_pendingSectionNextId  = -1;
		m_pendingSectionNextFx  = -1;
	}

	// ---- Effekt-Zustandsmaschine: Solo ----
	if( m_texState == 0 )
	{
		m_texInterp = 1.0;

		float ts = secsSince( m_clockEffectTexture );

		// REVIEW MODE: fixed 8 s per scene, regardless of config/music pacing.
		if( m_reviewMode && m_texFadeDur > 8.f )
			m_texFadeDur = 8.f;

		// End the solo early on a manual ('n') or trigger-driven request, but
		// only after a minimum so cuts never come back-to-back.  A human
		// pressing 'n' gets 0.6 s; a musical trigger (section/novelty/drop)
		// landing right after a fade completed must let the new scene stand
		// for a real shot first -- 0.6 s read as "flashes in, gets replaced".
		bool  forced  = m_forceEffectChange;
		float minSolo = m_forceIsManual ? 0.6f : 2.0f;
		if( ts > m_texFadeDur || (forced && ts > minSolo) )
		{
			m_forceEffectChange   = false;
			m_forceIsManual       = false;
			m_pendingEffectChange = true;
			m_pendingEffectForced = m_pendingEffectForced || forced;
		}

		// Beat-quantised: a due change is held PENDING until the next downbeat
		// lands.  Timeout + no-music escape; a MANUAL cut fires immediately.
		if( m_pendingEffectChange )
		{
			m_pendingEffectAge += t.dt;
			if( m_pendingEffectForced || m_reviewMode || t.downbeatTick
			    || m_pendingEffectAge > 2.5f || t.gateSmooth < 0.25f )
			{
				bool forcedGo         = m_pendingEffectForced;
				m_pendingEffectChange = false;
				m_pendingEffectForced = false;
				m_pendingEffectAge    = 0.f;

				m_texState = 1;

				// Roll the TRANSITION for this fade: probability-weighted
				// rejection sampling over the registered Transitions/ shaders,
				// mood-biased like every other slot (Crossfade carries
				// probability 1.0 in the presets, so the classic linear mix
				// stays the most common).  Portal needs REAL depth on both
				// sides - without two 3D scenes it falls back to ZoomThrough.
				if( m_transitions && !m_transitions->empty() )
				{
					std::vector<EffectShader *> &tr = *m_transitions;
					for( unsigned int i = 0; i < kMaxSearch; i++ )
					{
						m_actTransition = rand() % tr.size();
						if( tr[m_actTransition]->useShader()
						    && moodAccept( tr[m_actTransition] ) )
							break;
					}
					if( findTransition( "Portal.frag" ) == (int) m_actTransition
					    && !( tex[m_actTexture]->is3D()
					       && tex[m_nextTexture]->is3D() ) )
					{
						int zoom = findTransition( "ZoomThrough.frag" );
						if( zoom < 0 ) zoom = findTransition( "Crossfade.frag" );
						if( zoom >= 0 ) m_actTransition = (unsigned int) zoom;
					}
					// Dev-Haken: KALEIDO_TRANS_STYLE erzwingt einen Uebergang
					// (Proben einzelner Uebergaenge ohne Wuerfel-Glueck) -
					// Dateiname ("Shatter.frag") oder Listen-Index.
					if( const char *fs = getenv( "KALEIDO_TRANS_STYLE" ) )
					{
						int idx = findTransition( fs );
						if( idx < 0 && fs[0] >= '0' && fs[0] <= '9' )
							idx = atoi( fs ) % (int) tr.size();
						if( idx >= 0 ) m_actTransition = (unsigned int) idx;
					}
					// Per-activation variety: re-roll the transition's own
					// <float>/<interpolator> params for THIS fade.
					tr[m_actTransition]->resetParameters();
					tr[m_actTransition]->startInterpolators();
				}

				unsigned int timeAct  = tex[m_actTexture]->getTimeInterpolation();
				unsigned int timeNext = tex[m_nextTexture]->getTimeInterpolation();

				// Manual cut -> short snappy cross-fade; natural change ->
				// config time, or exactly 4 BEATS with a confident rhythm
				// (never longer than the config asked for).
				{
					float cfgT = (float) (std::min( timeAct, timeNext)) / t.timingScale;
					if( !forcedGo && t.rhythmStrength > 0.55f
					    && t.estimatedBPM > 0.004f )
					{
						float fourBeats = 4.f * 60.f / (40.f + 160.f * t.estimatedBPM);
						cfgT = fminf(fmaxf(fourBeats, 1.2f), cfgT);
					}
					// ARTICULATION: staccato material gets snappier cross-fades,
					// legato keeps the full dissolve.
					cfgT *= 1.f - 0.35f * t.logAttackTime;
					m_texFadeDur = (forcedGo || m_reviewMode) ? 0.8f : cfgT;
				}

				// Drop-Dramaturgie: der Wechsel kam von einem erkannten DROP.
				// Musikvideo-Schnitt statt Dissolve - haelfte hart (2-3 Frames),
				// haelfte als Shatter (die alte Szene zerbirst auf den Hit).
				// NACH der Dauer-Berechnung, damit nichts sie ueberschreibt.
				if( m_dropCutPending && !m_reviewMode )
				{
					m_dropCutPending = false;
					int cross   = findTransition( "Crossfade.frag" );
					int shatter = findTransition( "Shatter.frag" );
					if( ( rand() % 2 || shatter < 0 ) && cross >= 0 )
					{
						m_actTransition = (unsigned int) cross;
						m_texFadeDur    = 0.15f;
					}
					else if( shatter >= 0 )
					{
						m_actTransition = (unsigned int) shatter;
						m_texFadeDur    = 0.7f;
					}
				}

				tex[m_nextTexture]->startInterpolators();

				// Song-Struktur-Gedaechtnis: die gespeicherten Parameter der
				// wiederkehrenden Section JETZT setzen - der Effekt blendet
				// dann bereits MIT dem gespeicherten Look ein.  (Frueher
				// passierte das erst am FADE-ENDE: die Szene blendete mit
				// frisch gewuerfelten Parametern ein und sprang im Moment des
				// Abschlusses hart auf den gespeicherten Look um - der vom
				// User gemeldete "Sprung zu einem komplett anderen Bild
				// direkt nach dem Szenenwechsel".)
				if( m_pendingSectionRestore >= 0 )
				{
					auto ip = m_sectionParams.find( m_pendingSectionRestore );
					if( ip != m_sectionParams.end() )
						tex[m_nextTexture]->restoreParameters( ip->second );
					m_pendingSectionRestore = -1;
				}

				restart( m_clockEffectTexture );
			}
		}
	}
	// ---- Effekt-Zustandsmaschine: Fade läuft ----
	else
	{
		float ts = secsSince( m_clockEffectTexture );

		m_texInterp = (1 - ts / m_texFadeDur);

		if( ts > m_texFadeDur )
		{
			m_texState = 0;

			tex[m_actTexture]->resetParameters();
			m_actTexture = m_nextTexture;

			// Song-Struktur-Gedaechtnis: das RESTORE passiert inzwischen am
			// FADE-START (s.o., der Effekt blendet mit dem gespeicherten Look
			// ein); hier am Abschluss wird nur noch der Look einer NEUEN
			// Section gespeichert (dafuer muessen die finalen Parameter
			// feststehen - Fade-Ende ist der richtige Moment).
			if( m_pendingSectionStore >= 0 )
			{
				m_sectionEffect[m_pendingSectionStore]  = m_actTexture;
				m_sectionFx[m_pendingSectionStore] =
					(m_fxState != 0) ? m_nextFx : m_actFx;
				m_sectionParams[m_pendingSectionStore]  =
					tex[m_actTexture]->snapshotParameters();
				m_sectionStamp[m_pendingSectionStore]   = t.sectionCount;
				m_pendingSectionStore = -1;
			}

			// Remote-Direktsprung gewinnt gegen ALLES (auch Review).
			if( m_forcedNextTexture >= 0
			    && m_forcedNextTexture < (int)tex.size() )
			{
				m_nextTexture       = m_forcedNextTexture;
				m_forcedNextTexture = -1;
				// A remote jump supersedes a deferred section replay too --
				// it must not surface later at some unrelated fade-end.
				m_pendingSectionNext   = -1;
				m_pendingSectionNextId = -1;
				fprintf( stderr, "Forced: %s\n", tex[m_nextTexture]->fragmentName() );
				// Resume the review walk AFTER the scene that was jumped to.
				for( unsigned int k = 0; k < m_reviewOrder.size(); ++k )
					if( m_reviewOrder[k] == (int)m_nextTexture )
					{ m_reviewPos = ( k + 1 ) % (int)m_reviewOrder.size(); break; }
			}
			else if( m_reviewMode && !tex.empty() )
			{
				// REVIEW MODE: step strictly alphabetically (built lazily).
				if( m_reviewOrder.size() != tex.size() )
				{
					m_reviewOrder.clear();
					for( unsigned int k = 0; k < tex.size(); ++k )
						m_reviewOrder.push_back( (int)k );
					std::sort( m_reviewOrder.begin(), m_reviewOrder.end(),
					           [&tex]( int a, int b )
					           { return baseLess( tex[a]->fragmentName(),
					                              tex[b]->fragmentName() ); } );
					m_reviewPos = 0;
				}
				m_nextTexture = m_reviewOrder[ m_reviewPos % m_reviewOrder.size() ];
				m_reviewPos = ( m_reviewPos + 1 ) % (int)m_reviewOrder.size();
				fprintf( stderr, "Review: %s\n", tex[m_nextTexture]->fragmentName() );
			}
			else if( m_pendingSectionNext >= 0
			         && (unsigned)m_pendingSectionNext < tex.size() )
			{
				// A section-repeat retarget that arrived mid-fade earlier:
				// apply it now, at a safe (Solo-just-ended) point, instead of
				// where it originally landed.
				m_nextTexture           = (unsigned) m_pendingSectionNext;
				m_pendingSectionRestore = m_pendingSectionNextId;
				m_pendingSectionNext    = -1;
				m_pendingSectionNextId  = -1;
			}
			else
			for( unsigned int i = 0; i < kMaxSearch; i++ )
			{
				m_nextTexture = rand() % tex.size();
				if( m_nextTexture != m_actTexture &&
					(( tex[m_actTexture]->getComplexity() +
					tex[m_nextTexture]->getComplexity() +
					comb[m_actFx]->getComplexity() +
					comb[m_nextFx]->getComplexity() ) < kComplexityBudget )
					&& tex[m_nextTexture]->useShader()
					&& moodAccept( tex[m_nextTexture] )
					)
					break;
			}

			if( m_nextTexture == m_actTexture )
			{
				m_nextTexture += 1;
				if( m_nextTexture == tex.size() )
					m_nextTexture = 0;
			}

			m_texInterp = 1.0;

			m_texFadeDur = (float) (tex[m_actTexture]->getTimeSolo()) / t.timingScale;

			restart( m_clockEffectTexture );
		}
	}
}

/**
 * @brief Advance the combine Solo/Fade state machine.
 *
 * Structurally the same two-phase machine as the effect side in tick(),
 * with one addition: @p trueStereoHold freezes the combine machine outright
 * (no pending-change accrual, no beat-quantised firing) for as long as an
 * eye-packed true-stereo 3D frame is on screen, since a combine cross-fade
 * mid-frame would corrupt the packed stereo pair; the pending change simply
 * resumes accruing once the hold lifts. Unlike the effect side, the combine
 * machine has no review-mode fast path and no song-structure memory of its
 * own (its "which combine replays with a section" wiring lives in tick()).
 * @param t Frame inputs (timing, triggers, gate).
 * @param trueStereoHold True while an eye-packed true-stereo frame must not enter a combine cross-fade.
 */
void SceneScheduler::tickFx( const Tick &t, bool trueStereoHold )
{
	std::vector<EffectShader *> &tex  = *m_textures;
	std::vector<EffectShader *> &comb = *m_fxShaders;

	// ---- Combine-Zustandsmaschine: Solo ----
	if( m_fxState == 0 )
	{
		m_fxInterp = 1.0;

		float ts = secsSince( m_clockEffectFx );
		bool forcedC = m_forceFxChange;
		// The true-stereo hold freezes combine switching: an eye-packed 3D
		// frame must not enter a combine cross-fade (the pending change fires
		// as soon as the hold lifts).
		if( !trueStereoHold
		    && (ts > m_fxFadeDur || (forcedC && ts > 0.6f)) )
		{
			m_forceFxChange   = false;
			m_pendingFxChange = true;
			m_pendingFxForced = m_pendingFxForced || forcedC;
		}

		// Beat-quantised, like the texture-effect change (manual cuts fire
		// immediately here too).
		if( m_pendingFxChange && !trueStereoHold )
		{
			m_pendingFxAge += t.dt;
			if( m_pendingFxForced || t.downbeatTick
			    || m_pendingFxAge > 2.5f || t.gateSmooth < 0.25f )
			{
				bool forcedGo          = m_pendingFxForced;
				m_pendingFxChange = false;
				m_pendingFxForced = false;
				m_pendingFxAge    = 0.f;

				m_fxState = 1;

				unsigned int timeAct  = comb[m_actFx]->getTimeInterpolation();
				unsigned int timeNext = comb[m_nextFx]->getTimeInterpolation();

				{
					float cfgT = (float) (std::min( timeAct, timeNext)) / t.timingScale;
					if( !forcedGo && t.rhythmStrength > 0.55f
					    && t.estimatedBPM > 0.004f )
					{
						float fourBeats = 4.f * 60.f / (40.f + 160.f * t.estimatedBPM);
						cfgT = fminf(fmaxf(fourBeats, 1.2f), cfgT);
					}
					cfgT *= 1.f - 0.35f * t.logAttackTime;
					m_fxFadeDur = forcedGo ? 0.8f : cfgT;
				}

				comb[m_nextFx]->startInterpolators();

				restart( m_clockEffectFx );
			}
		}
	}
	// ---- Combine-Zustandsmaschine: Fade läuft ----
	else
	{
		float ts = secsSince( m_clockEffectFx );

		m_fxInterp = (1 - ts / m_fxFadeDur);

		if( ts > m_fxFadeDur )
		{
			m_fxState = 0;

			comb[m_actFx]->resetParameters();
			m_actFx = m_nextFx;

			if( m_pendingSectionNextFx >= 0
			    && (unsigned)m_pendingSectionNextFx < comb.size() )
			{
				// A section-repeat combine retarget that arrived mid-fade
				// earlier (see tick()): apply it now, at a safe point.
				m_nextFx               = (unsigned) m_pendingSectionNextFx;
				m_pendingSectionNextFx = -1;
			}
			else
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
			for( unsigned int i = 0; i < kMaxSearch; i++ )
			{
				m_nextFx = rand() % comb.size();
				if( (( tex[m_actTexture]->getComplexity() +
					tex[m_nextTexture]->getComplexity() +
					comb[m_actFx]->getComplexity() +
					comb[m_nextFx]->getComplexity() ) < kComplexityBudget )
					&& comb[m_nextFx]->useShader()
					&& moodAccept( comb[m_nextFx] )
					)
					break;
			}
			// A loaded model on screen gets the NEUTRAL overlay, full stop.
			// Most accent FX pulse, warp or shake the whole frame with the
			// beat, and a full-frame pulse moves the model with it -- the
			// same reported twitch the hull and camera fixes already removed.
			// The beat belongs to the scene's own background now; the overlay
			// slot carries it only on abstract material.
			if( tex[m_actTexture]->isMeshScene()
			    || ( m_texState != 0 && tex[m_nextTexture]->isMeshScene() ) )
			{
				for( unsigned int i = 0; i < comb.size(); i++ )
				{
					const char *frag = comb[i]->fragmentName();
					if( !frag ) continue;
					const char *base = frag;
					for( const char *q = frag; *q; ++q )
						if( *q == '\\' || *q == '/' ) base = q + 1;
					if( strcmp( base, "FxPlain.frag" ) == 0 )
					{
						m_nextFx = i;
						break;
					}
				}
			}

			m_fxInterp = 1.0;

			m_fxFadeDur = (float) (comb[m_actFx]->getTimeSolo()) / t.timingScale;

			restart( m_clockEffectFx );
		}
	}
}
