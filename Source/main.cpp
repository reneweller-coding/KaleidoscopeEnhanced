/**
 * @file main.cpp
 * @brief Application entry point: command-line parsing and Qt/GL application bootstrap.
 *
 * @par CLI contract
 * All options are parsed by parsecommandline() (single-character flags, some taking
 * one parameter) before any GL/Qt objects exist, so their effects are just setting
 * static fields on RenderPipeline / GLwidget / AudioAnalyzer that those classes read
 * once the app actually starts:
 *  - `-b`            toggle fullscreen at startup (2nd monitor if present).
 *  - `-s <factor>`   internal render scale 0.25..2.0 (lower = faster on weak GPUs).
 *  - `-c <name>`     start with a named configuration (e.g. "darkambient", "normal";
 *                    also used ad hoc as a probe/test configuration name during
 *                    development, e.g. "-c probe" -- there is no separate probe code
 *                    path, it is just a configuration name).
 *  - `-m <index>`    fullscreen on monitor `<index>` (0-based); implies `-b`.
 *  - `-l`            redirect stderr to kaleidoscope.log instead of the console
 *                    (kiosk/unattended logging, with one rotated backup).
 *  - `-r`            start recording (visuals + music -> mp4) immediately.
 *  - `-w <wav>`      offline mode: analyze this WAV file instead of live audio
 *                    (deterministic testing).
 *  - `-o`            enable Spout output: publish the frame as sender "Kaleidoscope".
 *  - `-t <port>`     web remote (phone control page) port; ON BY DEFAULT at 8080 even
 *                    without this flag (LAN-only, unauthenticated by design, and
 *                    auto-discoverable — see WebRemote's UDP responder). `-t 0` disables
 *                    it; `-t <port>` picks a different port. If the chosen port is busy
 *                    (e.g. a second instance on the same PC), WebRemote quietly retries
 *                    the next few ports so multiple instances each still get one.
 *  - `-x <wav>`      batch render: combines `-w` + auto-record + auto-quit, used to
 *                    deterministically render a WAV to an mp4 and exit (no separate
 *                    "batch mode" branch here -- GLwidget itself drives the auto-quit
 *                    once s_batchRender is set).
 *  - `-i <sender>`   Spout INPUT: use a live Spout sender's video as the source image
 *                    instead of photos ("any" = whichever sender is active).
 *  - `-v <path>`     native VIDEO source image (a file or a folder of videos); `-i`
 *                    wins if both are given.
 *  - `-3 <mode>`     stereoscopic output mode: "sbs", "tb", or an "ana*" prefix for
 *                    anaglyph; anything else disables it.
 *  - `-h`            print the help/usage text and exit.
 *
 * There is only one runtime path after parsing: the normal windowed Qt application
 * (QApplication + QMyWindow, shown either windowed or fullscreen). The various flags
 * above configure that single path (e.g. `-x` makes it record-and-quit) rather than
 * branching into distinct offline/probe/check modes.
 */

#include <iostream>
#include <cstring>
#include <cstdlib>
#include <cstdio>
#include <ctime>

#include "RenderPipeline.h"
#include "glwidget.h"

#include <QtWidgets/QApplication>
#include <QtGui/QIcon>
#include <QtGui/QScreen>
#include <QtGui/QSurfaceFormat>
#include "QMyWindow.h"

#ifdef WIN32
#include <shlobj.h>
#endif

// NOTE: keep this AFTER the Windows headers above.  With C++17 std::byte and a
// `using namespace std;` active, the Windows SDK's unqualified `byte` in
// objidl.h becomes ambiguous (C2872).  Importing std only here avoids that.
using namespace std;

QString directory = "C:\\Users\\rene\\Pictures";	///< Default photo-source directory; overwritten with the user's Pictures folder on Windows startup.
bool fullscreen = false;	///< Whether to start the window in fullscreen mode (`-b`, or implied by `-m`).
int  monitorIndex = -1;   ///< `-m <n>`: target monitor for fullscreen (-1 = auto).
bool logToFile = false;   ///< -l: redirect stderr to a rotating log file (kiosk).



//rwrwtodo: Correct the options-list
/**
 * @brief Prints command-line usage/help text and exits the process.
 *
 * Reports the offending option/parameter (if any) first, then always prints the full
 * usage text (options and in-app keyboard shortcuts). Exits with status -1 if @p cmd
 * is non-NULL (an actual parse error), or 0 if it was called for `-h` (a clean,
 * user-requested help exit).
 * @param cmd Offending option string (e.g. "-x"), or NULL when invoked for `-h`.
 * @param parm First parameter of the offending option, or NULL if not applicable.
 */
void commandlineerror( char *cmd, char *parm )
{
	if ( cmd )
		fprintf(stderr, "Offending option: %s\n", cmd );
	if ( parm )
		fprintf(stderr, "with first parameter: %s\n", parm );

	fprintf(stderr, "\n\nUsage: Kaleidoscope [options]\n"
	"Options:\n"
	"-b            start in fullscreen (uses the 2nd monitor if present)\n"
	"-s <factor>   internal render scale 0.25..2.0 (lower = faster on weak GPUs)\n"
	"-c <name>     start with this configuration (e.g. darkambient, normal)\n"
	"-m <index>    fullscreen on monitor <index> (0-based; implies -b)\n"
	"-l            log to kaleidoscope.log instead of the console (kiosk)\n"
	"-r            start recording (visuals + music -> mp4) immediately\n"
	"-w <wav>      offline: analyze this WAV instead of live audio (testing)\n"
	"-o            Spout output: publish the frame as sender 'Kaleidoscope'\n"
	"              (for OBS / Resolume / any Spout receiver)\n"
	"-t <port>     web remote port (phone control page); ON by default at 8080,\n"
	"              auto-discovered by the Kaleidoscope Remote app - '-t 0' disables\n"
	"-x <wav>      batch render: record this WAV deterministically to an mp4\n"
	"              (recordings\\rec_*), then exit automatically\n"
	"-i <sender>   Spout INPUT: the sender's live video (OBS, Resolume, a\n"
	"              webcam via OBS, ...) replaces the photos as source image\n"
	"              ('any' = whichever sender is active; photos while none runs)\n"
	"-v <path>     native VIDEO as source image: a file (looped) or a folder\n"
	"              of videos played in turn, replacing the photos.  Uses the\n"
	"              system's own codecs; -i wins if both are given\n"
	"-3 <mode>     stereoscopic output: sbs (side-by-side, 3D projectors and\n"
	"              HMD video viewers), tb (top-bottom), ana (red-cyan glasses)\n"
	"-h            this help menu\n"
	"Keys (while running):\n"
	"0             toggle the configuration-select menu\n"
	"1-9           switch configuration\n"
	"i             toggle the live audio-feature overlay (incl. FPS)\n"
	"n             advance to the next effect\n"
	"[ ]           reactivity  - less / more audio-driven motion\n"
	", .           trails      - shorter / longer feedback trails\n"
	"- =           mood        - weaker / stronger colour grading\n"
	"; '           latency     - visuals earlier / later vs. the heard beat\n"
	"k             save current look settings as the startup default\n"
	"s             save a PNG screenshot\n"
	"j             MIDI learn - bind knobs/pads to the controls (cycles targets)\n"
	"y             arm the instant-replay buffer (rolling ~30 s)\n"
	"x             save the instant replay as replays\\replay_*\\replay.mp4\n"
	"b             BLACKOUT - soft fade to black and back (VJ)\n"
	"e             FREEZE   - hold the picture (VJ)\n"
	"t             tap tempo - tap the beat to override tempo detection\n"
	"u             pin/unpin the current effect (no automatic switches)\n"
	"f             favourite the current effect (persistent selection bonus;\n"
	"              skipping a fresh effect with 'n' learns a malus)\n"
	"z             cycle stereoscopic mode (off / SBS / top-bottom / anaglyph)\n"
	"c / m         stereo depth - weaker / stronger\n"
	"Esc / q       quit\n"
	"\n");

	if ( cmd )
		exit(-1);				// problem occured
	else
		exit(0);				// was option -h
}


/**
 * @brief Parses the process's command-line arguments and applies each recognized
 *        option's effect immediately (mostly by setting static fields on
 *        RenderPipeline / GLwidget / AudioAnalyzer, plus the globals above).
 *
 * Builds a lookup table (optionchar[] / musthaveparam[]) of the valid single-letter
 * options and whether each needs a parameter, then walks argv applying the table:
 * an unknown option, a missing required parameter, or a non-option argument all call
 * commandlineerror() and exit the process. `-h` always exits via commandlineerror().
 * @param argc Argument count, as passed to main().
 * @param argv Argument vector, as passed to main() (argv[0] is skipped/ignored).
 */
void parsecommandline( int argc, char *argv[] )
{
	/* valid option characters; last char MUST be 0 ! */
	// A switch must be listed HERE as well as handled in the switch below —
	// the table is what makes it valid at all, and a case with no entry here is
	// rejected before it is ever reached.
	char optionchar[] =   { 'h', 'b', 's', 'c', 'm', 'l', 'r', 'w', 'o', 't', 'x', 'i', '3', 'v', 0 };
	int musthaveparam[] = {  0 ,  0,   1,   1,   1,   0,   0,   1,   0,   1,   1,   1,   1,   1,  0 };

	int nopts;
	int mhp[256];
	int isopt[256];
	char optchar;

	nopts = (int) strlen(optionchar);
	if ( nopts > 50 )
	{
		fprintf(stderr, "\n\nparsecommandline: the option-chars string "
				"seems to be\nVERY long (%d bytes) !\n\n", nopts );
		exit(-1);
	}

	fill_n( isopt, 256, 0 );
	fill_n( mhp, 256, 0 );
	for ( int i = 0; i < nopts; i ++ )
	{
		if ( isopt[static_cast<int>(optionchar[i])] )
		{
			fprintf(stderr, "\n\nparsecommandline: Bug: option character '%c'"
					" is specified twice in the\n"
							"option character array !\n\n", optionchar[i] );
			exit(-1);
		}
		isopt[ static_cast<int>(optionchar[i]) ] = 1;
		mhp[ static_cast<int>(optionchar[i])] = musthaveparam[i];
	}

	++argv; --argc;
	while ( argc > 0 )
	{
		if ( argv[0][0] == '-' )
		{
			optchar = argv[0][1];

			if ( ! isopt[static_cast<int>(optchar)] )
			{
				fprintf(stderr, "\nIs not a valid command line option\n");
				commandlineerror( argv[0], NULL );
			}
			for ( int i = 0; i < mhp[static_cast<int>(optchar)]; i ++ )
				if ( ! argv[1+i] || argv[1+i][0] == '-' )
				{
					fprintf(stderr, "\nCommand line option -%c must "
							"have %d parameter(s)\n",
							argv[0][1], mhp[static_cast<int>(optchar)] );
					commandlineerror( argv[0], NULL );
					argv += 1 + i;
					argc -= 1 + i;
					continue;
				}

			// Dispatch on the option letter: each case applies its effect directly to
			// the relevant static field (RenderPipeline/GLwidget/AudioAnalyzer) or
			// global; see the CLI-contract list in the file-level @brief above for
			// what each flag means.
			switch ( optchar )
			{
				case 'h': commandlineerror( NULL, NULL);  break;
				//case 'b': benchmark = true; break;
				//case 'f': directory = argv[1]; break;
				case 'b': fullscreen = !fullscreen; break;
				case 's': RenderPipeline::setRenderScale( (float) atof( argv[1] ) ); break;
				case 'c': GLwidget::s_startConfig = QString::fromLocal8Bit( argv[1] ); break;
				case 'm': monitorIndex = atoi( argv[1] ); fullscreen = true; break;
				case 'l': logToFile = true; break;
				case 'r': GLwidget::s_autoRecord = true; break;
				// Offline analysis: feed this WAV through the analyzer instead of
				// capturing live audio (deterministic classifier testing).
				case 'w': AudioAnalyzer::s_offlineWav = QString::fromLocal8Bit( argv[1] ); break;
				// Spout output: publish the displayed frame to other apps.
				case 'o': RenderPipeline::s_spoutEnabled = true; break;
				// Embedded web remote (phone control page).
				case 't': GLwidget::s_remotePort = atoi( argv[1] ); break;
				// Batch render: offline WAV + auto-record + auto-quit at the end.
				case 'x':
					AudioAnalyzer::s_offlineWav = QString::fromLocal8Bit( argv[1] );
					GLwidget::s_autoRecord  = true;
					GLwidget::s_batchRender = true;
					break;
				// Spout INPUT: a live sender replaces the photos as source image.
				case 'i':
					RenderPipeline::s_spoutInEnabled = true;
					RenderPipeline::s_spoutInSender  = QString::fromLocal8Bit( argv[1] );
					break;
				// Native VIDEO input: a file, or a directory played in turn.
				// Same slot as -i; Spout wins if both are given.
				case 'v':
					RenderPipeline::s_videoPath = QString::fromLocal8Bit( argv[1] );
					break;
				// Stereoscopic output: sbs (side-by-side), tb (top-bottom),
				// ana (red-cyan anaglyph); anything else = off.
				case '3':
				{
					QString m3 = QString::fromLocal8Bit( argv[1] ).toLower();
					RenderPipeline::s_stereoMode = (m3 == "sbs") ? 1
					                           : (m3 == "tb")  ? 2
					                           : (m3.startsWith("ana")) ? 3 : 0;
					break;
				}


				default: fprintf(stderr, "\nBug in parsecommandline !\n");
						 commandlineerror( argv[0], NULL );
			}

			argv += 1 + mhp[static_cast<int>(optchar)];
			argc -= 1 + mhp[static_cast<int>(optchar)];
		}
		else
		{
			/* command line arg doesn't start with '-' */
			fprintf(stderr, "\nThis is not a valid command line option\n");
			commandlineerror( argv[0], NULL );
			/* or, load file instead .. */
		}
	}
}







/**
 * @brief Application entry point.
 *
 * Sequence: resolve the platform default photo directory, load persisted look
 * settings, parse the command line (which may override those settings and/or exit
 * the process outright, e.g. for `-h` or a bad option), optionally redirect stderr
 * to a rotating log file for kiosk/unattended runs, configure the OpenGL 4.3 core
 * surface format Qt will use for every GL context, then construct and show the main
 * window (windowed or fullscreen) and hand control to Qt's event loop. There is a
 * single application path here; the various CLI flags configure it rather than
 * selecting between alternate modes (see the file-level @brief for the flag list).
 * @param argc Argument count.
 * @param argv Argument vector.
 * @return Qt event-loop exit code (from QApplication::exec()).
 */
int main(int argc, char *argv[])
{

	//Setting default image path for windows
#ifdef WIN32
	char imagePath[1024];
    HRESULT result = SHGetFolderPath(NULL, CSIDL_MYPICTURES, NULL, SHGFP_TYPE_CURRENT, imagePath);
	directory = imagePath;
#endif

	// Restore saved look settings first, so explicit command-line flags (e.g. -s)
	// still take precedence over the persisted values.
	RenderPipeline::loadSettings();

	// Parse command line options; may itself exit() the process (see
	// commandlineerror()/parsecommandline() above) for -h or invalid input.
	parsecommandline( argc, argv );

	// Kiosk logging: send stderr (shader status, device reconnects, errors) to a
	// file so an unattended installation stays diagnosable.  Keep one previous
	// session as kaleidoscope.log.1 so the file can't grow without bound.
	if( logToFile )
	{
		remove( "kaleidoscope.log.1" );
		rename( "kaleidoscope.log", "kaleidoscope.log.1" );
		if( freopen( "kaleidoscope.log", "w", stderr ) )
		{
			time_t t = time( NULL );
			fprintf( stderr, "=== Kaleidoscope log started %s", ctime( &t ) );
			setvbuf( stderr, NULL, _IONBF, 0 );   // unbuffered: nothing lost on a hard kill
		}
	}

	// OpenGL 4.3 CORE profile: the fixed-function remnants are gone, all
	// shaders are GLSL 330 core, and 4.3 unlocks compute shaders for the
	// GPU simulations.
	QSurfaceFormat fmt;
	fmt.setVersion( 4, 3 );
	fmt.setProfile( QSurfaceFormat::CoreProfile );
	fmt.setRenderableType( QSurfaceFormat::OpenGL );
	fmt.setSwapBehavior( QSurfaceFormat::DoubleBuffer );
	fmt.setDepthBufferSize( 24 );
	QSurfaceFormat::setDefaultFormat( fmt );

	// The normal windowed-app path: build the Qt application and its single top-level
	// window, then either show it windowed or on the chosen fullscreen monitor.
	QApplication app(argc, argv);
	app.setOverrideCursor(Qt::BlankCursor);
	// Stack statt new-ohne-delete: so läuft ~QMyWindow/~GLwidget (Recorder-
	// Finalisierung, GL-Cleanup mit aktuellem Kontext) GARANTIERT VOR
	// ~QApplication.  Der frühere Leak ließ die Widgets erst irgendwo im
	// App-Teardown sterben — Nährboden für Exit-Asserts der Debug-Qt
	// ("Must construct a QGuiApplication before a QPixmap" & Co.).
	QMyWindow window( NULL );
	QObject::connect(&window , SIGNAL(signalQuitApp()), &app, SLOT(quit()));
	app.setWindowIcon(QIcon(QString("icon.ico")));   // multi-res: Qt picks the best size per context
	if (!fullscreen)
	{
		window.resize(1920, 1080);
		window.show();
	}
	else
	{
		// Pick the target monitor: -m <index> if valid, else the 2nd screen if
		// present, otherwise the primary.
		const QList<QScreen*> screens = QGuiApplication::screens();
		int idx = monitorIndex;
		if( idx < 0 || idx >= screens.size() )
			idx = (screens.size() > 1) ? 1 : 0;
		QScreen *target = screens.at(idx);
		window.setGeometry( target->geometry() );
		window.setFocus();
	    window.showFullScreen();
	}

	return app.exec();
}
