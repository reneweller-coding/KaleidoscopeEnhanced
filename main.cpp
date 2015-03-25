#include <iostream>
using namespace std;

#include <QtGui/QApplication>
#include <QtGui/QIcon>

#include "QMyWindow.h"

#ifdef WIN32
#include <shlobj.h>
#endif

QString directory = "C:\\Users\\rene\\Pictures";
bool fullscreen = true;



//rwrwtodo: Correct the options-list
void commandlineerror( char *cmd, char *parm )
{
	if ( cmd )
		fprintf(stderr, "Offending option: %s\n", cmd );
	if ( parm )
		fprintf(stderr, "with first parameter: %s\n", parm );

	fprintf(stderr, "\n\nUsage: interactive options ...\n"
	"Options:\n"
	"-g obj      geometry type (default = planes)\n"
	"              obj = pl, sh, to, bx\n"
	"              if obj='file', then the object loaded with option -f is used\n"
	"-x compl    Complexity (#pgons ~ compl^2)\n"
	"-f file     load file and use the node with name 'benchobj'\n"
	"-a algo     algorithm to use for coll. det. (default algo = do)\n"
	"              do = doptree,\n"
	"              bx = boxtree,\n"
	"              cx = separating planes.\n"
	"-e          do not do exact polygon intersection test (if -a = do|bx)\n"
	"-p          find/print intersecting pairs\n"
    "-A          show intersecting polygons\n"
	"-d          show intersecting DOPs or polygons (depending on -e or not)\n"
	"-D level    show DOP tree at level (can be switched on at run-time with key [/])\n"
	"-v opt      Verbose\n"
	"              t = print DOP tree / Boxtree\n"
	"              l = show line between the closest vertices, if Algo = sep. planes\n"
	"              s = print Boxtree statistics\n"
	"              d = print Boxtree in DOT format (for graphviz) to bx_compl_obj.dot\n"
	"-W          white background (default = black)\n"
	"-B          show unit box around origin\n"
	"-h          this help menu\n"
	"Keys:\n"
	"l           switch lighting mode\n"
	"p           switch drawing mode (filled/wireframe/point)\n"
	"<space>     switch motion mode (object / camera)\n"
	"e           switch exact polygon intersection test on/off\n"
	"[/]         decrease/increase level of DOPs for which the geometry is rendered\n"
	"q           quit\n"
	"\n");

	if ( cmd )
		exit(-1);				// problem occured
	else
		exit(0);				// was option -h
}


void parsecommandline( int argc, char *argv[] )
{
	/* valid option characters; last char MUST be 0 ! */
	char optionchar[] =   { 'h', 'b', 'f', 0 };
	int musthaveparam[] = {  0 ,  0,   1, 0 };

	int nopts;
	int mhp[256];
	int isopt[256];
	char optchar;

	nopts = strlen(optionchar);
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

	// parse command line options
	parsecommandline( argc, argv );

	QApplication app(argc, argv);
	app.setOverrideCursor(Qt::BlankCursor);
	QMyWindow *window = new QMyWindow( NULL );
	QObject::connect(window , SIGNAL(signalQuitApp()), &app, SLOT(quit()));
	app.setWindowIcon(QIcon(QString("icon.png")));
	if(!fullscreen)
		window->show();
	else
	{
		window->setFocus();
	    window->showFullScreen();
	}

	return app.exec();
}
