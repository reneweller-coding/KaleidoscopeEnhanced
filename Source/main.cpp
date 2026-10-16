/*****************************************************************************\
 *                              main
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Application entry point: command-line parsing and Qt/GL application bootstrap.
 *
 *  @par CLI contract
 *  All options are parsed by parsecommandline() (single-character flags, some taking
 *  one parameter) before any GL/Qt objects exist, so their effects are just setting
 *  static fields on RenderPipeline / GLwidget / AudioAnalyzer that those classes read
 *  once the app actually starts:
 *   - `-b`            toggle fullscreen at startup (2nd monitor if present).
 *   - `-s <factor>`   internal render scale 0.25..2.0 (lower = faster on weak GPUs).
 *   - `-c <name>`     start with a named configuration (e.g. "darkambient", "normal";
 *                     also used ad hoc as a probe/test configuration name during
 *                     development, e.g. "-c probe" -- there is no separate probe code
 *                     path, it is just a configuration name).
 *   - `-m <index>`    fullscreen on monitor `<index>` (0-based); implies `-b`.
 *   - `-l`            redirect stderr to kaleidoscope.log instead of the console
 *                     (kiosk/unattended logging, with one rotated backup).
 *   - `-r`            start recording (visuals + music -> mp4) immediately.
 *   - `-w <wav>`      offline mode: analyze this WAV file instead of live audio
 *                     (deterministic testing).
 *   - `-o`            enable Spout output: publish the frame as sender "Kaleidoscope".
 *   - `-t <port>`     web remote (phone control page) port; ON BY DEFAULT at 8080 even
 *                     without this flag (LAN-only, unauthenticated by design, and
 *                     auto-discoverable — see WebRemote's UDP responder). `-t 0` disables
 *                     it; `-t <port>` picks a different port. If the chosen port is busy
 *                     (e.g. a second instance on the same PC), WebRemote quietly retries
 *                     the next few ports so multiple instances each still get one.
 *   - `-x <wav>`      batch render: combines `-w` + auto-record + auto-quit, used to
 *                     deterministically render a WAV to an mp4 and exit (no separate
 *                     "batch mode" branch here -- GLwidget itself drives the auto-quit
 *                     once M_BatchRender is set).
 *   - `-i <sender>`   Spout INPUT: use a live Spout sender's video as the source image
 *                     instead of photos ("any" = whichever sender is active).
 *   - `-v <path>`     native VIDEO source image (a file or a folder of videos); `-i`
 *                     wins if both are given.
 *   - `-3 <mode>`     stereoscopic output mode: "sbs", "tb", or an "ana*" prefix for
 *                     anaglyph; anything else disables it.
 *   - `-f <dir>`      photo-source folder for this run, outranking both the ini
 *                     setting and the preset's ImageDirectory attribute.
 *   - `-q`            score-cue self test (CueReceiver.h): decode, accumulate and receive on a real
 *                     socket, print the result and exit with 0 or 1. No window, no audio device.
 *   - `-k <file>`     score cues from a file (CueReceiver.h, ScoreCueFile): a generator's bars,
 *                     sections, drops and key, timed by the `-w`/`-x` WAV -- a batch render follows
 *                     the score instead of guessing it.
 *   - `-e <audio>`    VIDEO EXPORT (VideoExport.h): render the preset (-c) to this audio file (any
 *                     format ffmpeg reads) as an mp4 with the audio muxed in, on a frame clock --
 *                     constant frame rate, as fast as the GPU allows -- then exit (0 done, 1
 *                     cancelled, 2 error). Steered by `-g <WxH>` (size, default 1920x1080), `-p
 *                     <fps>` (default 60), `-d <file>` (output) and `-j <options>` (comma list:
 *                     h264/hevc/av1, blur, nofade, title, cq=N). The window is only a preview.
 *   - `-h`            print the help/usage text and exit.
 *
 *  There is only one runtime path after parsing: the normal windowed Qt application
 *  (QApplication + QMyWindow, shown either windowed or fullscreen). The various flags
 *  above configure that single path (e.g. `-x` makes it record-and-quit) rather than
 *  branching into distinct offline/probe/check modes.
 *
 *  @author René Weller
 */

#include <iostream>
#include <cstring>
#include <cstdlib>
#include <cstdio>
#include <ctime>
#include <chrono>

#include "RenderPipeline.h"
#include "glwidget.h"
#include "EffectShader.h"
#include "CueReceiver.h"
#include "ShaderForgeMain.h"
#include "VideoExport.h"

#include <QtWidgets/QApplication>
#include <QtGui/QIcon>
#include <QtGui/QScreen>
#include <QtGui/QSurfaceFormat>
#include <QtNetwork/QNetworkProxy>
#include <QtCore/QTimer>
#include "QMyWindow.h"

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX ///< windows.h without its min/max macros, which would break std::min and std::max.
#endif
#include <windows.h>
#include <shellapi.h> // CommandLineToArgvW
#pragma comment( lib, "shell32.lib" )
#endif

// NOTE: keep this AFTER any Windows headers.  With C++17 std::byte and a
// `using namespace std;` active, the Windows SDK's unqualified `byte` in
// objidl.h becomes ambiguous (C2872) -- shlobj.h used to be included above for
// the "My Pictures" lookup and made that a live hazard.  Importing std only
// here keeps the guard in place for whatever arrives transitively.
using namespace std;

bool fullscreen = false;  ///< Whether to start the window in fullscreen mode (`-b`, or implied by `-m`).
int  monitorIndex = -1;   ///< `-m <n>`: target monitor for fullscreen (-1 = auto).
bool logToFile = false;   ///< -l: redirect stderr to a rotating log file (kiosk).
bool cueSelfTest = false; ///< -q: run the score-cue self test and exit instead of opening a window.

static char      **g_argvBase = nullptr; ///< argv as main() received it; argText() finds an argument's index with it.
static QStringList g_wargs; ///< The arguments as Unicode text (Windows: from the wide command line); empty elsewhere.

/**  A command-line argument as text, without losing what the ANSI code page cannot hold.
 *
 * @param at  Pointer into argv at the argument. (in)
 *
 * @return
 *   The argument from the wide command line on Windows, where main()'s argv is in the ANSI code page: a file named
 *   in Polish, Greek or Japanese -- which the video export tool passes as it is -- would arrive as question marks.
 *   Elsewhere, and if the wide command line does not line up with argv, the argument in the local 8-bit encoding.
 **/
static QString argText( char **at )
{
    const qsizetype i = at - g_argvBase;
    if ( g_argvBase && i >= 0 && i < g_wargs.size() )
        return g_wargs[i];
    return QString::fromLocal8Bit( *at );
}



/**  Prints command-line usage/help text and exits the process.
 *
 * @param cmd   Offending option string (e.g. "-x"), or NULL when invoked for `-h`. (in)
 * @param parm  First parameter of the offending option, or NULL if not applicable. (in)
 *
 * Reports the offending option/parameter (if any) first, then always prints the full
 * usage text (options and in-app keyboard shortcuts). Exits with status -1 if @p cmd
 * is non-NULL (an actual parse error), or 0 if it was called for `-h` (a clean,
 * user-requested help exit).
 **/
void commandlineerror( char *cmd, char *parm )
{
    if ( cmd )
        fprintf( stderr, "Offending option: %s\n", cmd );
    if ( parm )
        fprintf( stderr, "with first parameter: %s\n", parm );

    fprintf( stderr, "\n\nUsage: Kaleidoscope [options]\n"
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
                     "-k <file>     score cues for the -w/-x WAV: one line per OSC cue,\n"
                     "              tab-separated: seconds, /phos/bar|beat|section|key|drop, args\n"
                     "-e <audio>    video export: render the preset (-c) to this audio file\n"
                     "              (wav/mp3/ogg/flac/...) as an mp4 with the audio, constant\n"
                     "              frame rate, as fast as the GPU allows; then exit\n"
                     "-g <WxH>      export size: 1920x1080 (default), 3840x2160, fullhd, 4k\n"
                     "-p <fps>      export frame rate: 24, 30, 60 (default) or 120\n"
                     "-d <file>     export output (default: <audio name>.mp4 beside the audio)\n"
                     "-j <options>  export options, comma-separated: h264, hevc, av1 (codec;\n"
                     "              default h264 up to FullHD, hevc above), blur (motion blur),\n"
                     "              nofade (no fade in/out), title (title reveal), cq=<n>\n"
                     "-i <sender>   Spout INPUT: the sender's live video (OBS, Resolume, a\n"
                     "              webcam via OBS, ...) replaces the photos as source image\n"
                     "              ('any' = whichever sender is active; photos while none runs)\n"
                     "-v <path>     native VIDEO as source image: a file (looped) or a folder\n"
                     "              of videos played in turn, replacing the photos.  Uses the\n"
                     "              system's own codecs; -i wins if both are given\n"
                     "-3 <mode>     stereoscopic output: sbs (side-by-side, 3D projectors and\n"
                     "              HMD video viewers), tb (top-bottom), ana (red-cyan glasses)\n"
                     "-f <dir>      photo folder for this run (searched recursively).  Normally\n"
                     "              the bundled Images folder; set 'imageDirectory' in\n"
                     "              kaleidoscope_settings.ini to change it permanently\n"
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
                     "\n" );

    if ( cmd )
        exit( -1 ); // problem occured
    else
        exit( 0 ); // was option -h
}


/**  Parses the process's command-line arguments and applies each recognized option's effect immediately (mostly by
 * setting static fields on RenderPipeline / GLwidget / AudioAnalyzer, plus the globals above).
 *
 * @param argc  Argument count, as passed to main(). (in)
 * @param argv  Argument vector, as passed to main() (argv[0] is skipped/ignored). (in)
 *
 * Builds a lookup table (optionchar[] / musthaveparam[]) of the valid single-letter
 * options and whether each needs a parameter, then walks argv applying the table:
 * an unknown option, a missing required parameter, or a non-option argument all call
 * commandlineerror() and exit the process. `-h` always exits via commandlineerror().
 *
 * @sideeffects
 *   Changes AudioAnalyzer::M_OfflineWav, GLwidget::M_AutoRecord, GLwidget::M_BatchRender, GLwidget::M_RemotePort,
 *   GLwidget::M_RemotePortFromCli, GLwidget::M_StartConfig, RenderPipeline::M_ImageDirCli,
 *   RenderPipeline::M_RenderScaleFromCli, RenderPipeline::M_SpoutEnabled, RenderPipeline::M_SpoutInEnabled,
 *   RenderPipeline::M_SpoutInSender, RenderPipeline::M_StereoMode, RenderPipeline::M_VideoPath.
 **/
void parsecommandline( int argc, char *argv[] )
{
    /* valid option characters; last char MUST be 0 ! */
    // A switch must be listed HERE as well as handled in the switch below —
    // the table is what makes it valid at all, and a case with no entry here is
    // rejected before it is ever reached.
    char optionchar[] = { 'h', 'b', 's', 'c', 'm', 'l', 'r', 'w', 'o', 't', 'x', 'i', '3', 'v', 'f', 'q', 'k',
                          'e', 'g', 'p', 'd', 'j', 0 };
    int  musthaveparam[] = { 0, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0 };

    int  nopts;
    int  mhp[256];
    int  isopt[256];
    char optchar;

    nopts = static_cast<int>( strlen( optionchar ) );
    if ( nopts > 50 )
    {
        fprintf( stderr, "\n\nparsecommandline: the option-chars string "
                         "seems to be\nVERY long (%d bytes) !\n\n",
                 nopts );
        exit( -1 );
    }

    fill_n( isopt, 256, 0 );
    fill_n( mhp, 256, 0 );
    for ( int i = 0; i < nopts; ++i )
    {
        if ( isopt[static_cast<int>( optionchar[i] )] )
        {
            fprintf( stderr, "\n\nparsecommandline: Bug: option character '%c'"
                             " is specified twice in the\n"
                             "option character array !\n\n",
                     optionchar[i] );
            exit( -1 );
        }
        isopt[static_cast<int>( optionchar[i] )] = 1;
        mhp[static_cast<int>( optionchar[i] )] = musthaveparam[i];
    }

    ++argv;
    --argc;
    while ( argc > 0 )
    {
        if ( argv[0][0] == '-' )
        {
            optchar = argv[0][1];

            if ( !isopt[static_cast<int>( optchar )] )
            {
                fprintf( stderr, "\nIs not a valid command line option\n" );
                commandlineerror( argv[0], NULL );
            }
            for ( int i = 0; i < mhp[static_cast<int>( optchar )]; ++i )
                if ( !argv[1 + i] || argv[1 + i][0] == '-' )
                {
                    fprintf( stderr, "\nCommand line option -%c must "
                                     "have %d parameter(s)\n",
                             argv[0][1], mhp[static_cast<int>( optchar )] );
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
                case 'h': commandlineerror( NULL, NULL ); break;
                // case 'b': benchmark = true; break;
                // Photo source for this run only; outranks both the ini
                // setting and the preset's own ImageDirectory attribute.
                case 'f':
                    RenderPipeline::M_ImageDirCli =
                        argText( argv + 1 );
                    break;
                case 'b': fullscreen = !fullscreen; break;
                case 's':
                    RenderPipeline::setRenderScale( static_cast<float>( atof( argv[1] ) ) );
                    RenderPipeline::M_RenderScaleFromCli = true;
                    break;
                case 'c': GLwidget::M_StartConfig = argText( argv + 1 ); break;
                case 'm':
                    monitorIndex = atoi( argv[1] );
                    fullscreen = true;
                    break;
                case 'l': logToFile = true; break;
                // Score-cue self test: no window, no audio, an exit code (CueReceiver.h).
                case 'q': cueSelfTest = true; break;
                case 'r': GLwidget::M_AutoRecord = true; break;
                // Score cues from a file, timed by the offline WAV (-w / -x).
                case 'k':
                    if ( ScoreCueFile::instance().load( argText( argv + 1 ) ) < 0 )
                        exit( -1 );
                    break;
                // Offline analysis: feed this WAV through the analyzer instead of
                // capturing live audio (deterministic classifier testing).
                case 'w':
                    AudioAnalyzer::M_OfflineWav = argText( argv + 1 );
                    // KALEIDO_OFFLINE_FAST drops the real-time pacing, which only makes
                    // sense for a measurement run -- nobody watches a WAV played at
                    // 100x. So it also means "quit when the file ends", which lets a
                    // sweep over dozens of tracks time itself instead of guessing a
                    // timeout per track. Unlike -x this does NOT start a recording.
                    if ( qEnvironmentVariableIsSet( "KALEIDO_OFFLINE_FAST" ) )
                        GLwidget::M_BatchRender = true;
                    break;
                // Spout output: publish the displayed frame to other apps.
                case 'o': RenderPipeline::M_SpoutEnabled = true; break;
                // Embedded web remote (phone control page).
                case 't':
                    GLwidget::M_RemotePort = atoi( argv[1] );
                    GLwidget::M_RemotePortFromCli = true;
                    break;
                // Batch render: offline WAV + auto-record + auto-quit at the end.
                case 'x':
                    AudioAnalyzer::M_OfflineWav = argText( argv + 1 );
                    GLwidget::M_AutoRecord = true;
                    GLwidget::M_BatchRender = true;
                    break;
                // Video export (VideoExport.h): the audio file, and its size, rate,
                // output and options.  The export itself is set up after parsing.
                case 'e': VideoExport::M_Settings.audio = argText( argv + 1 ); break;
                case 'g':
                    if ( !VideoExport::parseSize( argText( argv + 1 ) ) )
                    {
                        fprintf( stderr, "\n-g wants an even size like 1920x1080 or 3840x2160\n" );
                        commandlineerror( argv[0], argv[1] );
                    }
                    break;
                case 'p': VideoExport::M_Settings.fps = atoi( argv[1] ); break;
                case 'd': VideoExport::M_Settings.output = argText( argv + 1 ); break;
                case 'j':
                    if ( !VideoExport::parseOptions( argText( argv + 1 ) ) )
                        commandlineerror( argv[0], argv[1] );
                    break;
                // Spout INPUT: a live sender replaces the photos as source image.
                case 'i':
                    RenderPipeline::M_SpoutInEnabled = true;
                    RenderPipeline::M_SpoutInSender = argText( argv + 1 );
                    break;
                // Native VIDEO input: a file, or a directory played in turn.
                // Same slot as -i; Spout wins if both are given.
                case 'v':
                    RenderPipeline::M_VideoPath = argText( argv + 1 );
                    break;
                // Stereoscopic output: sbs (side-by-side), tb (top-bottom),
                // ana (red-cyan anaglyph); anything else = off.
                case '3':
                {
                    QString m3 = argText( argv + 1 ).toLower();
                    RenderPipeline::M_StereoMode = ( m3 == "sbs" )              ? 1
                                                   : ( m3 == "tb" )             ? 2
                                                   : ( m3.startsWith( "ana" ) ) ? 3
                                                                                : 0;
                    break;
                }


                default:
                    fprintf( stderr, "\nBug in parsecommandline !\n" );
                    commandlineerror( argv[0], NULL );
            }

            argv += 1 + mhp[static_cast<int>( optchar )];
            argc -= 1 + mhp[static_cast<int>( optchar )];
        }
        else
        {
            /* command line arg doesn't start with '-' */
            fprintf( stderr, "\nThis is not a valid command line option\n" );
            commandlineerror( argv[0], NULL );
            /* or, load file instead .. */
        }
    }
}




/**  Application entry point.
 *
 * @param argc  Argument count. (in)
 * @param argv  Argument vector. (in)
 *
 * @return
 *   Qt event-loop exit code (from QApplication::exec()).
 *
 * for the flag list).
 *
 * Sequence: load persisted look
 * settings, parse the command line (which may override those settings and/or exit
 * the process outright, e.g. for `-h` or a bad option), optionally redirect stderr
 * to a rotating log file for kiosk/unattended runs, configure the OpenGL 4.3 core
 * surface format Qt will use for every GL context, then construct and show the main
 * window (windowed or fullscreen) and hand control to Qt's event loop. There is a
 * single application path here; the various CLI flags configure it rather than
 * selecting between alternate modes (see the file-level
 *
 * @sideeffects
 *   Changes EffectShader::M_ChainRunner.
 **/
int main( int argc, char *argv[] )
{
    // A ShaderForge helper run (this executable started by itself, ShaderForge.h): build one program and end.
    if ( shaderForgeIsCommand( argc, argv ) )
        return shaderForgeMain( argc, argv );

    // Seed the C-runtime RNG for THIS (main/render) thread. rand() was never
    // seeded anywhere in this codebase, so it always started from the C
    // runtime's fixed default state -- every launch replayed the exact same
    // "random" sequence of scene/transition/mood-accept picks. Across
    // repeated sessions this reads as "only a subset of the preset ever gets
    // used", since the reachable variety was bounded by how long a single
    // sitting ran, not by the preset's actual size.
    // NOTE: MSVC's rand()/srand() keep PER-THREAD state (verified
    // empirically), so this does NOT seed rand() on other threads --
    // AudioAnalyzer's capture thread seeds itself separately in ::run().
    // KALEIDO_SEED pins the randomness to a fixed value.  Without it a
    // before/after comparison of two runs is worthless: the scenes roll their
    // parameters and seeds anew per run, and unchanged control scenes varied
    // by a factor of two in the measurement -- more than the effect that was
    // to be shown.  Meant for measurement runs only; not set in normal use,
    // which therefore stays seeded from the clock.
    {
        const char *seed_env = getenv( "KALEIDO_SEED" );
        srand( seed_env ? static_cast<unsigned>( strtoul( seed_env, nullptr, 10 ) )
                        : static_cast<unsigned>( std::chrono::high_resolution_clock::now()
                                                     .time_since_epoch()
                                                     .count() ) );
    }

    // The photo source used to be resolved here, from the Windows "My Pictures"
    // folder into a global -- which NOTHING ever read: RenderPipeline takes its
    // directory from the preset's ImageDirectory attribute, and the -f flag that
    // would have overridden the global was commented out. So the lookup ran on
    // every start and its result was discarded. The three real layers now live
    // together in RenderPipeline::init() (CLI -f > ini > preset), with the
    // preset default pointing at the bundled Images folder. Someone's Pictures
    // folder is no longer a sensible guess for a visualizer's source material
    // anyway -- it is full of holiday snaps and screenshots.
    //
    // Restore saved look settings first, so explicit command-line flags (e.g. -s)
    // still take precedence over the persisted values.
    RenderPipeline::loadSettings();

    // The arguments as Unicode (see argText()), then the options; parsing may itself
    // exit() the process (see commandlineerror()/parsecommandline() above) for -h
    // or invalid input.
    g_argvBase = argv;
#ifdef _WIN32
    {
        int     wn = 0;
        LPWSTR *wv = CommandLineToArgvW( GetCommandLineW(), &wn );
        if ( wv && wn == argc )
            for ( int i = 0; i < wn; ++i )
                g_wargs << QString::fromWCharArray( wv[i] );
        LocalFree( wv );
    }
#endif
    parsecommandline( argc, argv );
    // What the session starts with, command line included: an exit writes back only what changed after this.
    RenderPipeline::rememberSettings();

    // A video export renders the file it was given and nothing else: no live
    // capture or WAV replay, no recording, no web remote, no Spout, a window
    // rather than fullscreen.
    if ( VideoExport::requested() )
    {
        AudioAnalyzer::M_OfflineWav.clear();
        GLwidget::M_AutoRecord = false;
        GLwidget::M_BatchRender = false;
        GLwidget::M_RemotePort = 0;
        GLwidget::M_RemotePortFromCli = true;
        RenderPipeline::M_SpoutEnabled = false;
        RenderPipeline::M_SpoutInEnabled = false;
        RenderPipeline::M_VideoPath.clear();
        fullscreen = false;
    }

    // Kiosk logging: send stderr (shader status, device reconnects, errors) to a
    // file so an unattended installation stays diagnosable.  Keep one previous
    // session as kaleidoscope.log.1 so the file can't grow without bound.
    if ( logToFile )
    {
        remove( "kaleidoscope.log.1" );
        rename( "kaleidoscope.log", "kaleidoscope.log.1" );
        if ( freopen( "kaleidoscope.log", "w", stderr ) )
        {
            time_t t = time( NULL );
            fprintf( stderr, "=== Kaleidoscope log started %s", ctime( &t ) );
            setvbuf( stderr, NULL, _IONBF, 0 ); // unbuffered: nothing lost on a hard kill
        }
    }

    // OpenGL 4.3 CORE profile: the fixed-function remnants are gone, all
    // shaders are GLSL 330 core, and 4.3 unlocks compute shaders for the
    // GPU simulations.
    QSurfaceFormat fmt;
    fmt.setVersion( 4, 3 );
#ifdef __APPLE__
    // macOS froze OpenGL at 4.1 core and deprecated it there. Asking for 4.3
    // yields no context at all, so the program would not start; 4.1 does.
    // The cost is the compute-shader effects -- glcore reports the missing
    // entry points and the engine takes its documented fragment fallbacks,
    // the same route as any GPU without compute. Everything else runs.
    fmt.setVersion( 4, 1 );
#endif
    fmt.setProfile( QSurfaceFormat::CoreProfile );
    fmt.setRenderableType( QSurfaceFormat::OpenGL );
    fmt.setSwapBehavior( QSurfaceFormat::DoubleBuffer );
    fmt.setDepthBufferSize( 24 );
    // KALEIDO_NO_VSYNC=1: measure without the panel's frame cap (see KALEIDO_GPU_TIMING).
    // A video export never waits for the panel: its window is only a preview.
    if ( qEnvironmentVariableIsSet( "KALEIDO_NO_VSYNC" ) || VideoExport::requested() )
        fmt.setSwapInterval( 0 );
    QSurfaceFormat::setDefaultFormat( fmt );
    EffectShader::M_ChainRunner = true; // chain labs as passes (Engine/ChainPass); the editor keeps the uber-shaders

    // The normal windowed-app path: build the Qt application and its single top-level
    // window, then either show it windowed or on the chosen fullscreen monitor.
    QApplication app( argc, argv );
    // Without this, on the VERY FIRST network request (the lyrics/artist-image
    // fetch in TrackMedia, triggered synchronously from paintGL() on every
    // track change) Qt on Windows asks for a system proxy SYNCHRONOUSLY on the
    // calling thread via WinHttpGetProxyForUrl (WPAD auto-detection) - that
    // can block for several seconds and thus freezes the GUI/render thread
    // (reproduced as a hang 4-9s after start, a CPU-time plateau, the window
    // no longer responding).  The app needs no system proxy.
    QNetworkProxy::setApplicationProxy( QNetworkProxy::NoProxy );

    // -q: the score-cue self test.  It needs the Qt event loop (it binds a real socket and feeds it
    // real datagrams) but nothing else -- no window, no GL context, no audio device -- so it runs
    // here, after QApplication exists and before anything is shown, and ends the process with its
    // own exit code.  That is what makes it usable from CI beside the other static checks.
    if ( cueSelfTest )
        return runCueSelfTest();

    // A dead man's switch for batch runs.  A catalogue render or a screening
    // pass is started by a script that is supposed to stop it again -- but if
    // that script is killed (a tool run hitting its time limit, a cancelled
    // job, a crash), the window it started keeps rendering FOR EVER: it holds
    // a GPU at full tilt and gigabytes of video memory on a machine somebody
    // else is trying to work on, and nothing is left that knows to stop it.
    // KALEIDO_MAX_RUNTIME_SECS makes the process responsible for its own end.
    // Set it comfortably above the intended run length: it should only ever
    // fire when whoever started this run is already gone.
    {
        const int max_secs = qEnvironmentVariableIntValue( "KALEIDO_MAX_RUNTIME_SECS" );
        if ( max_secs > 0 )
        {
            fprintf( stderr, "[watchdog] this run ends itself after %d s\n", max_secs );
            QTimer::singleShot( max_secs * 1000, &app, &QCoreApplication::quit );
        }
    }
    if ( !VideoExport::requested() )
        app.setOverrideCursor( Qt::BlankCursor );
    // Stack instead of new-without-delete: this way ~QMyWindow/~GLwidget
    // (recorder finalisation, GL cleanup with a current context) runs
    // GUARANTEED BEFORE ~QApplication.  The former leak let the widgets die
    // somewhere in the app teardown — a breeding ground for the debug Qt's
    // exit asserts ("Must construct a QGuiApplication before a QPixmap" & co.).
    QMyWindow window( NULL );
    QObject::connect( &window, SIGNAL( signalQuitApp() ), &app, SLOT( quit() ) );
    app.setWindowIcon( QIcon( QString( "icon.ico" ) ) ); // multi-res: Qt picks the best size per context
    if ( VideoExport::requested() )
    {
        // The export's preview: a small window that does not take the focus from
        // whatever the user is doing while it renders.
        window.setWindowTitle( QStringLiteral( "Kaleidoscope - Video-Export" ) );
        window.resize( 960, 540 );
        window.setAttribute( Qt::WA_ShowWithoutActivating );
        window.show();
    }
    else if ( !fullscreen )
    {
        window.resize( 1920, 1080 );
        // A batch run must not steal the machine from the person using it.
        // KALEIDO_NO_ACTIVATE shows the window without taking the keyboard
        // focus and puts it at the BOTTOM of the window stack, so a catalogue
        // pass no longer pops a 1920x1080 window over somebody's work once per
        // scene.  It still renders and still records: the frames come from the
        // framebuffer, not from what is on screen.
        if ( qEnvironmentVariableIsSet( "KALEIDO_NO_ACTIVATE" ) )
        {
            window.setAttribute( Qt::WA_ShowWithoutActivating );
            window.setWindowFlag( Qt::WindowDoesNotAcceptFocus, true );
            window.show();
            window.lower();
        }
        else
            window.show();
    }
    else
    {
        // Pick the target monitor: -m <index> if valid, else the 2nd screen if
        // present, otherwise the primary.
        const QList<QScreen *> screens = QGuiApplication::screens();
        int                    idx = monitorIndex;
        if ( idx < 0 || idx >= screens.size() )
            idx = ( screens.size() > 1 ) ? 1 : 0;
        QScreen *target = screens.at( idx );
        window.setGeometry( target->geometry() );
        window.setFocus();
        window.showFullScreen();
    }

    return app.exec();
}
