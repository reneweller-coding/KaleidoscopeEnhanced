#include <iostream>
#include <cstring>
#include <cstdlib>
#include <cstdio>
#include <ctime>

#include "filterShader.h"
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

QString directory = "C:\\Users\\rene\\Pictures";
bool fullscreen = false;
int  monitorIndex = -1;   // -m <n>: target monitor for fullscreen (-1 = auto)
bool logToFile = false;   // -l: redirect stderr to a rotating log file (kiosk)



//rwrwtodo: Correct the options-list
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
	"-h            this help menu\n"
	"Keys (while running):\n"
	"0             toggle the configuration-select menu\n"
	"1-9           switch configuration\n"
	"i             toggle the live audio-feature overlay (incl. FPS)\n"
	"n             advance to the next effect\n"
	"[ ]           reactivity  - less / more audio-driven motion\n"
	", .           trails      - shorter / longer feedback trails\n"
	"- =           mood        - weaker / stronger colour grading\n"
	"k             save current look settings as the startup default\n"
	"s             save a PNG screenshot\n"
	"Esc / q       quit\n"
	"\n");

	if ( cmd )
		exit(-1);				// problem occured
	else
		exit(0);				// was option -h
}


void parsecommandline( int argc, char *argv[] )
{
	/* valid option characters; last char MUST be 0 ! */
	char optionchar[] =   { 'h', 'b', 'f', 's', 'c', 'm', 'l', 'r', 'w', 0 };
	int musthaveparam[] = {  0 ,  0,   1,   1,   1,   1,   0,   0,   1,  0 };

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

			switch ( optchar )
			{
				case 'h': commandlineerror( NULL, NULL);  break;
				//case 'b': benchmark = true; break;
				//case 'f': directory = argv[1]; break;
				case 'b': fullscreen = !fullscreen; break;
				case 's': FilterShader::setRenderScale( (float) atof( argv[1] ) ); break;
				case 'c': GLwidget::s_startConfig = QString::fromLocal8Bit( argv[1] ); break;
				case 'm': monitorIndex = atoi( argv[1] ); fullscreen = true; break;
				case 'l': logToFile = true; break;
				case 'r': GLwidget::s_autoRecord = true; break;
				// Offline analysis: feed this WAV through the analyzer instead of
				// capturing live audio (deterministic classifier testing).
				case 'w': AudioAnalyzer::s_offlineWav = QString::fromLocal8Bit( argv[1] ); break;


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
	FilterShader::loadSettings();

	// parse command line options
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

	// Request a compatibility-profile OpenGL context so the existing
	// fixed-function pipeline and GLSL 1.20 shaders keep working under Qt6.
	// (Phase B switches this to a core profile.)
	QSurfaceFormat fmt;
	fmt.setProfile( QSurfaceFormat::CompatibilityProfile );
	fmt.setRenderableType( QSurfaceFormat::OpenGL );
	fmt.setSwapBehavior( QSurfaceFormat::DoubleBuffer );
	fmt.setDepthBufferSize( 24 );
	QSurfaceFormat::setDefaultFormat( fmt );

	QApplication app(argc, argv);
	app.setOverrideCursor(Qt::BlankCursor);
	QMyWindow *window = new QMyWindow( NULL );
	QObject::connect(window , SIGNAL(signalQuitApp()), &app, SLOT(quit()));
	app.setWindowIcon(QIcon(QString("icon.png")));
	if (!fullscreen)
	{
		window->resize(1920, 1080);
		window->show();
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
		window->setGeometry( target->geometry() );
		window->setFocus();
	    window->showFullScreen();
	}

	return app.exec();
}
