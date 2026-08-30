/**
 * @file glwidget.cpp
 * @brief Implements GLwidget: the timer-driven render loop, configuration
 *        loading/switching, keyboard/mouse input, the MIDI/audio-menu/lyrics
 *        overlays, and persisted UI settings.
 */
#include <math.h>

#include <QtCore/QFile>
#include <QtCore/QFileInfo>
#include <QtCore/QBuffer>
#include <QtCore/QDateTime>
#include <QtCore/QFileSystemWatcher>
#include <QtCore/QTimer>
#include <QtCore/QCoreApplication>
#include <QtCore/QSettings>
#include <QtCore/QProcess>
#include <QtCore/QDir>
#include <QtGui/QMouseEvent>
#include <QtGui/QScreen>
#include <QtGui/QPainter>
#include <QtWidgets/QMessageBox>
#include <QtGui/QImage>

#include <QtCore/qdir.h>
#include <QtCore/qfileinfo.h>

//#include<GL/GLU.h>

#include "glcore.h"        // core-profile GL entry points (glcoreInit)
#include "glwidget.h"
#include "PlatformQt.h"
#include "WebRemote.h"
#include "UpdateCheck.h"
#include "Version.h"
#include "SpoutOut.h"    // global facades, released once in ~GLwidget
#include "SpoutIn.h"
#include "VideoIn.h"
#include "VideoPiP.h"
#include "Strings.h"

 #ifndef GL_MULTISAMPLE
 #define GL_MULTISAMPLE  0x809D
 #endif

// Start configuration requested on the command line (-c <name>); empty = default.
QString GLwidget::s_startConfig;
int     GLwidget::s_remotePort  = 8080;   // on by default (LAN-only, auto-discovered); -t 0 disables
bool    GLwidget::s_remotePortFromCli = false;
bool    GLwidget::s_batchRender = false;

namespace {

/// What a key press meant to a scrolling overlay menu.
enum class MenuKey { None, Moved, Accept, Cancel };

/**
 * @brief Common key handling for the scrolling overlay menus.
 *
 * Shared by the preset picker and the audio-source picker so the two cannot
 * drift apart: both had a nine-entry ceiling because selection was bound to
 * the digit keys, and both are now driven by a cursor instead.
 *
 * Returns MenuKey::None for anything it does not consume, so the caller falls
 * through to the normal handler and the digit shortcuts keep working.
 */
MenuKey menuNavKey( int key, int &cursor, int count )
{
	if( count <= 0 )
		return MenuKey::None;
	switch( key )
	{
		case Qt::Key_Up:       cursor = ( cursor - 1 + count ) % count;   return MenuKey::Moved;
		case Qt::Key_Down:     cursor = ( cursor + 1 ) % count;           return MenuKey::Moved;
		case Qt::Key_PageUp:   cursor = std::max( 0, cursor - 5 );        return MenuKey::Moved;
		case Qt::Key_PageDown: cursor = std::min( count - 1, cursor + 5 ); return MenuKey::Moved;
		case Qt::Key_Home:     cursor = 0;                                return MenuKey::Moved;
		case Qt::Key_End:      cursor = count - 1;                        return MenuKey::Moved;
		case Qt::Key_Return:
		case Qt::Key_Enter:    return MenuKey::Accept;
		// Escape quits the app everywhere else; inside a menu it has to mean
		// "never mind, close this" instead.
		case Qt::Key_Escape:   return MenuKey::Cancel;
		default:               return MenuKey::None;
	}
}

/**
 * @brief Clamp a menu cursor and derive the first visible row.
 *
 * Scrolls by as little as possible, so the list does not jump around under the
 * user when the cursor merely steps past the edge.
 */
void menuScroll( int &cursor, int &top, int count, int visible )
{
	cursor = std::max( 0, std::min( cursor, count - 1 ) );
	if( cursor < top )
		top = cursor;
	if( cursor >= top + visible )
		top = cursor - visible + 1;
	top = std::max( 0, std::min( top, count - visible ) );
}

/**
 * @brief Feeds one key into a menu's type-to-filter string.
 *
 * Backspace removes a character, printable characters append. Any change puts
 * the cursor back on the first match, since the row it pointed at is usually
 * not in the new result set.
 */
bool menuFilterKey( QKeyEvent *e, QString &filter, int &cursor )
{
	if( e->key() == Qt::Key_Backspace )
	{
		if( !filter.isEmpty() ) { filter.chop( 1 ); cursor = 0; }
		return true;
	}
	const QString t = e->text();
	if( t.size() != 1 || !t.at( 0 ).isPrint() )
		return false;
	// A leading space would only ever match everything, so ignore it; inside
	// the filter it is meaningful, because device names are full of them.
	if( t.at( 0 ).isSpace() && filter.isEmpty() )
		return false;
	filter.append( t );
	cursor = 0;
	return true;
}

/**
 * @brief Which row of a menu a point falls on, or -1 for none.
 * @param hit Geometry recorded by that menu's last draw.
 * @param p   Point in widget coordinates.
 */
int menuRowAt( const MenuHit &hit, const QPoint &p )
{
	if( hit.rowH <= 0 || hit.rows <= 0 || !hit.box.contains( p ) )
		return -1;
	const int rel = p.y() - hit.rowY0;
	if( rel < 0 )
		return -1;
	const int row = rel / hit.rowH;
	return ( row < hit.rows ) ? hit.top + row : -1;
}

}   // namespace

// ---- Web-remote hooks (called from WebRemote on the main thread) ----
QStringList GLwidget::remoteConfigNames() const
{
	QStringList out;
	for( Configuration *c : m_configurationList )
		out << c->getConfigurationName();
	return out;
}

int GLwidget::remoteActiveConfig() const
{
	for( size_t i = 0; i < m_configurationList.size(); ++i )
		if( m_configurationList[i] == m_actConfiguration )
			return int(i);
	return -1;
}

// The active config can be one that ISN'T in m_configurationList at all --
// a hidden preset picked with -c, most commonly "Komplett". remoteActiveConfig()
// then returns -1 and the remote's preset row highlights nothing, which reads
// as "the remote doesn't know what's playing". Reporting the NAME separately
// lets the page label it even when there is no button to light up.
QString GLwidget::remoteActiveConfigName() const
{
	return m_actConfiguration ? m_actConfiguration->getConfigurationName() : QString();
}

QString GLwidget::remoteScreenshot()
{
	QImage img = grabFramebuffer();
	QString fn = QString( "kaleidoscope_%1.png" )
	             .arg( QDateTime::currentDateTime().toString( "yyyyMMdd_hhmmss" ) );
	if( !img.save( fn ) )
		return QString();
	fprintf( stderr, "Saved screenshot: %s\n", fn.toLocal8Bit().constData() );
	return fn;
}

void GLwidget::remoteTapTempo()
{
	if( m_audioAnalyzer )
		m_audioAnalyzer->tapTempo();
}

QString GLwidget::remoteShaderInfo() const
{
	if( m_actConfiguration && m_actConfiguration->m_renderPipeline )
		return m_actConfiguration->m_renderPipeline->activeShaderInfo();
	return QString();
}

// ---- Optional update check ------------------------------------------------
// m_update stays null unless the setting is on, so with the feature switched
// off nothing here ever touches the network.
QString GLwidget::appVersion() const { return QString::fromLatin1( KALEIDOSCOPE_VERSION ); }

bool GLwidget::updateAvailable() const
{
	return m_update && m_update->updateAvailable();
}

QString GLwidget::updateVersion() const
{
	return m_update ? m_update->latestVersion() : QString();
}

QString GLwidget::updateStatus() const
{
	return m_update ? m_update->status() : QString();
}

void GLwidget::remoteInstallUpdate()
{
	if( m_update )
		m_update->downloadAndInstall();
}

void GLwidget::remoteSelectConfig( int idx )
{
	if( idx >= 0 && idx < (int)m_configurationList.size()
	    && m_configurationList[idx] != m_actConfiguration )
		switchConfig( m_configurationList[idx] );
}

void GLwidget::remoteNextEffect()
{
	if( m_actConfiguration && m_actConfiguration->m_renderPipeline )
		m_actConfiguration->m_renderPipeline->requestSceneChange();
}

void GLwidget::remoteFavorite()
{
	if( m_actConfiguration && m_actConfiguration->m_renderPipeline )
		m_actConfiguration->m_renderPipeline->favoriteCurrentEffect();
}

void GLwidget::remoteToggleMark()
{
	if( m_actConfiguration && m_actConfiguration->m_renderPipeline )
		m_actConfiguration->m_renderPipeline->toggleMarkCurrentScene();
}

void GLwidget::remoteSaveMarked()
{
	if( m_actConfiguration && m_actConfiguration->m_renderPipeline )
		m_actConfiguration->m_renderPipeline->saveMarkedPreset();
}

QStringList GLwidget::remoteSceneNames()
{
	if( m_actConfiguration && m_actConfiguration->m_renderPipeline )
		return m_actConfiguration->m_renderPipeline->sceneNames();
	return QStringList();
}

void GLwidget::remoteForceScene( int idx )
{
	if( m_actConfiguration && m_actConfiguration->m_renderPipeline )
		m_actConfiguration->m_renderPipeline->forceScene( idx );
}

// On-disk thumbnail cache path for one (config, scene) pair. Sibling of
// Configurations\/kaleidoscope_settings.ini (relative to the Release/Debug
// CWD), keyed by NAME rather than index since indices aren't stable across
// restarts (a config edit reorders/adds entries) but names are.
static QString thumbCachePath( const QString &config, const QString &scene )
{
	return Platform::assetPath( "..\\ThumbCache\\" + config + "\\" + scene + ".jpg" );
}

QByteArray GLwidget::remoteThumb( int idx ) const
{
	if( idx >= 0 && idx < int( m_sceneThumbs.size() ) && !m_sceneThumbs[idx].isEmpty() )
		return m_sceneThumbs[idx];

	// Not captured yet THIS session -- fall back to a thumbnail persisted by
	// a past one, if this exact scene was ever landed on before. Read fresh
	// each time rather than caching into m_sceneThumbs: misses are rare
	// (fires once per not-yet-revisited scene while the browser is open)
	// and this keeps remoteThumb() const.
	if( idx >= 0 && m_actConfiguration )
	{
		const QStringList names = m_actConfiguration->m_renderPipeline
		                               ? m_actConfiguration->m_renderPipeline->sceneNames()
		                               : QStringList();
		if( idx < names.size() )
		{
			QFile f( thumbCachePath( m_actConfiguration->getConfigurationName(), names[idx] ) );
			if( f.open( QIODevice::ReadOnly ) )
				return f.readAll();
		}
	}
	return QByteArray();
}

QByteArray GLwidget::remoteSnapshot()
{
	m_snapWantedUntil = m_fpsTimer.elapsed() + 10000;
	return m_snapJpg;
}
bool    GLwidget::s_autoRecord = false;

void GLwidget::traverseConfigurations( const QString& dirname, std::vector<Configuration *> &configurationList )
{
  QDir dir( dirname );
  dir.setFilter( QDir::Dirs | QDir::Files | QDir::NoSymLinks );

  const QFileInfoList fileinfolist = dir.entryInfoList();
  foreach( const QFileInfo& fi,fileinfolist ) {
    if( fi.baseName() == "." || fi.baseName() == ".."  || fi.baseName() == "" ) 
	{
      continue;
    }
    if( fi.isDir() && fi.isReadable() )
	{
      // This is the conditional for recursion
      traverseConfigurations( fi.absoluteFilePath(), configurationList );
    }
    else 
	{
		/*if( fi.QImageReader::canRead(  ) )*/
		if( fi.suffix() == "xml" )
		{
			//do something;
			Configuration *conf = new Configuration( fi.filePath() );
			configurationList.push_back( conf );
		}
    }
  }
}



GLwidget::GLwidget( QWidget *parent )
: QOpenGLWidget(parent)
, m_xTrans(0.0)
, m_yTrans(0.0)
, m_zTrans(-2)
, m_showSelectConfigurationMenu(false)
, m_showFeatureOverlay(false)
, m_audioAnalyzer(nullptr)
, m_fpsCounter(0)
, m_fpsValue(0)
, m_fpsLastPeriod(0)
{
	setFocusPolicy(Qt::StrongFocus);
	setFocus();

	//m_directory = "C:\\Users\\weller\\Pictures";

	// Restore persisted UI state (auto-config / auto-scale toggles, and the last
	// active config as the default start config) before we pick the start config.
	loadUiSettings();

	m_configurationList.clear();
	traverseConfigurations( Platform::assetPath( "..\\Configurations" ) /*directory*/,
	                        m_configurationList );

	// Embedded web remote (CLI -t <port>): phone page with the same harmless
	// controls as the keyboard.  Parented to this widget; main-thread events.
	if( s_remotePort > 0 )
		new WebRemote( this, s_remotePort );

	// Optional update check -- OFF unless switched on in the setup tool, and
	// even then it only ASKS GitHub and reports; downloading and running the
	// installer needs a separate, explicit action (see UpdateCheck.h).
	if( m_updateCheck )
	{
		m_update = new UpdateCheck( this );
		m_update->start();
	}

	// Shader HOT-RELOAD (dev aid): watch every user shader; a saved file is
	// recompiled live on the next frame.  Editors often save via replace, so
	// the (dropped) watch path is re-added shortly after each change.
	{
		QStringList watch;
		for( const QString &d : { QString("..\\Scene2D"), QString("..\\FX"),
		                          QString("..\\Transitions") } )
			for( const QFileInfo &fi : QDir(Platform::assetPath(d)).entryInfoList({"*.frag"}, QDir::Files) )
				watch << fi.absoluteFilePath();
		if( !watch.isEmpty() )
		{
			m_shaderWatcher = new QFileSystemWatcher( this );
			m_shaderWatcher->addPaths( watch );
			connect( m_shaderWatcher, &QFileSystemWatcher::fileChanged, this,
			         [this]( const QString &p )
			{
				m_pendingReloads.insert( QFileInfo(p).fileName() );
				QTimer::singleShot( 250, this, [this, p]{
					if( QFile::exists(p) && m_shaderWatcher )
						m_shaderWatcher->addPath( p );
				} );
			} );
		}
	}

	// Robustness: a missing/empty Configurations directory used to crash here with
	// an out-of-range vector access.  Fail with a clear message instead.
	if( m_configurationList.empty() )
	{
		fprintf( stderr, "FATAL: no configuration *.xml files found in "
		                 "..\\Configurations - cannot start.\n" );
		exit( 1 );
	}

	// HIDDEN presets (hidden="true" on the root element, e.g. the Komplett
	// master reference and the Test* benches): moved to a side list so they
	// never appear in the user-facing selection — menu, digit keys, web
	// remote and auto-config all index m_configurationList only.  They stay
	// fully loadable via -c <name>; the by-name lookups search both lists.
	// The debug setting keeps them in the normal list, so the digit keys, the
	// menu and the web remote can reach Komplett and the Test* benches without
	// a command line. Off by default: they are a reference and an inspection
	// bench, not something to land on while enjoying the show.
	bool showHidden = false;
	{
		QSettings s( Platform::assetPath( "..\\kaleidoscope_settings.ini" ), QSettings::IniFormat );
		showHidden = s.value( "showHiddenPresets", false ).toBool();
	}
	// A preset built entirely from geom="mesh" scenes (Modelle) has nothing
	// left once the optional model pack is absent, and RenderPipeline would
	// fall back to a plain pass-through -- an entry in the menu that shows
	// the photos and nothing else. Take it out of the selection instead, so
	// unpacking the models is what makes it appear.
	for( size_t i = m_configurationList.size(); i-- > 0; )
	{
		Configuration *c = m_configurationList[i];
		if( c->m_loadedScenes == 0 && c->m_skippedMeshScenes > 0 && !c->isHidden() )
		{
			fprintf( stderr, "Configuration '%s' needs the 3D model pack "
			                 "(all %d of its scenes were skipped) - not offered.\n",
			         c->getConfigurationName().toLocal8Bit().constData(),
			         c->m_skippedMeshScenes );
			m_hiddenConfigurations.push_back( c );
			m_configurationList.erase( m_configurationList.begin() + i );
		}
	}

	for( size_t i = showHidden ? 0 : m_configurationList.size(); i-- > 0; )
		if( m_configurationList[i]->isHidden() )
		{
			fprintf( stderr, "Configuration '%s' is hidden (selectable only via -c).\n",
			         m_configurationList[i]->getConfigurationName().toLocal8Bit().constData() );
			m_hiddenConfigurations.push_back( m_configurationList[i] );
			m_configurationList.erase( m_configurationList.begin() + i );
		}
	if( m_configurationList.empty() )
	{
		// Every preset hidden: a broken setup — show them anyway rather than
		// dying, since each hidden file is still a complete, working preset.
		fprintf( stderr, "WARNING: every configuration is hidden - showing them anyway.\n" );
		m_configurationList.swap( m_hiddenConfigurations );
	}

	// The 3D models are an optional extra download, so a plain install has
	// none of the geom="mesh" scenes. Say so once, with the count: otherwise
	// the only symptom is "the catalogue is smaller than the docs claim",
	// which looks like a bug rather than a missing (optional) component.
	{
		int skipped = 0;
		for( Configuration *c : m_configurationList )       skipped += c->m_skippedMeshScenes;
		for( Configuration *c : m_hiddenConfigurations )    skipped += c->m_skippedMeshScenes;
		if( skipped > 0 )
			fprintf( stderr,
			         "3D model pack not installed: %d mesh scene(s) skipped. "
			         "Unpack the models into the Models folder to enable them.\n", skipped );
	}

	// Default to the first configuration, or the one requested with -c <name>.
	// -c searches the hidden list too: that is the dev/CI door into the
	// Komplett master and the Test* benches.
	m_actConfiguration = m_configurationList[0];
	if( !s_startConfig.isEmpty() )
	{
		bool found = false;
		for( const auto *lst : { &m_configurationList, &m_hiddenConfigurations } )
		{
			for( Configuration *c : *lst )
				if( c->getConfigurationName()
				        .compare( s_startConfig, Qt::CaseInsensitive ) == 0 )
				{
					m_actConfiguration = c;
					found = true;
					break;
				}
			if( found ) break;
		}
		if( !found )
			fprintf( stderr, "Configuration '%s' not found - using default.\n",
			         s_startConfig.toLocal8Bit().constData() );
	}

	resetRotation();
}

GLwidget::~GLwidget()
{
	// Zuletzt gewählten Zustand sichern - deckt den GRACEFUL Quit-Pfad ab
	// (Fenster-X, Menü "Exit": app.quit() -> app.exec() kehrt zurück ->
	// dieser Destruktor läuft). Die harten exit(0)-Stellen (Escape/Q/
	// Doppelklick) rufen saveAllSettings() zusätzlich VOR exit() selbst -
	// exit() unterbricht die Ausführung sofort und durchläuft KEINE
	// C++-Destruktoren, dieser hier käme für sie also nie zum Zug.
	saveAllSettings();

	// Closing mid-recording: finalise cleanly (drains + joins the encoder
	// worker) WHILE the audio analyzer is still alive — the recorder closes
	// the WAV through it.  After shutdown() the recorder never touches it.
	m_recorder.shutdown();
	if (m_audioAnalyzer) {
		m_audioAnalyzer->stop();
		m_audioAnalyzer->wait();
		delete m_audioAnalyzer;
	}
	if (m_nowPlaying) {
		m_nowPlaying->stop();
		delete m_nowPlaying;   // joins its thread
	}
	if (m_midi) {
		m_midi->stop();
		delete m_midi;
	}
	delete m_trackMedia;
	// The global Spout facades are released ONCE here (not per preset switch)
	// — with the GL context current, so the receiver texture dies cleanly.
	makeCurrent();
	spoutOutRelease();
	spoutInRelease();
	videoInRelease();
	videoPipRelease();
	// Keep the context current across the Configuration deletes too: each
	// ~RenderPipeline runs cleanTextures()/cleanShaderPrograms() (glDelete*), which
	// need a current GL context — otherwise those deletes are silently dropped
	// (GL_INVALID_OPERATION) and the cleanup is meaningless.
	for( unsigned int i = 0; i < m_configurationList.size(); i++ )
		delete m_configurationList[i];
	for( unsigned int i = 0; i < m_hiddenConfigurations.size(); i++ )
		delete m_hiddenConfigurations[i];
	doneCurrent();
}

/*void GLwidget::slotReloadShader(void)
{
	m_renderPipeline->loadShader();
	updateGL();
}*/


bool GLwidget::slotSetDirectory(const QString &filename)
{
	//bool success = m_renderPipeline->loadObj(filename.toAscii().data());
	//updateGL();

	m_directory = filename;
	return true;
}

void GLwidget::initializeGL() 
{ 
	//glEnable(GL_DEPTH_TEST);
	//glEnable(GL_RESCALE_NORMAL);
	//glEnable(GL_CULL_FACE);
	//glShadeModel(GL_SMOOTH); // we use flat shading
	//glEnable(GL_LIGHTING); // enable lighting
	//glEnable(GL_LIGHT0);
	//glLightModeli(GL_LIGHT_MODEL_TWO_SIDE,GL_TRUE);


	// Load OpenGL core entry points now that we have a current context
	// (glcore replaced GLee for the 4.3-core migration; compute entries are
	// optional, everything else is required).
	if( !glcoreInit() )
		fprintf( stderr, "FATAL: required OpenGL core functions missing\n" );

	m_actConfiguration->start( 100, 100 );

	const char *version = (const char *)(glGetString(GL_VERSION));
	fprintf(stderr,"VERSION %s (core profile)\n",version);

	// Same gate as checkGLErrors(), and far more useful: the driver names the
	// call that failed and usually why, where a glGetError() checkpoint can only
	// report where the failure was NOTICED -- often several subsystems past the
	// cause, which sends the reader to the wrong file.
	if( qEnvironmentVariableIsSet( "KALEIDO_GL_DEBUG" ) )
		glcoreEnableDebugOutput();

	// Complete every fixed sampler unit ONCE, before anything draws.
	//
	// The engine parcels its texture units out statically: photos on 0-2, the
	// sims on 7-11, the compute effects on 12-27 (kCfxInfo), spectrum on 28,
	// shadow maps on 31/32. Every shader's sampler uniforms point at those
	// units from its first frame -- but the textures only appear once their
	// producer has run, and a draw is validated against every declared sampler,
	// reached or not. So each scene's very first frames validated against
	// empty units, a few warnings per scene activation, hundreds per catalogue
	// sweep. A complete 1x1 stand-in on each unit ends that; every real
	// producer simply binds over it.
	{
		const GLuint d2 = glcoreDummyTex2D();
		for( int u = 0; u <= 28; ++u )
		{
			glActiveTexture( GL_TEXTURE0 + u );
			glBindTexture( GL_TEXTURE_2D, d2 );
		}
		// The shadow units carry a COMPARE-mode sampler; their stand-in reads
		// depth 1.0 = nothing occludes, so an incoming shadow scene that fades
		// in before any shadow pass ever ran renders fully lit, not undefined.
		const GLuint ds = glcoreDummyShadow();
		glActiveTexture( GL_TEXTURE0 + 31 ); glBindTexture( GL_TEXTURE_2D, ds );
		glActiveTexture( GL_TEXTURE0 + 32 ); glBindTexture( GL_TEXTURE_2D, ds );
		glActiveTexture( GL_TEXTURE0 );
	}

	// Migration/validation aid: compile every shader of the active preset
	// eagerly, then quit — the log holds one verdict per shader.
	if( qEnvironmentVariableIsSet( "KALEIDO_COMPILE_ALL" ) )
	{
		if( m_actConfiguration->m_renderPipeline )
			m_actConfiguration->m_renderPipeline->compileAllShaders();
		fflush( stderr );
		exit( 0 );
	}

	// Start audio analyser (WASAPI loopback – captures any playing audio)
	m_audioAnalyzer = new AudioAnalyzer(this);
	m_audioAnalyzer->start();
	m_recorder.setAudioAnalyzer( m_audioAnalyzer );

	// Start the "now playing" poller (SMTC: title/artist of the current track).
	m_nowPlaying = new NowPlaying();
	m_nowPlaying->start();

	// Lyrics + Künstlerbilder (LRCLIB / Deezer) - lädt erst bei Trackwechsel
	// und nur, wenn einer der Modi aktiv ist.
	m_trackMedia = new TrackMedia();
	// Test-Hook: KALEIDO_LYRICS_TEST="Artist|Titel" erzwingt einen Abruf ohne
	// laufenden Player; die Playback-Position läuft dann auf der App-Uhr
	// (deterministisch für Batch-Proben).  KALEIDO_LYRICS_MODE=1|2 wählt den
	// Modus, Künstlerbilder gehen mit an.
	{
		QByteArray t = qgetenv( "KALEIDO_LYRICS_TEST" );
		if( !t.isEmpty() )
		{
			QStringList parts = QString::fromLocal8Bit( t ).split( '|' );
			if( parts.size() == 2 )
			{
				m_lyricsTest = true;
				m_artistShow = true;
				QByteArray md = qgetenv( "KALEIDO_LYRICS_MODE" );
				m_lyricsMode = md.isEmpty() ? 2 : qBound( 0, md.toInt(), 2 );
				m_trackStartMs = 0;
				QByteArray durEnv = qgetenv( "KALEIDO_VIDEO_TEST_DURATION" );
				double dur = durEnv.isEmpty() ? -1.0 : durEnv.toDouble();
				m_trackMedia->requestTrack( parts[0], parts[1], dur );
				fprintf( stderr, "[Lyrics] TESTMODUS: %s - %s (Modus %d)\n",
				         parts[0].toLocal8Bit().constData(),
				         parts[1].toLocal8Bit().constData(), m_lyricsMode );
			}
		}
	}

	// Optional MIDI control: opens the first controller if one is connected.
	m_midi = new MidiInput();
	if( m_midi->start() )
		fprintf( stderr, "MIDI input: %s\n", m_midi->deviceName().toLocal8Bit().constData() );

#ifdef WIN32
	// Kiosk / installation: keep the display on and suppress the screensaver and
	// system standby for as long as the visualizer runs (ES_CONTINUOUS makes the
	// request persistent without needing to be re-issued).
	SetThreadExecutionState( ES_CONTINUOUS | ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED );
#endif

	// start FPS timer (shown in the 'i' overlay)
	m_fpsTimer.start();
	m_fpsLastPeriod = 0;
	m_fpsCounter    = 0;

	// Ceiling for the adaptive render scale.
	//
	// This used to be `renderScale()` unconditionally, which made the adaptation
	// a ONE-WAY RATCHET: the controller lowers the scale when it sees < 45 fps,
	// RenderPipeline persists that lowered value to the settings file, and the
	// next launch then adopted it as the CEILING as well. Floor and ceiling met
	// at the 0.35 minimum and the scale could never climb back -- the app stayed
	// at 12% of the pixel count on hardware idling at 60 fps, with no way out but
	// hand-editing the ini. Measured here: 61-63 fps at scale 0.35 and not one
	// upward adjustment, because `scale < m_autoScaleMax` was 0.35 < 0.35.
	//
	// An EXPLICIT -s is still honoured as a hard ceiling, which was the original
	// intent; the persisted working value no longer is.
	// A ceiling ABOVE 1.0 is a quality request, not something to creep up on:
	// climbing 1.0 -> 2.0 in 0.05 steps would be 20 visible resolution changes
	// over half a minute. Start AT the requested quality and let the adaptive
	// scaler walk it back only if the machine cannot hold the target rate.
	if( !RenderPipeline::s_renderScaleFromCli
	    && RenderPipeline::renderScaleMax() > RenderPipeline::renderScale() )
		RenderPipeline::setRenderScale( RenderPipeline::renderScaleMax() );

	m_autoScaleMax  = RenderPipeline::s_renderScaleFromCli
	                ? RenderPipeline::renderScale()
	                : RenderPipeline::renderScaleMax();

	// Periodic refresh timer, paced to the DISPLAY, not to a hard-coded 60 Hz.
	//
	// This was startTimer(16.666666666666) -- and startTimer takes an int, so it
	// truncated to 16 ms and pinned the whole app to ~62 Hz no matter what the
	// panel could do. On a 120/144/240 Hz monitor or TV that threw away most of
	// the refresh rate for no reason: measured here, the renderer sits at 60-63
	// fps with the render scale still at its 0.35 floor, i.e. there is plenty of
	// GPU headroom going unused.
	//
	// Animation is unaffected by the change of rate: both time bases integrate a
	// MEASURED delta (RenderPipeline::paint adds m_nanotimer.elapsed() to
	// m_globaltime, and AudioConditioner::update takes the same dt for the
	// audioPhase/audioAdvance accumulators), so motion speed is wall-clock based
	// and identical at any frame rate.
	int refreshMs = 16;
	if( QScreen *sc = screen() )
	{
		const qreal hz = sc->refreshRate();
		if( hz > 20.0 )                       // ignore bogus/unknown values
			refreshMs = int( 1000.0 / hz );   // 60 Hz -> 16, 144 Hz -> 6, 240 Hz -> 4
	}
	if( refreshMs < 1 ) refreshMs = 1;
	m_displayHz = ( refreshMs > 0 ) ? 1000.0f / float( refreshMs ) : 60.0f;
	fprintf( stderr, "Render timer: %d ms (%.1f Hz display)\n",
	         refreshMs, screen() ? screen()->refreshRate() : 0.0 );
	startTimer( refreshMs );

	// CLI -r: begin recording straight away (for testing / debugging).
	if( s_autoRecord )
		m_recorder.toggle();

	//glEnable(GL_MULTISAMPLE); //rwrwforeground
	setAutoFillBackground(false); //rwrwforeground
}

void GLwidget::paintGL()
 {
	 draw();

	//qglColor(Qt::white);
    //renderText(100, 100, "txt", QFont("Arial", 32, QFont::Bold, false) );


	//glDisable(GL_LIGHTING);
    //glDisable(GL_DEPTH_TEST);
    //qglColor(Qt::white);
    //renderText(100, 100, "Dies ist ein langer OpenGL Text", QFont("Arial", 48, QFont::Bold, false) );
    //glEnable(GL_DEPTH_TEST);
    //glEnable(GL_LIGHTING);

	// FPS measurement: recompute once per second, shown in the 'i' overlay.
	const qint64 now = m_fpsTimer.elapsed();
	if( now - m_fpsLastPeriod >= 1000 )
	{
		m_fpsValue      = int( m_fpsCounter * 1000.0 / double(now - m_fpsLastPeriod) + 0.5 );
		m_fpsCounter    = 0;
		m_fpsLastPeriod = now;
		// KALEIDO_FPS_LOG=1 also puts it in the log, with the render scale next
		// to it -- the two only mean something together, since updateAdaptiveScale()
		// trades one for the other and persists the result to the settings file.
		// Without this pairing a "slow" report is unattributable: a scale pinned
		// at its 0.35 floor and a genuinely expensive frame look identical.
		static const bool fpsLog = qEnvironmentVariableIsSet( "KALEIDO_FPS_LOG" );
		if( fpsLog )
			fprintf( stderr, "[fps] %d fps  renderScale %.2f\n",
			         m_fpsValue, RenderPipeline::renderScale() );
	}
	m_fpsCounter++;

	// Keep the frame rate near target by nudging the internal render scale.
	updateAdaptiveScale();
 }


//static unsigned int counterExportImages = 0;
//static bool save_images = true;



void GLwidget::draw()
{
	AudioFeatures audio;
	if (m_audioAnalyzer)
		audio = m_audioAnalyzer->getFeatures();

	// Track-change: a fresh track (after a silent gap) gets a clean transition.
	// Suppressed under KALEIDO_SCENE_SWEEP, where the sweep decides what is on
	// screen and a surprise cut would land in the middle of a scene under review.
	if( audio.trackChange && !sweepActive() && m_actConfiguration && m_actConfiguration->m_renderPipeline )
		m_actConfiguration->m_renderPipeline->requestSceneChange();

	// KALEIDO_SCENE_SWEEP=<seconds>: step through EVERY scene of the loaded
	// config in catalogue order, holding each for that many seconds. The
	// scheduler picks scenes at random by design, which is right for viewing
	// and useless for reviewing: to see all of a 500-entry catalogue by chance
	// you would have to render several times its length and would still miss
	// entries. This walks it exactly once. The recorder captures on the same
	// wall clock, so scene n sits at a known timestamp in the output file --
	// which is what makes a contact sheet attributable.
	if( sweepActive() && m_actConfiguration && m_actConfiguration->m_renderPipeline )
	{
		RenderPipeline  *rp    = m_actConfiguration->m_renderPipeline;
		const QStringList names = rp->sceneNames();

		// Review mode already exists for exactly this problem -- it stops the
		// scheduler cutting on harmonic changes, section boundaries and drops
		// -- but Configuration.cpp only turns it on for configs NAMED "Test*".
		// A sweep must not depend on what its config happens to be called: a
		// third of the windows in the first run were stolen mid-scene, which
		// is invisible in the output unless you happen to know a station
		// family has no synthwave grid.
		if( !m_sweepReview ) { m_sweepReview = true; rp->setReviewMode( true ); }
		const qint64      nowMs = m_fpsTimer.elapsed();
		const int         secs  = sweepSeconds();

		if( m_sweepNextMs < 0 || nowMs >= m_sweepNextMs )
		{
			if( m_sweepIdx < names.size() )
			{
				fprintf( stderr, "[sweep] %3d/%d  t=%.1fs  %s\n", m_sweepIdx,
				         int( names.size() ), nowMs * 0.001,
				         names[m_sweepIdx].toLocal8Bit().constData() );
				rp->forceScene( m_sweepIdx );
				m_sweepWant    = m_sweepIdx;
				m_sweepJumpMs  = nowMs;
				m_sweepRetried = false;
				m_sweepIdx++;
			}
			else if( m_sweepIdx == names.size() )
			{
				fprintf( stderr, "[sweep] finished after %d scenes\n", m_sweepIdx );
				m_sweepIdx++;                       // report once, then idle
			}
			m_sweepNextMs = nowMs + qint64( secs ) * 1000;
		}

		// The scheduler keeps its own counsel -- a musical trigger can cut away
		// mid-window. Reviewing the result then silently attributes frames to
		// the wrong scene, which is worse than a gap: it looks like a scene has
		// a backdrop it does not have. (That is exactly how this was found: a
		// synthwave grid appeared behind three station families whose shaders
		// contain no grid at all.) So log what is ACTUALLY on screen, and put
		// the requested scene back if it was taken away.
		const int act = rp->activeSceneIndex();
		if( act != m_sweepShown )
		{
			m_sweepShown = act;
			fprintf( stderr, "[shown] t=%.1fs  %3d  %s\n", nowMs * 0.001, act,
			         ( act >= 0 && act < names.size() )
			             ? names[act].toLocal8Bit().constData() : "?" );
		}
		// Only after the cross-fade has had time to land: during a fade
		// actTexture() still reports the OUTGOING scene, so retrying earlier
		// would cancel the fade it is waiting on and never converge.
		if( !m_sweepRetried && m_sweepWant >= 0 && act != m_sweepWant
		    && nowMs - m_sweepJumpMs > 3000 )
		{
			m_sweepRetried = true;
			fprintf( stderr, "[sweep] retry %d (scheduler cut to %d)\n", m_sweepWant, act );
			rp->forceScene( m_sweepWant );
		}
	}

	// Apply any queued MIDI control messages.
	applyMidi();

	// OSC output: hand the freshly fetched features to the sender. Beat events
	// leave immediately, the periodic layers rate-limit themselves; a render
	// frame (~7-16 ms) is the only latency added, well under the ~100 ms the
	// literature calls "tight" for beat-synchronous visuals.
	if( m_osc.enabled() )
	{
		const float dt = m_oscClock.isValid()
		               ? float( m_oscClock.restart() ) * 0.001f : 0.f;
		if( !m_oscClock.isValid() ) m_oscClock.start();
		m_osc.tick( audio, dt );
	}

	// Batch render (-x): once the offline WAV has been fully analysed, stop
	// the recording (which kicks off the detached ffmpeg mux) and quit —
	// unattended WAV-to-video rendering.
	if( s_batchRender && !m_batchStopping && m_audioAnalyzer
	    && m_audioAnalyzer->isFinished() )
	{
		m_batchStopping = true;
		if( m_recorder.recording() )
			m_recorder.toggle();
		fprintf( stderr, "BATCH: WAV done - exiting (the mp4 mux continues detached)\n" );
		QTimer::singleShot( 3000, []{ QCoreApplication::quit(); } );
	}

	// Hot-reload: recompile shaders whose files changed (GL context current).
	// Applied to EVERY configuration's pipeline; lazily-uncompiled programs
	// pick up the new source on their eventual first compile anyway.
	if( !m_pendingReloads.isEmpty() )
	{
		for( const QString &n : m_pendingReloads )
			for( const auto *lst : { &m_configurationList, &m_hiddenConfigurations } )
				for( Configuration *c : *lst )
					if( c && c->m_renderPipeline )
						c->m_renderPipeline->reloadFragment( n );
		m_pendingReloads.clear();
	}

	// Auto-config-by-mood (optional, key 'a'): may switch m_actConfiguration.
	updateAutoConfig( audio );

	// QOpenGLWidget renders into its own FBO, not framebuffer 0.  Tell the
	// pipeline where the final image must land, otherwise it draws off-screen.
	m_actConfiguration->m_renderPipeline->setDefaultFBO( defaultFramebufferObject() );

	m_actConfiguration->m_renderPipeline->paint(m_RotationMatrix, m_xTrans, m_yTrans, m_zTrans, audio);

	// Capture the clean frame (before any overlay is drawn) while recording
	// or while the instant-replay ring is armed.
	m_recorder.captureIfDue( m_width, m_height );

	// Web-remote live preview: while the phone page polls /api/snapshot,
	// refresh a small JPEG of the output ~1x per second (sync read, but rare
	// and only while someone is actually looking at the page).
	if( s_remotePort > 0 && m_fpsTimer.elapsed() < m_snapWantedUntil
	    && m_fpsTimer.elapsed() - m_snapLast > 900 && m_width > 1 && m_height > 1 )
	{
		m_snapLast = m_fpsTimer.elapsed();
		m_snapBuf.resize( size_t(m_width) * m_height * 4 );
		glPixelStorei( GL_PACK_ALIGNMENT, 1 );
		glReadPixels( 0, 0, m_width, m_height, GL_RGBA, GL_UNSIGNED_BYTE, m_snapBuf.data() );
		QImage img( m_snapBuf.data(), m_width, m_height, QImage::Format_RGBA8888 );
		QImage out = img.mirrored( false, true )
		                .scaledToHeight( 360, Qt::SmoothTransformation );
		QByteArray jpg;
		QBuffer buf( &jpg );
		buf.open( QIODevice::WriteOnly );
		out.save( &buf, "JPG", 70 );
		m_snapJpg = jpg;

		// Piggy-back a per-scene thumbnail off the same readback (no extra
		// glReadPixels): skip mid-transition frames (a crossfade blend isn't a
		// representative shot of either scene) and blackout. This only ever
		// grows the cache while the remote page is open, which is fine — the
		// scene browser just shows no image yet for scenes nobody has landed
		// on this session.
		RenderPipeline *rp = m_actConfiguration ? m_actConfiguration->m_renderPipeline : nullptr;
		if( rp && !rp->sceneTransitioning() && !RenderPipeline::blackout() )
		{
			const int sceneIdx = rp->activeSceneIndex();
			if( sceneIdx >= 0 )
			{
				QImage thumb = img.mirrored( false, true )
				                  .scaledToHeight( 120, Qt::SmoothTransformation );
				QByteArray tjpg;
				QBuffer tbuf( &tjpg );
				tbuf.open( QIODevice::WriteOnly );
				thumb.save( &tbuf, "JPG", 65 );
				if( sceneIdx >= int( m_sceneThumbs.size() ) )
					m_sceneThumbs.resize( sceneIdx + 1 );
				m_sceneThumbs[sceneIdx] = tjpg;

				// Persist to disk too, so a scene browsed in a PAST session
				// already has a thumbnail on the very first /api/thumb
				// request of this one (see remoteThumb()'s disk fallback)
				// instead of showing blank until the scheduler happens to
				// land on it again. Keyed by config+scene NAME (stable
				// across restarts), not index (isn't).
				const QStringList names = rp->sceneNames();
				if( sceneIdx < names.size() )
				{
					const QString path = thumbCachePath(
					    m_actConfiguration->getConfigurationName(), names[sceneIdx] );
					QDir().mkpath( QFileInfo( path ).absolutePath() );
					QFile f( path );
					if( f.open( QIODevice::WriteOnly ) )
						f.write( tjpg );
				}
			}
		}
	}

	// Config cross-fade: draw the captured previous frame on top, fading out.
	float fadeAlpha = 0.f;
	if( m_fadeStart >= 0 )
	{
		const qint64 dur = 700;                          // fade length (ms)
		qint64 el = m_fpsTimer.elapsed() - m_fadeStart;
		if( el >= dur || m_fadePixmap.isNull() )
		{
			m_fadeStart = -1;                            // done
			m_fadePixmap = QPixmap();
		}
		else
			fadeAlpha = 1.f - float(el) / float(dur);
	}

	// Now-playing TITLE REVEAL: on a track change the title is handed to the
	// engine, which weaves it through the picture in the present pass (the
	// text unfolds out of a kaleidoscopic swirl — replaces the old QPainter
	// lower third).  Toggle stays on key 'p'.
	float npAlpha = 0.f;   // the QPainter lower third is retired (reveal instead)
	if( m_nowPlaying && m_showNowPlaying )
	{
		QString npTitle = m_nowPlaying->title();
		if( !npTitle.isEmpty() && npTitle != m_lastNpTitle )
		{
			m_lastNpTitle = npTitle;
			m_npShownAt   = m_fpsTimer.elapsed();
			if( m_actConfiguration && m_actConfiguration->m_renderPipeline )
				m_actConfiguration->m_renderPipeline->showTitle( npTitle,
				                                               m_nowPlaying->artist() );
			// Trackwechsel: Lyrics + Künstlerbilder für den neuen Titel holen
			// (nur wenn ein Modus aktiv ist - sonst keine Netz-Anfragen).
			m_trackStartMs = m_fpsTimer.elapsed();
			m_posSmooth    = -1.0;   // Consumer-PLL neu aufsetzen (neuer Song = neue Zeitachse)
			m_palValid     = false;  // Cover-Palette gehoert zum alten Kuenstler
			m_lastKaraokeLineSeen = -1;
			m_lineChangeMs = -1;
			if( m_trackMedia && !m_lyricsTest
			    && ( m_lyricsMode > 0 || m_artistShow ) )
			{
				// Music-video search only makes sense (and is only worth the
				// download) when the artist-image corner is actually shown --
				// that's the slot it takes over. Passing <=0 when it's off
				// makes requestTrack() skip the video gate entirely (see
				// TrackMedia.h), no separate flag needed there.
				const double durSec = ( m_artistShow && m_videoEnabled )
				                      ? m_nowPlaying->timeline().durationSec : -1.0;
				m_trackMedia->requestTrack( m_nowPlaying->artist(), npTitle, durSec );
			}
		}
	}

	// Lyrics-/Künstlerbild-Overlay: Zustand berechnen + Texturen hochladen
	// (GL-Kontext ist hier aktuell), dann an den PresentPass durchreichen.
	if( m_actConfiguration && m_actConfiguration->m_renderPipeline )
		updateTrackOverlays( m_actConfiguration->m_renderPipeline );
	// Demo/test hook: KALEIDO_TITLE_TEST=1 fires one reveal a few seconds in
	// (lets the reveal be tuned without a real media session running).
	{
		static bool titleTest = qEnvironmentVariableIsSet( "KALEIDO_TITLE_TEST" );
		if( titleTest && m_fpsTimer.elapsed() > 3000 )
		{
			titleTest = false;
			if( m_actConfiguration && m_actConfiguration->m_renderPipeline )
				m_actConfiguration->m_renderPipeline->showTitle( "Neon Cathedral",
				                                               "The Prisms" );
		}
	}

	//printf( "Painting Now\n" );
	// Only spin up a QPainter when an overlay or the cross-fade needs it, so the
	// normal render path is pure GL (no QPainter/GL state interaction).
	if( m_showSelectConfigurationMenu || m_showFeatureOverlay || m_showHelp
	    || m_showAudioMenu || m_showShaderInfo || m_recorder.recording()
	    || fadeAlpha > 0.f || npAlpha > 0.f )
	{
		QPainter painter(this);
		//painter.setRenderHint(QPainter::Antialiasing);
		if( fadeAlpha > 0.f )
		{
			painter.setOpacity( fadeAlpha );
			painter.drawPixmap( rect(), m_fadePixmap );
			painter.setOpacity( 1.0 );
		}
		if( m_showSelectConfigurationMenu )
			showSelectConfigurationsMenu( &painter );
		if( m_showFeatureOverlay )
			drawFeatureOverlay( &painter, audio );
		if( m_showHelp )
			drawHelpOverlay( &painter );
		if( m_showAudioMenu )
			drawAudioMenu( &painter );
		if( m_showShaderInfo && m_actConfiguration && m_actConfiguration->m_renderPipeline )
		{
			QString info = m_actConfiguration->m_renderPipeline->activeShaderInfo();
			QStringList rows = info.split('\n');
			int y = height() - 120;
			painter.fillRect( 20, y - 24, 720, 28 * rows.size() + 16, QColor(0, 0, 0, 175) );
			painter.setFont( QFont("Consolas", 13, QFont::Bold) );
			for( int i = 0; i < rows.size(); ++i )
			{
				painter.setPen( QColor(140, 230, 170) );
				painter.drawText( 34, y + i * 28, rows[i] );
			}
		}
		if( m_recorder.recording() )
		{
			painter.setBrush( QColor(230, 40, 40) );
			painter.setPen( Qt::NoPen );
			painter.drawEllipse( width() - 150, 26, 16, 16 );
			painter.setPen( QColor(255, 255, 255) );
			painter.setFont( QFont("Consolas", 12, QFont::Bold) );
			painter.drawText( width() - 126, 39, QString::fromUtf8( Strings::T( S_REC_FMT ) ).arg(m_recorder.frameCount()) );
		}
		painter.end();
	}

	/*if (save_images)
	{
		QString efn = "G:/temp/file";
		efn.append( QString::number(counterExportImages) );
		efn.append(".png");

		//printf("Saving Image: %d\n", efn.data() );

		this->grabFrameBuffer().save(efn);
		counterExportImages++;
	}*/

}


/**
 * @brief Draw the configuration picker (key '0').
 *
 * The list scrolls and filters: the digit keys only ever reached nine presets,
 * so anything past the ninth -- which the hidden-preset debug switch and a
 * saved Marked preset both push you past -- was simply unreachable. Arrow keys
 * move the cursor, typing narrows the list, Enter activates, and only a window
 * of the list is drawn so rows keep a readable size however many presets exist.
 *
 * Two things are marked, and they mean different things: the cursor bar is
 * where Enter would take you, the dot marks the preset that is actually
 * running. They coincide when the menu opens.
 */
void GLwidget::showSelectConfigurationsMenu( QPainter *painter )
{
	const QVector<int> hits = configMenuMatches();
	const int nrConfigurations = hits.size();

	// Sized from height(), NOT m_height: m_height is in DEVICE pixels
	// (height() * devicePixelRatio) while QPainter works in logical ones, so
	// deriving a point size from it scales the text up by the display's DPI
	// factor on top of Qt's own scaling. The old code did exactly that.
	// Clamped to the range the other overlays use (fixed 12-14 pt).
	const int fontsize = std::max( 10, std::min( height() / 45, 18 ) );
	QFont font = painter->font();
	font.setPointSize( fontsize );
	painter->setFont( font );
	QFontMetrics fm( painter->font() );

	const int lineH = fm.lineSpacing();
	const int padY  = lineH / 2;
	// Leave room for the title and the key hint, and never fill the screen.
	const int maxRows = std::max( 3, int( ( height() * 0.72 - 4 * lineH ) / lineH ) );
	const int visible = std::max( 0, std::min( nrConfigurations, maxRows ) );
	if( nrConfigurations > 0 )
		menuScroll( m_configMenuCursor, m_configMenuTop, nrConfigurations, visible );
	else
		m_configMenuCursor = m_configMenuTop = 0;

	const QString title = QString::fromUtf8( Strings::T( S_MENU_CONFIG_TITLE ) )
	                    + ( m_configMenuFilter.isEmpty()
	                        ? QString()
	                        : QString( "   \"%1\"" ).arg( m_configMenuFilter ) );
	const QString hint  = QString::fromUtf8( Strings::T( S_MENU_NAV_HINT ) );

	int maxTextW = std::max( fm.horizontalAdvance( title ), fm.horizontalAdvance( hint ) );
	for( int i = 0; i < int( m_configurationList.size() ); ++i )
		maxTextW = std::max( maxTextW, fm.horizontalAdvance(
			m_configurationList[i]->getConfigurationName() ) );

	const int boxW = std::min( width() - 40, maxTextW + 96 );
	const int boxH = ( std::max( visible, 1 ) + 3 ) * lineH + 2 * padY;
	const int boxX = ( width()  - boxW ) / 2;
	const int boxY = ( height() - boxH ) / 2;

	painter->setPen( QColor( 210, 210, 210, 170 ) );
	painter->setBrush( QColor( 18, 18, 22, 210 ) );
	painter->drawRect( QRect( boxX, boxY, boxW, boxH ) );

	int y = boxY + padY + lineH;
	painter->setPen( QColor( 150, 200, 245, 235 ) );
	painter->drawText( boxX + ( boxW - fm.horizontalAdvance( title ) ) / 2, y, title );
	const int firstRowY = y + lineH / 2;

	// Remember where the rows landed so a click can be mapped back to one
	// without repeating any of this arithmetic.
	m_configMenuHit.box   = QRect( boxX, boxY, boxW, boxH );
	m_configMenuHit.rowY0 = firstRowY + lineH - fm.ascent() - 2;
	m_configMenuHit.rowH  = lineH;
	m_configMenuHit.rows  = visible;
	m_configMenuHit.top   = m_configMenuTop;

	y = firstRowY;
	for( int row = 0; row < visible; ++row )
	{
		const int i = m_configMenuTop + row;
		y += lineH;

		const bool isCursor = ( i == m_configMenuCursor );
		const bool isActive = ( m_configurationList[hits[i]] == m_actConfiguration );

		if( isCursor )
		{
			painter->setPen( Qt::NoPen );
			painter->setBrush( QColor( 70, 120, 190, 190 ) );
			painter->drawRect( QRect( boxX + 6, y - fm.ascent() - 2, boxW - 12, lineH ) );
		}

		// The running preset gets a dot, the cursor gets the bar. No row
		// numbers: they only ever existed to announce the digit shortcuts,
		// which are gone.
		const QString mark = isActive ? QString::fromUtf8( "\xE2\x97\x8F " ) : QString( "   " );
		const QString text = mark + m_configurationList[hits[i]]->getConfigurationName();

		if( isCursor )      painter->setPen( QColor( 255, 255, 255, 255 ) );
		else if( isActive ) painter->setPen( QColor( 150, 200, 245, 235 ) );
		else                painter->setPen( QColor( 205, 205, 210, 210 ) );
		painter->drawText( boxX + 34, y, text );
	}

	if( visible == 0 )
	{
		y = firstRowY + lineH;
		painter->setPen( QColor( 200, 150, 150, 220 ) );
		painter->drawText( boxX + 34, y, QString::fromUtf8( Strings::T( S_MENU_NO_MATCH ) ) );
	}

	// Only claim there is more when there actually is.
	painter->setPen( QColor( 150, 150, 155, 200 ) );
	painter->setBrush( Qt::NoBrush );
	if( m_configMenuTop > 0 )
		painter->drawText( boxX + boxW - 30, firstRowY,
		                   QString::fromUtf8( "\xE2\x96\xB2" ) );
	if( m_configMenuTop + visible < nrConfigurations )
		painter->drawText( boxX + boxW - 30, y + lineH / 2,
		                   QString::fromUtf8( "\xE2\x96\xBC" ) );

	QFont hf = font;
	hf.setPointSize( std::max( 9, int( fontsize * 0.8 ) ) );
	painter->setFont( hf );
	QFontMetrics hfm( hf );
	painter->setPen( QColor( 165, 165, 172, 215 ) );
	painter->drawText( boxX + ( boxW - hfm.horizontalAdvance( hint ) ) / 2,
	                   boxY + boxH - padY - hfm.descent(), hint );
}

/// Settings file shared with RenderPipeline (next to the Configurations folder).
static const char *kUiSettingsPath = "..\\kaleidoscope_settings.ini";

void GLwidget::loadUiSettings()
{
	QSettings s( Platform::assetPath( kUiSettingsPath ), QSettings::IniFormat );
	m_autoConfig     = s.value( "autoConfig",  m_autoConfig ).toBool();
	m_autoScale      = s.value( "autoScale",   m_autoScale  ).toBool();
	m_showNowPlaying = s.value( "nowPlaying",  m_showNowPlaying ).toBool();
	m_lyricsMode     = qBound( 0, s.value( "lyricsMode", m_lyricsMode ).toInt(), 2 );
	m_artistShow     = s.value( "artistImages", m_artistShow ).toBool();
	m_videoEnabled   = s.value( "videoEnabled", m_videoEnabled ).toBool();
	m_lyricsKinetic  = s.value( "lyricsKinetic", m_lyricsKinetic ).toBool();
	m_updateCheck    = s.value( "updateCheck",  m_updateCheck ).toBool();
	for( int i = 0; i < MIDI_TARGETS; ++i )
		m_midiMap[i] = s.value( QString("midiMap%1").arg(i), m_midiMap[i] ).toInt();
	RenderPipeline::setLightShow( s.value( "lightShow", RenderPipeline::lightShow() ).toBool() );
	// A persisted active config is the default start config, unless -c overrode it.
	if( s_startConfig.isEmpty() )
		s_startConfig = s.value( "activeConfig", QString() ).toString();
	// Same "CLI wins" precedence for the web-remote port.
	if( !s_remotePortFromCli )
		s_remotePort = s.value( "remotePort", s_remotePort ).toInt();
	// OSC analysis output (TouchDesigner/Resolume/...): off unless configured.
	m_osc.configure( s.value( "oscHost", "127.0.0.1" ).toString(),
	                 s.value( "oscPort", 0 ).toInt() );
	Strings::setLanguage( Strings::fromCode(
	    s.value( "language", Strings::toCode( Strings::language() ) ).toString().toLocal8Bit().constData() ) );
}

void GLwidget::saveUiSettings()
{
	QSettings s( Platform::assetPath( kUiSettingsPath ), QSettings::IniFormat );
	if( m_actConfiguration )
		s.setValue( "activeConfig", m_actConfiguration->getConfigurationName() );
	s.setValue( "autoConfig", m_autoConfig );
	s.setValue( "autoScale",  m_autoScale );
	s.setValue( "nowPlaying", m_showNowPlaying );
	s.setValue( "lyricsMode",   m_lyricsMode );
	s.setValue( "artistImages", m_artistShow );
	s.setValue( "videoEnabled", m_videoEnabled );
	s.setValue( "lyricsKinetic", m_lyricsKinetic );
	s.setValue( "updateCheck",   m_updateCheck );
	for( int i = 0; i < MIDI_TARGETS; ++i )
		s.setValue( QString("midiMap%1").arg(i), m_midiMap[i] );
	s.setValue( "lightShow",  RenderPipeline::lightShow() );
	s.setValue( "remotePort", s_remotePort );
	s.setValue( "language",  Strings::toCode( Strings::language() ) );
	s.sync();
}

void GLwidget::saveAllSettings()
{
	RenderPipeline::saveSettings();
	saveUiSettings();
}

// Capture the current frame so it can be cross-faded out over the new config.
void GLwidget::beginConfigFade()
{
	m_fadePixmap = QPixmap::fromImage( grabFramebuffer() );
	m_fadeStart  = m_fpsTimer.elapsed();
}

void GLwidget::switchConfig( Configuration *cfg )
{
	// Only record the request here; it is applied in timerEvent (outside paintGL),
	// because the fade capture (grabFramebuffer) re-renders and must not re-enter
	// paintGL when this is reached via auto-config / track-change during draw().
	if( cfg == 0 || cfg == m_actConfiguration )
		return;
	m_pendingConfig = cfg;
}

bool GLwidget::selectConfigByName( const QString &name )
{
	// Hidden presets are reachable by NAME on purpose (dev/CI door);
	// only the index-based selection paths never see them.
	for( const auto *lst : { &m_configurationList, &m_hiddenConfigurations } )
		for( Configuration *c : *lst )
			if( c->getConfigurationName()
			        .compare( name, Qt::CaseInsensitive ) == 0 )
			{
				if( c == m_actConfiguration )
					return false;                 // already active
				switchConfig( c );
				return true;
			}
	return false;
}

void GLwidget::updateAutoConfig( const AudioFeatures &f )
{
	if( !m_autoConfig )
		return;

	// Map the sustained mood to a configuration bucket (2026-07 preset set).
	//   0 ambient/drone -> Ambient, 1 calm -> Galerie,
	//   2 normal -> Allround,       3 energetic -> Club.
	int bucket;
	if     ( f.ambientFactor > 0.6f ) bucket = 0;
	else if ( f.arousal      < 0.33f ) bucket = 1;
	else if ( f.arousal      > 0.66f ) bucket = 3;
	else                               bucket = 2;
	static const char *names[4] = { "Ambient", "Galerie", "Allround", "Club" };

	const qint64 now = m_fpsTimer.elapsed();
	if( bucket != m_moodBucket )
	{
		m_moodBucket      = bucket;
		m_moodBucketSince = now;
	}

	// Only switch once the mood has held for ~8 s and at least ~30 s after the
	// previous switch, so the configuration doesn't flip back and forth.
	if( now - m_moodBucketSince > 8000 && now - m_lastAutoSwitch > 30000 )
	{
		if( selectConfigByName( QString::fromLatin1(names[bucket]) ) )
		{
			m_lastAutoSwitch = now;
			fprintf( stderr, "Auto-config: switched to '%s'\n", names[bucket] );
		}
	}
}

void GLwidget::updateAdaptiveScale()
{
	if( !m_autoScale )
		return;

	const qint64 now = m_fpsTimer.elapsed();
	if( m_fpsValue <= 0 || now - m_lastScaleAdjust < 1500 )   // settle ~1.5 s between steps
		return;

	const float minScale = 0.35f;
	float scale = RenderPipeline::renderScale();
	float next  = scale;

	// Thresholds relative to what the DISPLAY can actually show, not the fixed
	// 45/57 that assumed a 60 Hz panel. On a 30 Hz TV the frame rate can never
	// exceed 57, so the scale could never climb and the app would sit at its
	// 0.35 floor forever -- the same one-way trap the ceiling had.
	//
	// The target is capped at 72 on purpose: on a 144/240 Hz panel, chasing the
	// full refresh rate would trade away resolution for frames nobody asked for.
	// Above ~72 fps the extra smoothness is worth less than the pixels.
	const float target = ( m_displayHz > 20.f )
	                   ? ( m_displayHz < 72.f ? m_displayHz : 72.f )
	                   : 60.f;
	if( m_fpsValue < 0.75f * target && scale > minScale )
		next = scale - 0.10f;                       // struggling -> coarser, recover FPS
	else if( m_fpsValue > 0.95f * target && scale < m_autoScaleMax )
		next = scale + ( scale >= 1.0f ? 0.10f : 0.05f );   // headroom -> finer
		// Coarser steps in the supersampling range: below 1.0 every step is
		// visible detail the user wants back quickly, above it the steps are
		// diminishing returns and fewer resolution changes read better.

	if( next < minScale )         next = minScale;
	if( next > m_autoScaleMax )   next = m_autoScaleMax;

	if( next != scale )
	{
		RenderPipeline::setRenderScale( next );
		if( m_actConfiguration && m_actConfiguration->m_renderPipeline )
			m_actConfiguration->m_renderPipeline->resize( m_width, m_height );
		m_lastScaleAdjust = now;
		fprintf( stderr, "Adaptive scale: %.2f (%d FPS)\n", next, m_fpsValue );
	}
}

/**
 * @brief Double-click toggles fullscreen.
 *
 * It used to call exit(0) instead, with this toggle sitting unreachable
 * underneath it -- a stray double-click on the window ended the show, which is
 * a brutal answer to a slip of the hand. Quitting already has two deliberate
 * keys ('Esc' and 'q'); a mouse gesture should not be a third.
 */
void GLwidget::mouseDoubleClickEvent(QMouseEvent *e) {
  QWidget::mouseDoubleClickEvent(e);

  if( isFullScreen() )
     setWindowState( Qt::WindowMaximized );
  else
     setWindowState( Qt::WindowFullScreen );
}

void GLwidget::timerEvent( QTimerEvent* )
{
	// Apply a requested configuration switch here, outside paintGL: capture the
	// current (old) frame for the cross-fade, then stop/start the configurations.
	if( m_pendingConfig && m_pendingConfig != m_actConfiguration )
	{
		beginConfigFade();
		m_actConfiguration->stop();
		m_actConfiguration = m_pendingConfig;
		m_actConfiguration->start( m_width, m_height );
		m_sceneThumbs.clear();   // indices now name a different config's scene list
		m_pendingConfig = nullptr;
	}

	// Schedule a repaint; the actual rendering happens in paintGL() where the
	// GL context is guaranteed current (QOpenGLWidget requirement).
	update();
}


void GLwidget::resizeGL( int /*wLogical*/, int /*hLogical*/ )
{
	// QOpenGLWidget calls resizeGL() with LOGICAL (device-independent) pixels,
	// but its default framebuffer is sized to size() * devicePixelRatio().
	// Size the viewport / FBOs to the physical framebuffer so the visualization
	// fills the whole widget (and stays sharp) on high-DPI / scaled displays.
	const qreal dpr = devicePixelRatioF();
	m_width  = int(this->width()  * dpr + 0.5);
	m_height = int(this->height() * dpr + 0.5);

	// Lightweight resize: keeps the loaded image textures + shader programs and
	// only re-sizes the off-screen buffers (no reload, no GL-object leak).
	// (The one-time full build happens in Configuration::start -> reinit.)
	m_actConfiguration->m_renderPipeline->resize( m_width, m_height );
}

// set rotation Matrix for trackball to Identity
void GLwidget::resetRotation()
{
	/*for(int i = 1; i < 4; i++)
	{
		for(int j = 0; j < i; j++)
		{
			m_RotationMatrix[i*4+j] = m_RotationMatrix[j*4+i]= 0.0;
		}
	}
	m_RotationMatrix[0] = m_RotationMatrix[5] = m_RotationMatrix[10] = m_RotationMatrix[15] = 1.0;*/
}

/**
 * @brief Click inside an open overlay menu picks a row; click outside closes it.
 *
 * The row geometry comes from MenuHit, filled while drawing, so this never has
 * to reproduce the layout arithmetic -- and cannot drift out of step with it.
 */
void GLwidget::mousePressEvent( QMouseEvent * e )
{
	const QPoint p = e->position().toPoint();

	if( m_showSelectConfigurationMenu )
	{
		const int row = menuRowAt( m_configMenuHit, p );
		if( row >= 0 )
		{
			const QVector<int> hits = configMenuMatches();
			m_showSelectConfigurationMenu = false;
			if( row < hits.size() && m_configurationList[hits[row]] != m_actConfiguration )
				switchConfig( m_configurationList[hits[row]] );
			m_configMenuFilter.clear();
		}
		else if( !m_configMenuHit.box.contains( p ) )
			m_showSelectConfigurationMenu = false;
		return;
	}
	if( m_showAudioMenu )
	{
		const int row = menuRowAt( m_audioMenuHit, p );
		if( row >= 0 )
		{
			const QVector<int> hits = audioMenuMatches();
			m_showAudioMenu = false;
			if( row < hits.size() )
				selectAudioDevice( hits[row] );
			m_audioMenuFilter.clear();
		}
		else if( !m_audioMenuHit.box.contains( p ) )
			m_showAudioMenu = false;
		return;
	}
}

/**
 * @brief The wheel scrolls whichever overlay menu is open.
 *
 * Without a menu open it does nothing, rather than falling through to some
 * other meaning -- the wheel has no job in the visualiser itself.
 */
void GLwidget::wheelEvent( QWheelEvent *e )
{
	const int steps = e->angleDelta().y() / 120;
	if( steps == 0 )
		return;

	int  *cursor = nullptr;
	int   count  = 0;
	if( m_showSelectConfigurationMenu ) { cursor = &m_configMenuCursor; count = configMenuMatches().size(); }
	else if( m_showAudioMenu )          { cursor = &m_audioMenuCursor;  count = audioMenuMatches().size(); }
	if( !cursor || count <= 0 )
		return;

	// Clamp rather than wrap: a wheel flick past the end should stop there, not
	// reappear at the top, which is disorienting when the list is long.
	*cursor = std::max( 0, std::min( *cursor - steps, count - 1 ) );
	e->accept();
}

void GLwidget::mouseMoveEvent( QMouseEvent * e /*the event*/ )
{
	/*int dx = e->x() - m_lastPos.x();
	int dy = e->y() - m_lastPos.y();

	bool ctrl_key = e->modifiers() & Qt::MetaModifier;		// only needed for Mac OS X, but doesn't hurt on other OSes

	if ( (e->buttons() & Qt::RightButton) || ctrl_key ) // translation along z-Axis
	{
		m_zTrans += 0.2 * dy;
	}
	else if ( e->buttons() & Qt::MidButton ) // translation in xy-Plane
	{
		m_xTrans += 0.01 * dx;
		m_yTrans -= 0.01 * dy;
	}
	else if (e->buttons() & Qt::LeftButton)	// rotation
	{
		// openGL multiplies new transformations on the right
		// we want to apply rotation on the left
		glPushMatrix(); // push current openGL transform matrix to stack
		glLoadIdentity();
		glRotatef(0.5*dx,0.0, 1.0, 0.0);
		glRotatef(0.5*dy,1.0, 0.0, 0.0);
		glMultMatrixf(m_RotationMatrix);
		glGetFloatv(GL_MODELVIEW_MATRIX,m_RotationMatrix);
		glPopMatrix();
	}
	m_lastPos = e->pos();
	e->accept();
	updateGL();*/
}


// Live audio-feature panel (toggled with the 'i' key) — handy for demos and for
// tuning the mapping.  Drawn with QPainter over the rendered frame.
void GLwidget::drawFeatureOverlay( QPainter *painter, const AudioFeatures &f )
{
	struct Row { const char *name; float val; };
	const float bpm = 40.f + f.estimatedBPM * 160.f;
	Row rows[] = {
		{ "musicPresence", f.musicPresence },
		{ "arousal",       f.arousal },
		{ "valence",       f.valence },
		{ "tempo",         f.estimatedBPM },
		{ "mode maj/min",  f.musicalMode },
		{ "keyClarity",    f.keyClarity },
		{ "rhythm",        f.rhythmStrength },
		{ "beat",          f.beatDecay },
		{ "onset",         f.onsetStrength },
		{ "downbeat",      f.downbeat },
		{ "beatPhase",     f.beatPhase },
		{ "flux",          f.spectralFlux },
		{ "centroid",      f.spectralCentroid },
		{ "roughness",     f.roughness },
		{ "sharpness",     f.sharpness },
		{ "stereoWidth",   f.stereoWidth },
		{ "level",         f.overallLevel },
	};
	const int n  = int(sizeof(rows) / sizeof(rows[0]));
	const int x  = 24, y0 = 66, lh = 22, bw = 130, bh = 12;

	painter->fillRect( x - 14, 14, 360, n * lh + 68, QColor(0, 0, 0, 160) );
	painter->setFont( QFont("Consolas", 12, QFont::Bold) );
	painter->setPen( QColor(120, 200, 255) );
	painter->drawText( x, 34, QString::fromUtf8( Strings::T( S_FEATURE_TITLE_FMT ) ).arg(m_fpsValue) );

	// Live-tunable look knobs (hotkeys).
	painter->setFont( QFont("Consolas", 10) );
	painter->setPen( QColor(170, 205, 170) );
	painter->drawText( x, 54, QString::fromUtf8( Strings::T( S_FEATURE_STATUS_FMT ) )
		.arg(RenderPipeline::reactivity(), 0, 'f', 1)
		.arg(RenderPipeline::trails(),     0, 'f', 2)
		.arg(RenderPipeline::mood(),       0, 'f', 1)
		.arg(m_autoConfig ? Strings::T(S_ON) : Strings::T(S_OFF))
		.arg(RenderPipeline::renderScale(), 0, 'f', 2)
		.arg(m_autoScale ? Strings::T(S_ON) : Strings::T(S_OFF)) );

	painter->setFont( QFont("Consolas", 11) );
	for ( int i = 0; i < n; ++i )
	{
		int ry = y0 + i * lh;
		float v = rows[i].val; if (v < 0.f) v = 0.f; if (v > 1.f) v = 1.f;
		painter->setPen( QColor(205, 214, 230) );
		painter->drawText( x, ry, QString(rows[i].name) );
		int bx = x + 150;
		painter->fillRect( bx, ry - 11, bw, bh, QColor(40, 45, 60) );
		// musicPresence bar turns amber when it drops (speech / non-music mode).
		QColor barCol = (i == 0 && f.musicPresence < 0.5f) ? QColor(255, 170, 60)
		                                                    : QColor(90, 170, 255);
		painter->fillRect( bx, ry - 11, int(bw * v), bh, barCol );
		painter->setPen( QColor(255, 255, 255) );
		QString txt = (i == 3) ? QString::number(bpm, 'f', 0)
		                       : QString::number(rows[i].val, 'f', 2);
		painter->drawText( bx + bw + 8, ry, txt );
	}
}

void GLwidget::drawHelpOverlay( QPainter *painter )
{
	struct Line { const char *key; StrId desc; };
	static const Line lines[] = {
		{ "h",       S_HELP_H },
		{ "0",       S_HELP_0 },
		{ "n",       S_HELP_N },
		{ "i",       S_HELP_I },
		{ "v",       S_HELP_V },
		{ "d",       S_HELP_D },
		{ "p",       S_HELP_P },
		{ "w",       S_HELP_W },
		{ "o",       S_HELP_O },
		{ "a",       S_HELP_A },
		{ "g",       S_HELP_G },
		{ "l",       S_HELP_L },
		{ "[  ]",    S_HELP_REACTIVITY },
		{ ",  .",    S_HELP_TRAILS },
		{ "-  =",    S_HELP_MOOD },
		{ ";  '",    S_HELP_LATENCY },
		{ "b",       S_HELP_B },
		{ "e",       S_HELP_E },
		{ "t",       S_HELP_T },
		{ "u",       S_HELP_U },
		{ "f",       S_HELP_F },
		{ "Space",   S_HELP_SPACE },
		{ "Shift+Space", S_HELP_SHIFT_SPACE },
		{ "z",       S_HELP_Z },
		{ "c  m",    S_HELP_CM },
		{ "j",       S_HELP_J },
		{ "y  x",    S_HELP_YX },
		{ "k",       S_HELP_K },
		{ "r",       S_HELP_R },
		{ "s",       S_HELP_S },
		{ "Esc / q", S_HELP_ESC },
	};
	const int n = int(sizeof(lines) / sizeof(lines[0]));

	// A bit wider than the English text alone would need -- several German
	// descriptions run noticeably longer (e.g. "aktuellen Look + Zustand
	// als Standard speichern").
	const int boxW = 480, lh = 26;
	const int boxH = lh * (n + 1) + 24;
	const int x0 = (width()  - boxW) / 2;
	const int y0 = (height() - boxH) / 2;

	painter->fillRect( x0, y0, boxW, boxH, QColor(0, 0, 0, 190) );
	painter->setPen( QColor(120, 200, 255) );
	painter->setFont( QFont("Consolas", 14, QFont::Bold) );
	painter->drawText( x0 + 20, y0 + 32, QString::fromUtf8( Strings::T( S_HELP_TITLE ) ) );

	painter->setFont( QFont("Consolas", 12) );
	for ( int i = 0; i < n; ++i )
	{
		int ry = y0 + 32 + (i + 1) * lh;
		painter->setPen( QColor(150, 230, 150) );
		painter->drawText( x0 + 24, ry, QString(lines[i].key) );
		painter->setPen( QColor(210, 218, 232) );
		painter->drawText( x0 + 150, ry, QString::fromUtf8( Strings::T( lines[i].desc ) ) );
	}
}

/// Display names for the MIDI_* learn targets (GLwidget::MIDI_REACT etc.), used
/// in the "MIDI learn" stderr prompts.
static const char *kMidiTargetNames[] =
	{ "Reactivity", "Trails", "Mood", "Latenz-Vorlauf", "Naechster Effekt",
	  "Tap-Tempo", "Blackout" };

void GLwidget::applyMidi()
{
	if( !m_midi )
		return;
	std::vector<MidiInput::Event> evs = m_midi->drain();
	for( const MidiInput::Event &e : evs )
	{
		// ---- MIDI LEARN: bind the incoming controller to the current target ----
		if( m_midiLearn >= 0 )
		{
			bool wantsNote = (m_midiLearn == MIDI_NEXT || m_midiLearn == MIDI_TAP
			                  || m_midiLearn == MIDI_BLACKOUT);
			if( (wantsNote && e.type == 0x90) || (!wantsNote && e.type == 0xB0) )
			{
				m_midiMap[m_midiLearn] = e.data1;
				fprintf( stderr, "MIDI learn: %s -> %s %d\n",
				         kMidiTargetNames[m_midiLearn],
				         wantsNote ? "note" : "CC", e.data1 );
				m_midiLearn++;                              // advance to next target
				if( m_midiLearn >= MIDI_TARGETS )
				{
					m_midiLearn = -1;
					saveUiSettings();                       // persist the new mapping
					fprintf( stderr, "MIDI learn: done (gespeichert)\n" );
				}
			}
			continue;                                       // learn consumes the event
		}

		if( e.type == 0xB0 )                       // Control Change -> mapped knobs
		{
			float v = e.data2 / 127.f;             // 0..1
			if      ( e.data1 == m_midiMap[MIDI_REACT]   ) RenderPipeline::setReactivity( v * 3.0f  );
			else if ( e.data1 == m_midiMap[MIDI_TRAILS]  ) RenderPipeline::setTrails     ( v * 0.95f );
			else if ( e.data1 == m_midiMap[MIDI_MOOD]    ) RenderPipeline::setMood       ( v * 2.5f  );
			else if ( e.data1 == m_midiMap[MIDI_LATENCY] ) RenderPipeline::setLatency    ( v * 0.25f );
		}
		else if( e.type == 0x90 )                  // Note On -> mapped pads
		{
			// Tap-tempo and blackout fire only on their LEARNED note; the
			// next-effect pad keeps the any-note fallback when unmapped.
			if( m_midiMap[MIDI_TAP] >= 0 && e.data1 == m_midiMap[MIDI_TAP] )
			{
				if( m_audioAnalyzer )
					m_audioAnalyzer->tapTempo();
			}
			else if( m_midiMap[MIDI_BLACKOUT] >= 0 && e.data1 == m_midiMap[MIDI_BLACKOUT] )
			{
				RenderPipeline::toggleBlackout();
			}
			else if( m_midiMap[MIDI_NEXT] < 0 || e.data1 == m_midiMap[MIDI_NEXT] )
				if( m_actConfiguration && m_actConfiguration->m_renderPipeline )
					m_actConfiguration->m_renderPipeline->requestSceneChange();
		}
	}
}

/**
 * @brief Extracts a two-color dominant palette from an artist/cover image.
 *
 * Cover-Palette: die zwei dominanten Farben eines Kuenstlerbilds.  12 Hue-
 * Eimer, gewichtet mit Saettigung*Helligkeit (Grau/Schwarz zaehlt nicht);
 * Sieger = gewichtetes RGB-Mittel seines Eimers, Zweitfarbe = bester Eimer
 * mit Kreis-Abstand >= 2 (sonst dunkle Schattierung der Ersten).  Liefert
 * false fuer praktisch farblose Cover (S/W-Fotos) - dann bleibt das Grading
 * neutral statt einen Zufallston zu erfinden.
 *
 * @param src Source image (any format/size; downscaled internally to 24x24).
 * @param palA Output: dominant color as RGB in 0..1.
 * @param palB Output: secondary color as RGB in 0..1 (or a darkened shade of
 *             palA when no sufficiently distinct second hue bucket exists).
 * @return True if a usable (sufficiently colorful) palette was found; false
 *         for near-greyscale images, in which case palA/palB are unmodified.
 */
static bool extractPalette( const QImage &src, float *palA, float *palB )
{
	if( src.isNull() )
		return false;
	QImage img = src.scaled( 24, 24, Qt::IgnoreAspectRatio, Qt::FastTransformation )
	                .convertToFormat( QImage::Format_RGB32 );
	double wSum[12] = {}, rSum[12] = {}, gSum[12] = {}, bSum[12] = {};
	for( int y = 0; y < img.height(); ++y )
		for( int x = 0; x < img.width(); ++x )
		{
			QColor c( img.pixel( x, y ) );
			float h, s, v;
			c.getHsvF( &h, &s, &v );
			if( h < 0.f || s < 0.22f || v < 0.14f )
				continue;
			int    bkt = int( h * 12.f ) % 12;
			double w   = double( s ) * double( v );
			wSum[bkt] += w;
			rSum[bkt] += w * c.redF();
			gSum[bkt] += w * c.greenF();
			bSum[bkt] += w * c.blueF();
		}
	int best = 0;
	for( int k = 1; k < 12; ++k )
		if( wSum[k] > wSum[best] ) best = k;
	// Mindestens ~4% der Pixel muessen farbig auf den Sieger einzahlen.
	if( wSum[best] < 24.0 * 24.0 * 0.04 * 0.25 )
		return false;
	palA[0] = float( rSum[best] / wSum[best] );
	palA[1] = float( gSum[best] / wSum[best] );
	palA[2] = float( bSum[best] / wSum[best] );
	int second = -1;
	for( int k = 0; k < 12; ++k )
	{
		int dc = abs( k - best );  dc = ( dc > 6 ) ? 12 - dc : dc;
		if( dc >= 2 && ( second < 0 || wSum[k] > wSum[second] ) && wSum[k] > 1.0 )
			second = k;
	}
	if( second >= 0 )
	{
		palB[0] = float( rSum[second] / wSum[second] );
		palB[1] = float( gSum[second] / wSum[second] );
		palB[2] = float( bSum[second] / wSum[second] );
	}
	else
		for( int k = 0; k < 3; ++k ) palB[k] = palA[k] * 0.30f;  // dunkle Schattierung
	return true;
}

// Lyrics-/Künstlerbild-Overlay: pro Frame den Anzeige-Zustand berechnen.
// Sync-Quelle ist die SMTC-Playback-Position (extrapoliert); ohne sie (VLC-
// Fallback, Testmodus) läuft eine lokale Uhr ab Trackwechsel.  Alle Blenden
// sind geslewt, damit nichts hart aufpoppt.
void GLwidget::updateTrackOverlays( RenderPipeline *fs )
{
	RenderPipeline::OverlayFrame o;
	if( !m_trackMedia )
	{
		fs->setOverlayFrame( o );
		return;
	}

	// Echtes dt statt einer festen 60-Hz-Annahme: schwankt die Framezeit
	// (GPU-Last, adaptive Render-Skalierung, Compute-Sims), ruckelt das
	// Scroll-Smoothing sonst, weil der Slew-Schritt nicht zur tatsächlich
	// vergangenen Zeit passt. Erster Aufruf / lange Aussetzer werden geklemmt.
	const qint64 nowMs = m_fpsTimer.elapsed();
	float dt = ( m_overlayLastMs < 0 ) ? ( 1.f / 60.f )
	                                   : float( nowMs - m_overlayLastMs ) * 0.001f;
	if( dt < 0.f )    dt = 0.f;
	if( dt > 0.25f )  dt = 0.25f;
	m_overlayLastMs = nowMs;

	auto slew = []( float cur, float target, float rate, float dt )
	{
		float step = rate * dt;
		if( target > cur ) return ( target - cur < step ) ? target : cur + step;
		return ( cur - target < step ) ? target : cur - step;
	};

	// Preset-Wechsel: die neue Konfiguration hat einen EIGENEN PresentPass
	// ohne unsere Texturen - Upload-Merker zurücksetzen, damit Lyrics und
	// Künstlerbild unten sofort neu hochgeladen werden.
	if( fs != m_overlayFs )
	{
		m_overlayFs         = fs;
		m_lyricsRevUploaded = -1;
		m_artistIdxUploaded = -1;
		m_artistRevSeen     = -1;
	}

	// Playback-Position: SMTC, sonst lokale Uhr seit Trackwechsel - beides
	// nur als REFERENZ für die PLL unten.
	double pos = m_nowPlaying ? m_nowPlaying->positionNowSec() : -1.0;
	double dur = 0.0;
	if( m_nowPlaying )
		dur = m_nowPlaying->timeline().durationSec;
	if( pos < 0.0 || m_lyricsTest )
		pos = double( m_fpsTimer.elapsed() - m_trackStartMs ) * 0.001;

	// Consumer-PLL (die Aufnahme des Users hat es bewiesen: trotz monotoner
	// NowPlaying-Publikation kamen noch Rückwärtsschritte an - z.B. wenn ein
	// Player kurz playing=false flackert und dabei ein roher Alt-Wert
	// durchrutscht, oder ein Titel-Flackern das Settle-Fenster auf die
	// lokale Uhr zurücksetzt). Deshalb final HIER, an der einzigen
	// Verbrauchsstelle: eine eigene, mit dem Frame-dt integrierte Position,
	// die zur Referenz nur hin-GLEITET (Rate 0..1.15 - bremst bei Pause bis
	// zum Stillstand, läuft nie rückwärts). Sprünge in BEIDE Richtungen erst
	// nach kurzer Bestätigung: VORWÄRTS 0.4s (ein echter Vorspul-Seek fühlt
	// sich weiter sofort an), RÜCKWÄRTS 2s (echtes Zurückspulen). Beide
	// Fenster waren frueher asymmetrisch (vorwaerts ganz ohne Bestaetigung,
	// "harmlos fuers Auge") - eine PLL-Simulation mit realistischem Referenz-
	// Rauschen zeigte aber: ein einzelner Ausreisser >1.5s voraus sprang
	// SOFORT, und wenn die Referenz eine Umlaufzeit spaeter auf den echten
	// Wert zurueckfiel, erkannte die Rueckwaerts-Bestaetigung genau DAS als
	// "2s konsistent falsch" und sprang zurueck - ein einzelner Ausreisser
	// wurde so zu ZWEI sichtbaren Spruengen (vor, dann zurueck), exakt das
	// gemeldete Huepfen. Kuerzeres Flackern jeder Art wird jetzt in BEIDEN
	// Richtungen komplett ueberbrueckt, die Anzeige laeuft einfach weiter.
	if( m_posSmooth < 0.0 )
	{
		m_posSmooth     = pos;
		m_backJumpSince = -1;
		m_fwdJumpSince  = -1;
	}
	else if( pos - m_posSmooth > 1.5 )
	{
		const qint64 pllNow = m_fpsTimer.elapsed();
		double erwartet = m_fwdJumpRef
		                + ( m_fwdJumpSince >= 0
		                    ? double( pllNow - m_fwdJumpSince ) * 0.001 : 0.0 );
		if( m_fwdJumpSince < 0 || fabs( pos - erwartet ) > 1.0 )
		{
			m_fwdJumpSince = pllNow;         // (neuer) Vorwärts-Kandidat
			m_fwdJumpRef   = pos;
		}
		else if( pllNow - m_fwdJumpSince > 400 )
		{
			// Forensic trail for the NEXT reported "jump": earlier rounds only
			// logged a resulting BACKWARD line-index flip (see below), which
			// stays silent for a snap that lands inside the CURRENT line's own
			// span (no index change, but the scroll position inside it still
			// jumps) or a forward multi-line skip. Log every actual PLL snap
			// itself, unconditionally -- these are rare by construction (only
			// after 0.4/2s of confirmation), so this costs nothing in the
			// common case and finally makes every discontinuity source visible
			// in kaleidoscope.log instead of just this one already-fixed kind.
			fprintf( stderr, "[Lyrics] PLL-Sprung VORWAERTS: posSmooth %.3f -> %.3f "
			         "(nach %.0fms Bestaetigung)\n",
			         m_posSmooth, pos, double( pllNow - ( m_fwdJumpSince ) ) );
			m_posSmooth    = pos;            // 0.4s konsistent: echter Seek
			m_fwdJumpSince = -1;
		}
		m_backJumpSince = -1;
		if( m_fwdJumpSince >= 0 )
			m_posSmooth += double(dt);       // solange pending: normal weiterlaufen
	}
	else if( pos - m_posSmooth < -1.5 )
	{
		const qint64 pllNow = m_fpsTimer.elapsed();
		double erwartet = m_backJumpRef
		                + ( m_backJumpSince >= 0
		                    ? double( pllNow - m_backJumpSince ) * 0.001 : 0.0 );
		if( m_backJumpSince < 0 || fabs( pos - erwartet ) > 1.0 )
		{
			m_backJumpSince = pllNow;        // (neuer) Rückwärts-Kandidat
			m_backJumpRef   = pos;
		}
		else if( pllNow - m_backJumpSince > 2000 )
		{
			// See the matching forward-snap log above for why this is
			// unconditional now (was previously silent, unlike the resulting
			// backward line-index flip below).
			fprintf( stderr, "[Lyrics] PLL-Sprung RUECKWAERTS: posSmooth %.3f -> %.3f "
			         "(nach %.0fms Bestaetigung)\n",
			         m_posSmooth, pos, double( pllNow - ( m_backJumpSince ) ) );
			m_posSmooth     = pos;           // 2s konsistent: echter Seek
			m_backJumpSince = -1;
		}
		m_fwdJumpSince = -1;
		if( m_backJumpSince >= 0 )
			m_posSmooth += double(dt);       // solange pending: normal weiterlaufen
	}
	else
	{
		m_backJumpSince = -1;
		m_fwdJumpSince  = -1;
		// Asymmetrischer Gain: hinterherhinken sanft aufholen (0.3), aber
		// VORAUSlaufen hart abbremsen (2.0) - sonst schiebt eine Pause
		// (eingefrorene Referenz) die Position erst 3.3s über das Ziel
		// hinaus und über die 1.5s-Schwelle in den Vorwärts-Pfad.
		const double err = pos - m_posSmooth;
		double r = 1.0 + err * ( err < 0.0 ? 2.0 : 0.3 );
		if( r < 0.0 )   r = 0.0;
		if( r > 1.15 )  r = 1.15;
		m_posSmooth += double(dt) * r;
	}
	pos = m_posSmooth;

	// ---- Lyrics ----
	if( m_trackMedia->lyricsRevision() != m_lyricsRevUploaded )
	{
		m_lyricsRevUploaded = m_trackMedia->lyricsRevision();
		m_karaokeLine = -1;
		m_scrollVSm   = 0.f;
		const QImage &img = m_trackMedia->lyricsImage();
		if( !img.isNull() )
		{
			QImage gl = img.convertToFormat( QImage::Format_RGBA8888 );
			fs->setLyricsTexture( gl.constBits(), gl.width(), gl.height() );
		}
	}

	bool lyricsOn = ( m_lyricsMode > 0 ) && m_trackMedia->hasLyrics();
	// Laengere textlose Pausen (Intro, Solo, Outro): Lyrics sanft ausblenden
	// statt eine tote/alte Zeile stehenzulassen.  Nutzt den Karaoke-
	// Zeilenindex vom LETZTEN Frame (kontinuierlicher Zustand, 16ms alt -
	// fuer diese Entscheidung unkritisch, vermeidet eine zweite Zeilensuche).
	// WICHTIG: die Hysterese-Suche unten haelt i waehrend einer Luecke auf
	// der VORHERIGEN (zuletzt aktiven) Zeile, nicht auf der kommenden - eine
	// erste Fassung nahm faelschlich lines[i].t0 als Luecken-Ende und fand
	// dadurch nie eine Luecke (durch eine Zeilen-Simulation aufgedeckt).
	if( lyricsOn && m_trackMedia->syncedLyrics() )
	{
		const auto &lines = m_trackMedia->lines();
		int n = int(lines.size());
		if( n > 0 )
		{
			int i = ( m_karaokeLine >= 0 && m_karaokeLine < n ) ? m_karaokeLine : 0;
			bool inLongGap = false;
			if( pos < lines[i].t0 )
			{
				// Intro (nur bei i==0 stabil): vor der allerersten Zeile.
				inLongGap = ( lines[i].t0 > 9.f ) && ( pos < lines[i].t0 - 2.f );
			}
			else if( lines[i].text.isEmpty() && pos < lines[i].t1 )
			{
				// Aktive "Zeile" ist ein Instrumental-Marker (leerer Text,
				// siehe TrackMedia::parseSynced) -- Solo/Break MITTEN im Song,
				// nicht nur Intro/Outro. i steht hier bereits stabil auf dem
				// Marker (die Hysterese-Suche unten haelt es dort), darum
				// reicht dessen eigene Spanne als Luecke.
				inLongGap = ( lines[i].t1 - lines[i].t0 > 9.f )
				          && ( pos > lines[i].t0 + 2.f )
				          && ( pos < lines[i].t1 - 2.f );
			}
			else if( pos >= lines[i].t1 )
			{
				bool hasNext = ( i + 1 < n );
				if( hasNext )
				{
					float gapEnd = lines[i+1].t0;
					inLongGap = ( gapEnd - lines[i].t1 > 9.f )
					          && ( pos > lines[i].t1 + 2.f )
					          && ( pos < gapEnd - 2.f );
				}
				else
					inLongGap = pos > lines[i].t1 + 2.f;   // Outro: unbegrenzt
			}
			if( inLongGap )
				lyricsOn = false;
		}
	}
	m_lyricsAlphaSm = slew( m_lyricsAlphaSm, lyricsOn ? 1.f : 0.f, 1.5f, dt );
	if( lyricsOn || m_lyricsAlphaSm > 0.001f )
	{
		const auto  &lines = m_trackMedia->lines();
		const QImage &img  = m_trackMedia->lyricsImage();
		o.lyricsAlpha  = m_lyricsAlphaSm * 0.92f;
		// Aspect bewusst gegen die NOMINALE (nicht die tatsaechliche) Breite
		// gerechnet: eine einzelne ueberlange Zeile kann die Textur breiter
		// machen (siehe TrackMedia::renderLyricsImage()), soll aber nicht
		// alle anderen Zeilen sichtbar verkleinern. lyricsUScale traegt die
		// Differenz in den Shader (Present.frag rechnet die Sample-Koordinate
		// damit zurueck auf die tatsaechliche Texturbreite).
		const int nomW = TrackMedia::lyricsNominalTexWidth();
		o.lyricsAspect = img.isNull() ? 1.f
		               : float(nomW) / float(img.height());
		o.lyricsUScale = ( img.isNull() || img.width() <= 0 ) ? 1.f
		               : float(nomW) / float(img.width());

		float targetV = m_scrollVSm;
		if( m_trackMedia->syncedLyrics() )
		{
			// Aktive Zeile suchen (Cache + Vorwärts-/Rückwärtsscan für Seeks).
			// RÜCKWÄRTS mit 0.3s Hysterese: nur ein echtes Zurückspulen soll
			// die Zeile wechseln - ein winziger Positions-Rückschritt (falls
			// je einer durchrutscht) darf das Highlight nicht in die Vorzeile
			// flippen lassen.
			int n = int(lines.size());
			int i = ( m_karaokeLine >= 0 && m_karaokeLine < n ) ? m_karaokeLine : 0;
			while( i + 1 < n && pos >= lines[i].t1 ) ++i;
			while( i > 0     && pos <  lines[i].t0 - 0.3 ) --i;
			// A line index going BACKWARD is exactly the "flip to the previous
			// line" symptom earlier rounds already tried to fix (monotone
			// NowPlaying publish, consumer PLL, this hysteresis). If it still
			// happens, this is the forensic trail: with -l, it lands in
			// kaleidoscope.log correlated with the exact pos/m_posSmooth that
			// caused it, instead of having to guess at another blind fix.
			// ALSO logged now: a forward skip of more than one line at once --
			// same visible "jump" symptom, just never instrumented before
			// because only the backward direction had been reported.
			if( m_karaokeLine >= 0 && ( i < m_karaokeLine || i > m_karaokeLine + 1 ) )
				fprintf( stderr, "[Lyrics] Zeile-SPRUNG %s: %d -> %d  "
				         "pos=%.3f posSmooth=%.3f  t0[alt]=%.3f t1[alt]=%.3f "
				         "t0[neu]=%.3f t1[neu]=%.3f\n",
				         ( i < m_karaokeLine ) ? "RUECKWAERTS" : "VORWAERTS(>1)",
				         m_karaokeLine, i, pos, m_posSmooth,
				         lines[m_karaokeLine].t0, lines[m_karaokeLine].t1,
				         lines[i].t0, lines[i].t1 );
			m_karaokeLine = i;

			// Kinetik: Zeilen-Alter fuer den Slam-Einflug der frischen Zeile.
			if( i != m_lastKaraokeLineSeen )
			{
				m_lastKaraokeLineSeen = i;
				m_lineChangeMs        = m_fpsTimer.elapsed();
			}
			if( m_lyricsKinetic && m_lineChangeMs >= 0 )
				o.lyricsLineAge = float( m_fpsTimer.elapsed() - m_lineChangeMs ) * 0.001f;

			const auto &L = lines[i];
			float lineFrac = 0.f;
			if( L.t1 > L.t0 )
				lineFrac = float( ( pos - L.t0 ) / ( L.t1 - L.t0 ) );
			lineFrac = std::min( std::max( lineFrac, 0.f ), 1.f );

			// Scroll-Ziel: Zentrum gleitet kontinuierlich zur nächsten Zeile.
			float c0 = 0.5f * ( L.v0 + L.v1 );
			float c1 = ( i + 1 < n ) ? 0.5f * ( lines[i+1].v0 + lines[i+1].v1 )
			                         : c0;
			targetV = c0 + ( c1 - c0 ) * lineFrac;

			// Highlight IMMER auf der (hysterese-stabilen) aktiven Zeile -
			// frueher war es an "pos >= t0" gebunden, wodurch ein winziger
			// Positions-Ruecklauf um den Zeilenanfang das Highlight kurz
			// ausblendete: alle Zeilen poppten auf volle Helligkeit und
			// zurueck ("Huepfen"), obwohl gar nichts scrollte.
			if( m_lyricsMode == 2 )
			{
				o.lyricsHlV0   = L.v0;
				o.lyricsHlV1   = L.v1;
				o.lyricsHlProg = lineFrac;   // bereits auf 0..1 geklemmt
			}

			// Marquee: die gerade gelesene Zeile (beide Modi -- L ist auch im
			// reinen Scroll die per Hysterese stabile "aktive" Zeile) wird,
			// falls sie beim Rendern nicht ins Fenster passte (L.overflowU),
			// statt abgeschnitten horizontal durchgescrollt -- gekoppelt an
			// lineFrac (0..1 durch die Sing-Dauer DIESER Zeile, oben schon
			// berechnet) statt an eine feste px/s-Geschwindigkeit: die ersten
			// 30% steht der Text still (Lesezeit fuer den Anfang), von 30%
			// bis 90% scrollt er (mit Ease-in/out) bis ganz ans Ende, die
			// letzten 10% steht er dort. Kein Zurueckscrollen noetig, da die
			// naechste Zeile ohnehin bei 0 neu beginnt -- und laengere Zeilen
			// (die typischerweise laenger klingen) bekommen automatisch mehr
			// Zeit zum Scrollen als kurze, statt einer fuer alle gleich
			// schnellen, unabhaengig von der Zeilendauer wirkenden Animation.
			o.lyricsFocusV0 = L.v0;
			o.lyricsFocusV1 = L.v1;
			if( L.overflowU > 0.f )
			{
				const float startFrac = 0.30f, endFrac = 0.90f;
				float sp = ( lineFrac - startFrac ) / ( endFrac - startFrac );
				sp = std::min( std::max( sp, 0.f ), 1.f );
				const float eased = sp * sp * ( 3.f - 2.f * sp );   // smoothstep
				o.lyricsScrollU = L.overflowU * eased;
			}
		}
		else
		{
			// Unsynchronisiert: gleichmäßig über die Songdauer scrollen;
			// ohne Dauer mit fester, gemächlicher Geschwindigkeit.
			if( dur > 10.0 )
				targetV = float( pos / dur );
			else
				targetV = float( pos * 0.008 );
			targetV = std::min( std::max( targetV, 0.f ), 1.f );
		}

		// Immer weich nachziehen statt zu teleportieren - auch bei einem
		// großen Sprung (Seek, oder eine seltene, vom Settle-Fenster in
		// NowPlaying nicht abgefangene Korrektur) mit deutlich höherer Rate,
		// damit es "schnell aufholt" statt zu schneiden. Ein Sprung über die
		// halbe Textur braucht damit ~0.2s statt eines Einzelframe-Cuts.
		const bool bigGap = fabsf( targetV - m_scrollVSm ) > 0.08f;
		// Edge-triggered (once per episode, not every frame of a ~0.2-0.5s
		// catch-up): this is the "visible but not instant" jump candidate --
		// a real seek looks exactly like this by design, but so would any
		// OTHER cause that displaces targetV by more than a normal single-
		// line step (see the two PLL-snap logs above and the RUECKWAERTS/
		// VORWAERTS(>1) line-index log for the other candidates).
		static bool s_wasBigGap = false;
		if( bigGap && !s_wasBigGap )
			fprintf( stderr, "[Lyrics] Scroll-Sprung: targetV=%.4f scrollV=%.4f "
			         "(delta=%.4f) karaokeLine=%d pos=%.3f\n",
			         targetV, m_scrollVSm, targetV - m_scrollVSm, m_karaokeLine, pos );
		s_wasBigGap = bigGap;

		float rate = bigGap ? 2.5f : 0.10f;
		m_scrollVSm = slew( m_scrollVSm, targetV, rate, dt );
		o.lyricsScrollV = m_scrollVSm;
	}

	// ---- Künstlerbilder: Rotation, alle ~45 s für ~14 s eingeblendet ----
	// (weicht dem Musikvideo-PiP unten, falls für den Song eins bereit ist —
	// gleicher Eck-Slot, siehe setArtistExternalTexture()).
	bool artistOn = m_artistShow
	              && !( m_videoEnabled && m_trackMedia->videoReady() )
	              && m_trackMedia->imageCount() > 0;
	float artistTarget = 0.f;
	if( artistOn )
	{
		// Bei großen Sammlungen (bis 50 Bilder) rotiert es flotter, damit
		// über einen Abend auch wirklich viele Bilder drankommen.
		const bool   viele   = m_trackMedia->imageCount() >= 10;
		const qint64 cycleMs = viele ? 26000 : 45000;
		const qint64 showMs  = viele ? 12000 : 14000;
		const qint64 fadeMs  = 2200;
		qint64 t  = m_fpsTimer.elapsed() - m_trackStartMs;
		if( t < 0 ) t = 0;
		qint64 ph = t % cycleMs;
		int    cy = int( t / cycleMs );
		if( ph < showMs )
		{
			int idx = cy % m_trackMedia->imageCount();
			if( idx != m_artistIdxUploaded
			    || m_artistRevSeen != m_trackMedia->imagesRevision() )
			{
				m_artistIdxUploaded = idx;
				m_artistRevSeen     = m_trackMedia->imagesRevision();
				const QImage &img = m_trackMedia->imageAt( idx );
				fs->setArtistTexture( img.constBits(), img.width(), img.height() );
				// Cover-Palette aus dem frisch gewaehlten Bild ziehen - der
				// Song bekommt organisch die Farbwelt seines Kuenstlers.
				m_palValid = extractPalette( img, m_palA, m_palB );
			}
			float in  = std::min( 1.f, float(ph) / float(fadeMs) );
			float out = std::min( 1.f, float(showMs - ph) / float(fadeMs) );
			artistTarget = std::min( in, out );
		}
	}
	m_artistAlphaSm = slew( m_artistAlphaSm, artistTarget, 1.2f, dt );
	// Cover-Palette: sehr langsam einblenden (0.3/s) - die Farbwelt eines
	// Songs soll sich etablieren, nicht aufpoppen.  Unabhaengig davon, ob
	// das Bild selbst gerade sichtbar ist.
	m_palAmtSm = slew( m_palAmtSm, m_palValid ? 1.f : 0.f, 0.3f, dt );
	if( m_palAmtSm > 0.001f )
	{
		o.paletteAmt = m_palAmtSm;
		for( int k = 0; k < 3; ++k )
		{
			o.paletteA[k] = m_palA[k];
			o.paletteB[k] = m_palB[k];
		}
	}
	if( m_artistAlphaSm > 0.001f && m_artistIdxUploaded >= 0
	    && m_artistIdxUploaded < m_trackMedia->imageCount() )
	{
		const QImage &img = m_trackMedia->imageAt( m_artistIdxUploaded );
		o.artistAlpha  = m_artistAlphaSm * 0.9f;
		o.artistAspect = float(img.width()) / float(std::max( img.height(), 1 ));
	}

	// ---- Musikvideo-PiP: übernimmt dieselbe Ecke, sobald TrackMedia ein
	// gecachtes Video für den laufenden Song bereit hat (siehe TrackMedia::
	// requestTrack()'s Download-Kette). Läuft per Seek synchron zur echten
	// Song-Position statt einer eigenen Uhr — ein Video, das kürzer ist als
	// der Song, loopt einfach (siehe VideoPiP::videoPipLoad()'s Infinite-
	// Loop-Setting) und bleibt trotzdem an der richtigen Stelle.
	bool videoOn = m_artistShow && m_videoEnabled && m_trackMedia->videoReady();
	if( videoOn )
	{
		if( m_trackMedia->videoPath() != m_videoPathLoaded )
		{
			videoPipLoad( m_trackMedia->videoPath().toLocal8Bit().constData() );
			m_videoPathLoaded = m_trackMedia->videoPath();
		}
		// `pos` (computed above: SMTC position if available, PLL-smoothed,
		// else the local test-mode clock) is already the SAME authoritative
		// position the lyrics scroll/karaoke highlight are synced to -- reuse
		// it here too instead of re-querying NowPlaying directly, so the
		// video and the lyrics can never disagree about "where we are", and
		// KALEIDO_LYRICS_TEST's local clock fallback works for video sync too.
		// 400ms tolerance: don't hard-seek on every tiny position nudge (same
		// lesson as the lyrics scroll above) -- only a real jump snaps it.
		videoPipSeek( (long long)( pos * 1000.0 ), 400 );
		const bool songIsPlaying = m_lyricsTest
		                         || ( m_nowPlaying && m_nowPlaying->timeline().playing );
		videoPipSetPlaying( songIsPlaying );
	}
	else if( !m_videoPathLoaded.isEmpty() )
	{
		videoPipRelease();
		m_videoPathLoaded.clear();
	}
	// Nur der Einblend-Ramp ist geglättet; das Ausblenden ist absichtlich
	// hart (kein slew auf dem Lesezugriff unten) — sobald videoOn false wird,
	// löscht videoPipRelease() gerade dessen GL-Textur, ein weiches Ausfaden
	// würde also eine bereits gelöschte Textur zu binden versuchen.
	m_videoAlphaSm = slew( m_videoAlphaSm, videoOn ? 1.f : 0.f, 1.2f, dt );
	if( videoOn && m_videoAlphaSm > 0.001f )
	{
		unsigned int vw = 0, vh = 0;
		const unsigned int vtex = videoPipFrame( &vw, &vh );
		if( vtex != 0 )
		{
			fs->setArtistExternalTexture( vtex );
			o.artistAlpha  = m_videoAlphaSm * 0.9f;
			o.artistAspect = ( vh > 0 ) ? float(vw) / float(vh) : 16.f / 9.f;
		}
		// vtex==0: decoder hasn't produced a frame yet (just loaded) -- leave
		// whatever the artist-image block above wrote (or nothing) in place
		// for this one frame rather than flashing an empty corner.
	}
	else
	{
		fs->setArtistExternalTexture( 0 );   // clears any stale override
	}

	fs->setOverlayFrame( o );
}

void GLwidget::requestCurrentTrackMedia()
{
	if( !m_trackMedia || !m_nowPlaying || m_nowPlaying->title().isEmpty() )
		return;
	const double durSec = ( m_artistShow && m_videoEnabled )
	                      ? m_nowPlaying->timeline().durationSec : -1.0;
	m_trackMedia->requestTrack( m_nowPlaying->artist(), m_nowPlaying->title(), durSec );
}

void GLwidget::setArtistImagesEnabled( bool on )
{
	m_artistShow = on;
	if( on )
		requestCurrentTrackMedia();
}

void GLwidget::setVideoPipEnabled( bool on )
{
	m_videoEnabled = on;
	if( on )
		requestCurrentTrackMedia();
}

void GLwidget::setLyricsModeValue( int mode )
{
	m_lyricsMode = qBound( 0, mode, 2 );
	if( m_lyricsMode > 0 )
		requestCurrentTrackMedia();
}

void GLwidget::selectAudioDevice( int index )
{
	if( !m_audioAnalyzer )
		return;
	if( index == 0 )                          // 0 = default output (loopback)
	{
		m_audioAnalyzer->requestDevice( QString(), false );
		fprintf( stderr, "Audio source: default (loopback)\n" );
		return;
	}
	QList<AudioDevice> devs = m_audioAnalyzer->devices();
	int di = index - 1;
	if( di >= 0 && di < devs.size() )
	{
		m_audioAnalyzer->requestDevice( devs[di].id, devs[di].isCapture );
		fprintf( stderr, "Audio source: %s\n", devs[di].name.toLocal8Bit().constData() );
	}
}

QVector<int> GLwidget::configMenuMatches() const
{
	QVector<int> out;
	for( int i = 0; i < int( m_configurationList.size() ); ++i )
		if( m_configMenuFilter.isEmpty()
		    || m_configurationList[i]->getConfigurationName()
		           .contains( m_configMenuFilter, Qt::CaseInsensitive ) )
			out.append( i );
	return out;
}

QVector<int> GLwidget::audioMenuMatches() const
{
	QVector<int> out;
	const QString f = m_audioMenuFilter;
	// Row 0 is the default-output entry; it stays visible while nothing is
	// typed, and matches on its own label once something is.
	if( f.isEmpty()
	    || QString::fromUtf8( Strings::T( S_AUDIOMENU_DEFAULT_OUTPUT ) )
	           .contains( f, Qt::CaseInsensitive ) )
		out.append( 0 );
	if( m_audioAnalyzer )
	{
		const QList<AudioDevice> devs = m_audioAnalyzer->devices();
		for( int i = 0; i < devs.size(); ++i )
			if( f.isEmpty() || devs[i].name.contains( f, Qt::CaseInsensitive ) )
				out.append( i + 1 );
	}
	return out;
}

int GLwidget::audioMenuCount() const
{
	// Row 0 is "default output"; the enumerated devices follow it.
	return 1 + ( m_audioAnalyzer ? m_audioAnalyzer->devices().size() : 0 );
}

/**
 * @brief Draw the audio-source picker (key 'd').
 *
 * Scrolls and filters, for the same reason the preset menu does: selection used
 * to be bound to the digit keys, so the list was truncated at nine entries
 * (`if( shown > 9 ) shown = 9`) and anything past the ninth device was not even
 * drawn. A machine with a few virtual cables has well over nine, which is also
 * why typing to narrow the list earns its keep here.
 *
 * The highlight bar is where Enter would take you; the arrow marks the source
 * that is actually feeding the analyzer.
 */
void GLwidget::drawAudioMenu( QPainter *painter )
{
	QList<AudioDevice> devs;
	QString current;
	if( m_audioAnalyzer )
	{
		devs    = m_audioAnalyzer->devices();
		current = m_audioAnalyzer->currentDeviceName();
	}

	const QVector<int> hits = audioMenuMatches();
	const int total = hits.size();
	const int lh    = 26;

	// Leave room for the title and the key hint, and never fill the screen.
	const int maxRows = std::max( 3, int( ( height() * 0.72 - 4 * lh ) / lh ) );
	const int visible = std::max( 0, std::min( total, maxRows ) );
	if( total > 0 ) menuScroll( m_audioMenuCursor, m_audioMenuTop, total, visible );
	else            m_audioMenuCursor = m_audioMenuTop = 0;

	const QString hint = QString::fromUtf8( Strings::T( S_MENU_NAV_HINT ) );

	painter->setFont( QFont( "Consolas", 12 ) );
	QFontMetrics fm( painter->font() );
	int textW = fm.horizontalAdvance( hint );
	for( int i = 0; i < devs.size(); ++i )
	{
		const QString tag = QString::fromUtf8( devs[i].isCapture ? Strings::T( S_AUDIOMENU_INPUT_TAG )
		                                                        : Strings::T( S_AUDIOMENU_OUTPUT_TAG ) );
		textW = std::max( textW, fm.horizontalAdvance( devs[i].name + tag ) );
	}

	const int boxW = std::min( width() - 40, std::max( 580, textW + 70 ) );
	const int boxH = lh * ( std::max( visible, 1 ) + 2 ) + 44;
	const int x0   = ( width()  - boxW ) / 2;
	const int y0   = ( height() - boxH ) / 2;

	painter->fillRect( x0, y0, boxW, boxH, QColor( 0, 0, 0, 200 ) );
	painter->setPen( QColor( 120, 200, 255 ) );
	painter->setFont( QFont( "Consolas", 14, QFont::Bold ) );
	painter->drawText( x0 + 20, y0 + 32,
	                   QString::fromUtf8( Strings::T( S_AUDIOMENU_TITLE ) )
	                   + ( m_audioMenuFilter.isEmpty()
	                       ? QString()
	                       : QString( "   \"%1\"" ).arg( m_audioMenuFilter ) ) );

	painter->setFont( QFont( "Consolas", 12 ) );

	m_audioMenuHit.box   = QRect( x0, y0, boxW, boxH );
	m_audioMenuHit.rowY0 = y0 + 32 + lh - fm.ascent() - 3;
	m_audioMenuHit.rowH  = lh;
	m_audioMenuHit.rows  = visible;
	m_audioMenuHit.top   = m_audioMenuTop;

	// current.isEmpty() means "the default device" -- see the language-neutral
	// sentinel comment in AudioAnalyzer::run().
	for( int row = 0; row < visible; ++row )
	{
		const int i  = hits[m_audioMenuTop + row];
		const int ry = y0 + 32 + ( row + 1 ) * lh;

		QString label;
		bool    active = false;
		if( i == 0 )
		{
			label  = QString::fromUtf8( Strings::T( S_AUDIOMENU_DEFAULT_OUTPUT ) );
			active = current.isEmpty();
		}
		else
		{
			const AudioDevice &d = devs[i - 1];
			label  = d.name + QString::fromUtf8( d.isCapture ? Strings::T( S_AUDIOMENU_INPUT_TAG )
			                                                 : Strings::T( S_AUDIOMENU_OUTPUT_TAG ) );
			active = !current.isEmpty() && current == d.name;
		}

		if( m_audioMenuTop + row == m_audioMenuCursor )
		{
			painter->fillRect( QRect( x0 + 6, ry - fm.ascent() - 3, boxW - 12, lh ),
			                   QColor( 70, 120, 190, 190 ) );
			painter->setPen( QColor( 255, 255, 255 ) );
		}
		else if( active ) painter->setPen( QColor( 150, 230, 150 ) );
		else              painter->setPen( QColor( 210, 218, 232 ) );

		// No row numbers: they only announced the digit shortcuts, which are gone.
		painter->drawText( x0 + 24, ry,
		                   label + ( active ? QString::fromUtf8( "   \xE2\x86\x90" ) : QString() ) );
	}

	if( visible == 0 )
	{
		painter->setPen( QColor( 200, 150, 150, 220 ) );
		painter->drawText( x0 + 24, y0 + 32 + lh,
		                   QString::fromUtf8( Strings::T( S_MENU_NO_MATCH ) ) );
	}

	painter->setPen( QColor( 150, 150, 155, 200 ) );
	if( m_audioMenuTop > 0 )
		painter->drawText( x0 + boxW - 28, y0 + 32 + lh,
		                   QString::fromUtf8( "\xE2\x96\xB2" ) );
	if( m_audioMenuTop + visible < total )
		painter->drawText( x0 + boxW - 28, y0 + 32 + visible * lh,
		                   QString::fromUtf8( "\xE2\x96\xBC" ) );

	painter->setFont( QFont( "Consolas", 10 ) );
	QFontMetrics hfm( painter->font() );
	painter->setPen( QColor( 165, 165, 172, 215 ) );
	painter->drawText( x0 + ( boxW - hfm.horizontalAdvance( hint ) ) / 2,
	                   y0 + boxH - 12, hint );
}

void GLwidget::drawNowPlaying( QPainter *painter, const QString &title,
                              const QString &artist, float alpha )
{
	int a   = int(alpha * 255.f + 0.5f); if (a < 0) a = 0; if (a > 255) a = 255;
	int bgA = int(alpha * 150.f + 0.5f);

	QFont tf("Segoe UI", 20, QFont::Bold);
	QFont af("Segoe UI", 14);
	QFontMetrics tm(tf), am(af);
	int w = qMax(tm.horizontalAdvance(title), am.horizontalAdvance(artist)) + 70;
	const int h = 72;
	const int x = 40;
	const int y = height() - h - 50;

	painter->fillRect( x, y, w, h, QColor(0, 0, 0, bgA) );        // backdrop
	painter->fillRect( x, y, 5, h, QColor(120, 200, 255, a) );    // accent bar

	painter->setFont( tf );
	painter->setPen( QColor(255, 255, 255, a) );
	painter->drawText( x + 22, y + 34, title );
	painter->setFont( af );
	painter->setPen( QColor(180, 210, 240, a) );
	painter->drawText( x + 22, y + 58, artist );
}

void GLwidget::keyPressEvent(QKeyEvent* event)
{
	// The configuration picker is modal while it is open: the arrow keys drive
	// its cursor rather than doing whatever they normally do, and Enter picks
	// the highlighted preset. The digit shortcuts still work and still mean the
	// same rows, they just cannot reach past the ninth.
	if( m_showSelectConfigurationMenu )
	{
		const QVector<int> hits = configMenuMatches();
		switch( menuNavKey( event->key(), m_configMenuCursor, hits.size() ) )
		{
			case MenuKey::Moved:
				return;
			case MenuKey::Accept:
				m_showSelectConfigurationMenu = false;
				if( m_configMenuCursor >= 0 && m_configMenuCursor < hits.size()
				    && m_configurationList[hits[m_configMenuCursor]] != m_actConfiguration )
					switchConfig( m_configurationList[hits[m_configMenuCursor]] );
				m_configMenuFilter.clear();
				return;
			case MenuKey::Cancel:
				// Esc peels one layer at a time: clear the filter first, close
				// second. Closing straight away would throw away the typing
				// with no way to see what was matched.
				if( !m_configMenuFilter.isEmpty() ) { m_configMenuFilter.clear(); m_configMenuCursor = 0; }
				else                                  m_showSelectConfigurationMenu = false;
				return;
			case MenuKey::None:
				break;
		}
		// '0' still closes -- but only while nothing is typed, after which it
		// is a character like any other. Checked BEFORE the filter, or it
		// would be typed instead of closing.
		if( event->key() == Qt::Key_0 && m_configMenuFilter.isEmpty() )
		{
			m_showSelectConfigurationMenu = false;
			return;
		}
		menuFilterKey( event, m_configMenuFilter, m_configMenuCursor );
		return;   // modal: nothing else leaks out of an open menu
	}

	// The audio-source picker is modal while it is open: arrows drive its
	// cursor, Enter picks.
	if( m_showAudioMenu )
	{
		const QVector<int> hits = audioMenuMatches();
		switch( menuNavKey( event->key(), m_audioMenuCursor, hits.size() ) )
		{
			case MenuKey::Moved:
				return;
			case MenuKey::Accept:
				m_showAudioMenu = false;
				if( m_audioMenuCursor >= 0 && m_audioMenuCursor < hits.size() )
					selectAudioDevice( hits[m_audioMenuCursor] );
				m_audioMenuFilter.clear();
				return;
			case MenuKey::Cancel:
				if( !m_audioMenuFilter.isEmpty() ) { m_audioMenuFilter.clear(); m_audioMenuCursor = 0; }
				else                                 m_showAudioMenu = false;
				return;
			case MenuKey::None:
				break;
		}
		// 'd' closes while nothing is typed; after that it is just a letter,
		// which matters here because most device names contain one.
		if( event->key() == Qt::Key_D && m_audioMenuFilter.isEmpty() )
		{
			m_showAudioMenu = false;
			return;
		}
		menuFilterKey( event, m_audioMenuFilter, m_audioMenuCursor );
		return;   // modal
	}

    switch(event->key())
	{
		case Qt::Key_Escape:
			saveAllSettings();   // exit() unten läuft an keinem Destruktor vorbei
			exit(0);
			break;
		case Qt::Key_Q:
			saveAllSettings();
			exit(0);
			break;
		case Qt::Key_0:
			m_showSelectConfigurationMenu = !m_showSelectConfigurationMenu;
			// Open on the preset that is running, so Enter straight away is a
			// no-op rather than a jump to whatever happened to be first.
			if( m_showSelectConfigurationMenu )
			{
				const int act = remoteActiveConfig();
				m_configMenuCursor = ( act >= 0 ) ? act : 0;
			}
			break;
		case Qt::Key_I:
			m_showFeatureOverlay = !m_showFeatureOverlay;
			break;
		case Qt::Key_H:
			m_showHelp = !m_showHelp;
			break;
		case Qt::Key_V:
			m_showShaderInfo = !m_showShaderInfo;   // debug: which shaders are active
			break;
		case Qt::Key_D:
			m_showAudioMenu = true;   // closed again from the modal handler above
			// Open on the source that is feeding the analyzer, so Enter right
			// away changes nothing.
			m_audioMenuCursor = 0;
			if( m_audioAnalyzer )
			{
				const QString cur = m_audioAnalyzer->currentDeviceName();
				if( !cur.isEmpty() )
				{
					const QList<AudioDevice> devs = m_audioAnalyzer->devices();
					for( int i = 0; i < devs.size(); ++i )
						if( devs[i].name == cur ) { m_audioMenuCursor = i + 1; break; }
				}
			}
			break;
		case Qt::Key_P:
			setNowPlayingEnabled( !m_showNowPlaying );
			fprintf( stderr, "Now-playing display: %s\n", m_showNowPlaying ? "ON" : "OFF" );
			break;

		// ---- Lyrics-Modus zyklisch: aus -> Scroll -> Karaoke ----
		// Umschalt+W: kinetischer Zeilen-Slam an/aus (separat, da manchen der
		// Einflug beim Zeilenwechsel zu unruhig ist).
		case Qt::Key_W:
		{
			if( event->modifiers() & Qt::ShiftModifier )
			{
				m_lyricsKinetic = !m_lyricsKinetic;
				fprintf( stderr, "Lyrics-Kinetik (Zeilen-Slam): %s\n",
				         m_lyricsKinetic ? "AN" : "AUS" );
				break;
			}
			setLyricsModeValue( ( m_lyricsMode + 1 ) % 3 );
			static const char *kLyricsNames[] = { "AUS", "Scroll", "Karaoke" };
			fprintf( stderr, "Lyrics: %s\n", kLyricsNames[m_lyricsMode] );
			break;
		}

		// ---- Künstlerbilder an/aus ----
		case Qt::Key_O:
			setArtistImagesEnabled( !m_artistShow );
			fprintf( stderr, "Kuenstlerbilder: %s\n", m_artistShow ? "AN" : "AUS" );
			break;
		case Qt::Key_R:
			m_recorder.toggle();   // record visuals + music to an mp4
			break;
		case Qt::Key_L:
			RenderPipeline::toggleLightShow();   // corner lamps / light-show on/off
			fprintf( stderr, "Stage lamps: %s\n", RenderPipeline::lightShow() ? "ON" : "OFF" );
			break;
		case Qt::Key_N:
			// Manually advance to the next effect (texture + combine), snappy cut.
			if( m_actConfiguration && m_actConfiguration->m_renderPipeline )
			{
				m_actConfiguration->m_renderPipeline->requestSceneChange();
				fprintf( stderr, "n: next effect requested\n" );
			}
			break;

		// ---- Live tuning (values shared across all configs) ----
		case Qt::Key_BracketLeft:  RenderPipeline::adjustReactivity(-0.10f); break;  // [  less reactive
		case Qt::Key_BracketRight: RenderPipeline::adjustReactivity(+0.10f); break;  // ]  more reactive
		case Qt::Key_Comma:        RenderPipeline::adjustTrails(-0.05f);     break;  // ,  shorter trails
		case Qt::Key_Period:       RenderPipeline::adjustTrails(+0.05f);     break;  // .  longer trails
		case Qt::Key_Minus:        RenderPipeline::adjustMood(-0.10f);       break;  // -  less mood colour
		case Qt::Key_Equal:        RenderPipeline::adjustMood(+0.10f);       break;  // =  more mood colour
		case Qt::Key_Semicolon:                                                    // ;  less latency lead
			RenderPipeline::adjustLatency(-0.01f);
			fprintf( stderr, "Latency lead: %.0f ms\n", RenderPipeline::latency() * 1000.f );
			break;
		case Qt::Key_Apostrophe:                                                   // '  more latency lead
			RenderPipeline::adjustLatency(+0.01f);
			fprintf( stderr, "Latency lead: %.0f ms\n", RenderPipeline::latency() * 1000.f );
			break;

		// ---- Persist the current look + UI state as the startup default ----
		case Qt::Key_K:
			saveAllSettings();
			break;

		// ---- Instant replay: 'y' arms the rolling buffer, 'x' saves it ----
		case Qt::Key_Y:
			m_recorder.toggleReplayArm();
			break;
		case Qt::Key_X:
			m_recorder.saveReplay();
			break;

		// ---- VJ handbrakes ----
		case Qt::Key_B:
			RenderPipeline::toggleBlackout();
			fprintf( stderr, "Blackout: %s\n", RenderPipeline::blackout() ? "AN" : "AUS" );
			break;
		case Qt::Key_E:
			RenderPipeline::toggleFreeze();
			fprintf( stderr, "Freeze: %s\n", RenderPipeline::frozen() ? "AN" : "AUS" );
			break;
		case Qt::Key_T:
			if( m_audioAnalyzer )
				m_audioAnalyzer->tapTempo();
			break;
		case Qt::Key_U:
			RenderPipeline::togglePin();
			fprintf( stderr, "Effekt-Pin: %s\n",
			         RenderPipeline::pinned() ? "AN (haelt den aktuellen Effekt)" : "AUS" );
			break;

		// ---- Taste learning: favourite the current effect ----
		case Qt::Key_F:
			if( m_actConfiguration && m_actConfiguration->m_renderPipeline )
				m_actConfiguration->m_renderPipeline->favoriteCurrentEffect();
			break;

		// ---- Scene marking (build a shortlist while watching) ----
		// Space alone toggles the mark on whatever is on screen; Shift+Space
		// writes the shortlist out as Configurations/Marked.xml. Deliberately
		// two gestures on one key: marking happens constantly during an
		// inspection pass, saving once at the end.
		case Qt::Key_Space:
			if( m_actConfiguration && m_actConfiguration->m_renderPipeline )
			{
				RenderPipeline *rp = m_actConfiguration->m_renderPipeline;
				if( event->modifiers() & Qt::ShiftModifier )
					rp->saveMarkedPreset();
				else
					rp->toggleMarkCurrentScene();
				// The shader-info overlay ('v') carries the mark state, so an
				// inspection pass gets visible feedback without a console.
				m_showShaderInfo = true;
			}
			break;

		// ---- Stereoscopic output ----
		case Qt::Key_Z:
		{
			RenderPipeline::cycleStereo();
			static const char *kStereoNames[] =
				{ "AUS", "Side-by-Side", "Top-Bottom", "Anaglyph (rot/cyan)" };
			fprintf( stderr, "Stereo: %s\n", kStereoNames[RenderPipeline::stereoMode() & 3] );
			break;
		}
		case Qt::Key_C:
			RenderPipeline::adjustStereoDepth( -0.2f );
			fprintf( stderr, "Stereo-Tiefe: %.1f\n", RenderPipeline::stereoDepth() );
			break;
		case Qt::Key_M:
			RenderPipeline::adjustStereoDepth( +0.2f );
			fprintf( stderr, "Stereo-Tiefe: %.1f\n", RenderPipeline::stereoDepth() );
			break;

		// ---- MIDI learn: cycle through the assignable targets ----
		case Qt::Key_J:
			m_midiLearn = (m_midiLearn < 0) ? 0
			            : (m_midiLearn + 1 >= MIDI_TARGETS ? -1 : m_midiLearn + 1);
			if( m_midiLearn >= 0 )
				fprintf( stderr, "MIDI learn: bewege einen Regler fuer '%s' "
				         "(j = weiter/beenden)\n", kMidiTargetNames[m_midiLearn] );
			else
				fprintf( stderr, "MIDI learn: aus\n" );
			break;

		// ---- Auto-config-by-mood toggle ----
		case Qt::Key_A:
			m_autoConfig = !m_autoConfig;
			m_moodBucket = -1;   // re-evaluate from scratch
			fprintf( stderr, "Auto-config-by-mood: %s\n", m_autoConfig ? "ON" : "OFF" );
			break;

		// ---- Adaptive render-scale toggle ----
		case Qt::Key_G:
			setAutoScaleEnabled( !m_autoScale );
			fprintf( stderr, "Adaptive render scale: %s\n", m_autoScale ? "ON" : "OFF" );
			break;

		// ---- Screenshot (this window only) ----
		case Qt::Key_S:
		{
			QImage img = grabFramebuffer();
			QString fn = QString("kaleidoscope_%1.png")
			             .arg( QDateTime::currentDateTime().toString("yyyyMMdd_hhmmss") );
			if( img.save( fn ) )
				fprintf( stderr, "Saved screenshot: %s\n", fn.toLocal8Bit().constData() );
			break;
		}
		// '1'-'9' used to jump straight to a preset. The scrolling menu on '0'
		// reaches every preset, including the ones those keys never could, so
		// the digits are free again -- nine keys is a lot to spend on a
		// shortcut that only covered part of the list.

		default:
			event->ignore();
			break;
    }
}
