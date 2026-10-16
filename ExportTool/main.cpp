/*****************************************************************************\
 *                              main
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Entry point for the Kaleidoscope Video Export tool (see ExportWindow.h).
 *
 *  @author René Weller
 */

#include <QtWidgets/QApplication>
#include "ExportWindow.h"

/**  Creates the QApplication, shows the single ExportWindow and runs the event loop.
 *
 * @param argc  Command-line argument count, passed through to QApplication (no arguments of its own). (in)
 * @param argv  Command-line arguments, passed through to QApplication. (in)
 *
 * @return
 *   The event loop's exit code.
 **/
int main( int argc, char *argv[] )
{
    QApplication      app( argc, argv );
    ExportWindow      win;
    const QStringList args = app.arguments();
    // A scripted test run (ExportWindow::scripted()): --script-audio <file> --script-out <mp4> --script-shots <prefix>
    const int a = static_cast<int>( args.indexOf( "--script-audio" ) ),
              o = static_cast<int>( args.indexOf( "--script-out" ) ),
              sh = static_cast<int>( args.indexOf( "--script-shots" ) );
    if ( a > 0 && o > 0 && sh > 0 && a + 1 < args.size() && o + 1 < args.size() && sh + 1 < args.size() )
    {
        win.setAttribute( Qt::WA_ShowWithoutActivating ); // a test run takes nobody's keyboard
        win.scripted( args[a + 1], args[o + 1], args[sh + 1] );
    }
    win.show();
    return app.exec();
}
