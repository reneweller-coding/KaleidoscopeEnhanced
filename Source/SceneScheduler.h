#ifndef SCENESCHEDULER_H
#define SCENESCHEDULER_H

// Szenen-Scheduler, herausgelöst aus FilterShader (Refactor 3/4 Teil c).
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
//  - Übergangs-Stile (26 Stile, linear bleibt am häufigsten)
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

class SceneScheduler
{
public:
	/** Effekt-Listen anbinden (Eigentum bleibt beim Aufrufer). */
	void attach( std::vector<EffectShader *> *textures,
	             std::vector<EffectShader *> *combines )
	{ m_textures = textures; m_combines = combines; }

	/** Initiale Zufallswahl + Uhren starten (der alte start()-Block). */
	void reset();

	// ---- Konfiguration / Zustand von außen ----
	void setReviewMode( bool on )   { m_reviewMode = on; }
	bool reviewMode() const         { return m_reviewMode; }
	void setMood( float arousal, float valence, float ambient )
	{ m_lastArousal = arousal; m_lastValence = valence; m_lastAmbient = ambient; }
	/** Gelerntes Taste (Skip-Malus/Favoriten-Bonus): Faktor je Fragment-Pfad.
	 *  Persistenz macht der Aufrufer; ohne Callback zählt alles als 1.0. */
	void setTasteCallback( std::function<float(const char *)> f ) { m_tasteFor = std::move(f); }

	// ---- VJ / Remote ----
	void requestChange( bool alsoCombine )
	{ m_forceEffectChange = true; if( alsoCombine ) m_forceCombineChange = true; }
	void forceScene( int idx );
	/** Solo-Alter des aktuellen Effekts (Skip-Malus-Fenster, !status etc.). */
	float actElapsedSec() const { return secsSince( m_clockEffectTexture ); }
	/** Freeze/Pin: Effekt-/Combine-Uhren re-armen, damit hinter dem
	 *  gehaltenen Bild kein Wechsel "fällig" wird. */
	void rearmEffectClocks() { restart( m_clockEffectTexture ); restart( m_clockEffectCombine ); }

	/** Frame-Eingaben für die Zustandsmaschinen. */
	struct Tick
	{
		float dt            = 0.f;    // timeSinceLastFrameSec (break-skaliert)
		bool  downbeatTick  = false;
		float gateSmooth    = 0.f;
		float timingScale   = 1.f;
		bool  pinned        = false;
		// Trigger
		float harmonicChange = 0.f;
		float musicPresence  = 0.f;
		int   sectionCount   = 0;
		int   sectionId      = -1;
		int   dropCount      = 0;
		// Übergangs-Timing
		float rhythmStrength = 0.f;
		float estimatedBPM   = 0.f;
		float logAttackTime  = 0.f;
	};

	/** Trigger auswerten + Effekt-Zustandsmaschine (läuft VOR den Passes). */
	void tick( const Tick &t );
	/** Combine-Zustandsmaschine - läuft NACH den Effekt-Passes an der alten
	 *  Stelle (trueStereoHold entsteht erst währenddessen). */
	void tickCombine( const Tick &t, bool trueStereoHold );

	// ---- Abfragen der Pipeline ----
	unsigned int actTexture()  const { return m_actTexture; }
	unsigned int nextTexture() const { return m_nextTexture; }
	unsigned int actCombine()  const { return m_actCombine; }
	unsigned int nextCombine() const { return m_nextCombine; }
	int   texState()   const { return m_texState; }    // 0 = Solo, 1 = Fade
	int   combState()  const { return m_combState; }
	float texInterp()  const { return m_texInterp; }   // 1 -> 0 während des Fades
	float combInterp() const { return m_combInterp; }
	int   transStyleTex()  const { return m_transStyleTex; }
	int   transStyleComb() const { return m_transStyleComb; }

private:
	using Clock = std::chrono::steady_clock;
	static void  restart( Clock::time_point &tp ) { tp = Clock::now(); }
	static float secsSince( const Clock::time_point &tp )
	{ return std::chrono::duration<float>( Clock::now() - tp ).count(); }

	bool  moodAccept( EffectShader *s ) const;
	float tasteOf( const char *frag ) const { return m_tasteFor ? m_tasteFor( frag ) : 1.f; }

	std::vector<EffectShader *> *m_textures = nullptr;
	std::vector<EffectShader *> *m_combines = nullptr;

	// Auswahl-Zustand
	unsigned int m_actTexture  = 0;
	unsigned int m_nextTexture = 0;
	unsigned int m_actCombine  = 0;
	unsigned int m_nextCombine = 0;
	int   m_texState   = 0;
	int   m_combState  = 0;
	float m_texInterp  = 1.f;
	float m_combInterp = 1.f;
	float m_texFadeDur  = 10.f;   // aktuelle Solo- BZW. Fade-Dauer (wie zuvor doppelt genutzt)
	float m_combFadeDur = 10.f;
	Clock::time_point m_clockEffectTexture = Clock::now();
	Clock::time_point m_clockEffectCombine = Clock::now();
	static const unsigned int kMaxSearch = 100;

	// Erzwungene Wechsel + Beat-Quantisierung
	bool  m_forceEffectChange   = false;
	bool  m_forceCombineChange  = false;
	int   m_forcedNextTexture   = -1;
	bool  m_pendingEffectChange = false;
	bool  m_pendingEffectForced = false;
	float m_pendingEffectAge    = 0.f;
	bool  m_pendingCombineChange = false;
	bool  m_pendingCombineForced = false;
	float m_pendingCombineAge    = 0.f;

	// Trigger-Buchhaltung
	float m_noveltyCooldown  = 0.f;
	int   m_lastSectionCount = 0;
	int   m_lastDropCount    = 0;

	// Song-Struktur-Gedächtnis
	std::map<int, unsigned int>       m_sectionEffect;
	std::map<int, unsigned int>       m_sectionCombine;
	std::map<int, std::vector<float>> m_sectionParams;
	int   m_pendingSectionStore   = -1;
	int   m_pendingSectionRestore = -1;

	// Review-Modus
	bool  m_reviewMode = false;
	std::vector<int> m_reviewOrder;
	int   m_reviewPos  = 0;

	// Übergangs-Stile
	int   m_transStyleTex  = 0;
	int   m_transStyleComb = 0;

	// Mood-Snapshot für moodAccept
	float m_lastArousal = 0.5f;
	float m_lastValence = 0.5f;
	float m_lastAmbient = 0.f;

	std::function<float(const char *)> m_tasteFor;
};

#endif
