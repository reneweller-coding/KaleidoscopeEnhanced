#include <algorithm>
#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <cstring>

#include "SceneScheduler.h"
#include "EffectShader.h"

// Basename eines Fragment-Pfads, case-insensitiver Vergleich (Review-Sortierung).
static const char *fragBase( const char *p )
{
	if( !p ) return "?";
	const char *b = p;
	for( const char *c = p; *c; ++c )
		if( *c == '\\' || *c == '/' )
			b = c + 1;
	return b;
}

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
			(*m_textures)[m_nextTexture]->getComplexity() ) < 12 )
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
		m_actCombine = rand() % m_combines->size();
		if( (*m_combines)[m_actCombine]->useShader() )
			break;
	}
	for( unsigned int i = 0; i < kMaxSearch; i++ )
	{
		m_nextCombine = rand() % m_combines->size();
		if( m_nextCombine != m_actCombine &&
			(( (*m_textures)[m_actTexture]->getComplexity() +
			(*m_textures)[m_nextTexture]->getComplexity() +
			(*m_combines)[m_actCombine]->getComplexity() +
			(*m_combines)[m_nextCombine]->getComplexity() ) < 20 )
			&& (*m_combines)[m_nextCombine]->useShader()
			)
			break;
	}
	if( m_nextCombine == m_actCombine )
	{
		m_nextCombine += 1;
		if( m_nextCombine == m_combines->size() )
			m_nextCombine = 0;
	}

	m_combFadeDur = (float) ((*m_combines)[m_actCombine]->getTimeSolo());

	m_texState  = 0;
	m_combState = 0;
	m_texInterp  = 1.f;
	m_combInterp = 1.f;
	restart( m_clockEffectTexture );
	restart( m_clockEffectCombine );
}

// Remote-Szenen-Browser: DIREKT zu Szene idx springen (gleicher Sofort-Pfad
// wie ein manueller 'n'-Cut, aber mit gewähltem Ziel statt Zufalls-Roll).
void SceneScheduler::forceScene( int idx )
{
	if( !m_textures || idx < 0 || idx >= (int)m_textures->size() )
		return;
	m_forcedNextTexture = idx;
	m_forceEffectChange = true;
}

// Mood-basierter Auswahl-Bias - zwei Komponenten:
//   1. Busyness: Shader-Komplexität soll grob zum Arousal passen.
//   2. Mood-TAGS (config mood="dark,bright,calm,aggressive"): Bonus bei
//      Übereinstimmung, Malus bei klarem Widerspruch; ungetaggte bleiben
//      neutral.  Probabilistisch - ein Bias, kein harter Filter.
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

void SceneScheduler::tick( const Tick &t )
{
	std::vector<EffectShader *> &tex  = *m_textures;
	std::vector<EffectShader *> &comb = *m_combines;

	// Musical novelty: a strong harmonic / section change (a drop, a key
	// change) forces an early cross-fade - rate-limited, only while music
	// actually plays.
	m_noveltyCooldown -= t.dt;
	if( !m_reviewMode && m_noveltyCooldown <= 0.f &&
	    t.harmonicChange * t.musicPresence > 0.5f )
	{
		m_forceEffectChange = true;
		m_noveltyCooldown   = 8.0f;   // at most one musical cut every ~8 s
	}

	// SECTION change (Strophe -> Refrain -> Bridge) + Song-Struktur-Gedächtnis:
	// eine WIEDERKEHRENDE Section (Refrain #2 = Refrain #1) spielt Shader,
	// Combine und exakte Parameter von damals; eine NEUE rollt frisch und ihr
	// Look wird nach dem Wechsel unter der id gespeichert.
	if( !m_reviewMode && t.sectionCount == m_lastSectionCount + 1 )
	{
		int  id = t.sectionId;
		auto it = m_sectionEffect.find( id );
		bool known = (id >= 0) && it != m_sectionEffect.end()
		             && it->second < tex.size();
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
				m_nextTexture           = it->second;   // replay that section's shader
				m_pendingSectionRestore = id;           //   ... with its exact params
				auto ic = m_sectionCombine.find( id );
				if( ic != m_sectionCombine.end()
				    && ic->second < comb.size()
				    && ic->second != m_actCombine )
				{
					m_nextCombine        = ic->second;
					m_forceCombineChange = true;
				}
			}
			else
			{
				m_pendingSectionStore = id;             // remember the new look
				if( (t.sectionCount & 1) == 0 )
					m_forceCombineChange = true;        // bigger scenery change
			}
			m_forceEffectChange = true;
		}
		m_noveltyCooldown = 8.0f;     // hold off the harmonic hook right after
	}
	m_lastSectionCount = t.sectionCount;

	// DROP: immediate scene cut (still beat-quantised by the pending machinery,
	// but a drop IS a downbeat-scale accent).
	if( !m_reviewMode && t.dropCount == m_lastDropCount + 1 )
	{
		m_forceEffectChange = true;
		m_dropCutPending    = true;
		m_noveltyCooldown   = 8.0f;
	}
	m_lastDropCount = t.dropCount;

	// VJ PIN ('u'): suppress every forced cut while the current look is held.
	if( t.pinned )
	{
		m_forceEffectChange  = false;
		m_forceCombineChange = false;
		m_dropCutPending     = false;
		// A pending section store/restore must not attach to some LATER,
		// unrelated switch after unpinning - drop it.
		m_pendingSectionStore   = -1;
		m_pendingSectionRestore = -1;
	}

	// ---- Effekt-Zustandsmaschine: Solo ----
	if( m_texState == 0 )
	{
		m_texInterp = 1.0;

		float ts = secsSince( m_clockEffectTexture );

		// REVIEW MODE: fixed 8 s per scene, regardless of config/music pacing.
		if( m_reviewMode && m_texFadeDur > 8.f )
			m_texFadeDur = 8.f;

		// End the solo early on a manual ('n') or novelty-driven request, but
		// only after a brief minimum so cuts never come back-to-back.
		bool forced = m_forceEffectChange;
		if( ts > m_texFadeDur || (forced && ts > 0.6f) )
		{
			m_forceEffectChange   = false;
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

				// Roll a transition style: 28 styles (see FxPlain.frag),
				// the classic linear mix stays the most common.  Style 27
				// (portal) needs REAL depth on both sides - without two 3D
				// scenes it falls back to the zoom-through flight.
				{
					int r = rand() % 33;
					int st = (r <= 5) ? 0 : (r - 5);
					if( st == 27 && !( tex[m_actTexture]->is3D()
					                && tex[m_nextTexture]->is3D() ) )
						st = 3;
					// Dev-Haken: KALEIDO_TRANS_STYLE erzwingt einen Stil
					// (Proben einzelner Uebergaenge ohne Wuerfel-Glueck).
					if( const char *fs = getenv( "KALEIDO_TRANS_STYLE" ) )
						st = atoi( fs );
					m_transStyleTex = st;
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
					if( rand() % 2 )
					{
						m_transStyleTex = 0;
						m_texFadeDur    = 0.15f;
					}
					else
					{
						m_transStyleTex = 26;
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
				m_sectionCombine[m_pendingSectionStore] =
					(m_combState != 0) ? m_nextCombine : m_actCombine;
				m_sectionParams[m_pendingSectionStore]  =
					tex[m_actTexture]->snapshotParameters();
				m_pendingSectionStore = -1;
			}

			// Remote-Direktsprung gewinnt gegen ALLES (auch Review).
			if( m_forcedNextTexture >= 0
			    && m_forcedNextTexture < (int)tex.size() )
			{
				m_nextTexture       = m_forcedNextTexture;
				m_forcedNextTexture = -1;
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
			else
			for( unsigned int i = 0; i < kMaxSearch; i++ )
			{
				m_nextTexture = rand() % tex.size();
				if( m_nextTexture != m_actTexture &&
					(( tex[m_actTexture]->getComplexity() +
					tex[m_nextTexture]->getComplexity() +
					comb[m_actCombine]->getComplexity() +
					comb[m_nextCombine]->getComplexity() ) < 20 )
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

void SceneScheduler::tickCombine( const Tick &t, bool trueStereoHold )
{
	std::vector<EffectShader *> &tex  = *m_textures;
	std::vector<EffectShader *> &comb = *m_combines;

	// ---- Combine-Zustandsmaschine: Solo ----
	if( m_combState == 0 )
	{
		m_combInterp = 1.0;

		float ts = secsSince( m_clockEffectCombine );
		bool forcedC = m_forceCombineChange;
		// The true-stereo hold freezes combine switching: an eye-packed 3D
		// frame must not enter a combine cross-fade (the pending change fires
		// as soon as the hold lifts).
		if( !trueStereoHold
		    && (ts > m_combFadeDur || (forcedC && ts > 0.6f)) )
		{
			m_forceCombineChange   = false;
			m_pendingCombineChange = true;
			m_pendingCombineForced = m_pendingCombineForced || forcedC;
		}

		// Beat-quantised, like the texture-effect change (manual cuts fire
		// immediately here too).
		if( m_pendingCombineChange && !trueStereoHold )
		{
			m_pendingCombineAge += t.dt;
			if( m_pendingCombineForced || t.downbeatTick
			    || m_pendingCombineAge > 2.5f || t.gateSmooth < 0.25f )
			{
				bool forcedGo          = m_pendingCombineForced;
				m_pendingCombineChange = false;
				m_pendingCombineForced = false;
				m_pendingCombineAge    = 0.f;

				m_combState = 1;

				// Roll a transition style for the combine blend as well.
				{
					int r = rand() % 31;
					m_transStyleComb = (r <= 5) ? 0 : (r - 5);
				}

				unsigned int timeAct  = comb[m_actCombine]->getTimeInterpolation();
				unsigned int timeNext = comb[m_nextCombine]->getTimeInterpolation();

				{
					float cfgT = (float) (std::min( timeAct, timeNext)) / t.timingScale;
					if( !forcedGo && t.rhythmStrength > 0.55f
					    && t.estimatedBPM > 0.004f )
					{
						float fourBeats = 4.f * 60.f / (40.f + 160.f * t.estimatedBPM);
						cfgT = fminf(fmaxf(fourBeats, 1.2f), cfgT);
					}
					cfgT *= 1.f - 0.35f * t.logAttackTime;
					m_combFadeDur = forcedGo ? 0.8f : cfgT;
				}

				comb[m_nextCombine]->startInterpolators();

				restart( m_clockEffectCombine );
			}
		}
	}
	// ---- Combine-Zustandsmaschine: Fade läuft ----
	else
	{
		float ts = secsSince( m_clockEffectCombine );

		m_combInterp = (1 - ts / m_combFadeDur);

		if( ts > m_combFadeDur )
		{
			m_combState = 0;

			comb[m_actCombine]->resetParameters();
			m_actCombine = m_nextCombine;

			for( unsigned int i = 0; i < kMaxSearch; i++ )
			{
				m_nextCombine = rand() % comb.size();
				if( m_nextCombine != m_actCombine &&
					(( tex[m_actTexture]->getComplexity() +
					tex[m_nextTexture]->getComplexity() +
					comb[m_actCombine]->getComplexity() +
					comb[m_nextCombine]->getComplexity() ) < 20 )
					&& comb[m_nextCombine]->useShader()
					&& moodAccept( comb[m_nextCombine] )
					)
					break;
			}

			if( m_nextCombine == m_actCombine )
			{
				m_nextCombine += 1;
				if( m_nextCombine == comb.size() )
					m_nextCombine = 0;
			}

			m_combInterp = 1.0;

			m_combFadeDur = (float) (comb[m_actCombine]->getTimeSolo()) / t.timingScale;

			restart( m_clockEffectCombine );
		}
	}
}
