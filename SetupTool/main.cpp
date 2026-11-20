/*****************************************************************************\
 *                              main
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Entry point for the Kaleidoscope Setup tool (see SetupWindow.h).
 *
 *  @author René Weller
 */

#include <QtCore/QTimer>
#include <QtGui/QPixmap>
#include <QtWidgets/QApplication>
#include "SetupWindow.h"

/**  Creates the QApplication, shows the single SetupWindow and runs the event loop.
 *
 * @param argc  Command-line argument count, passed through to QApplication; `--script-shot <png>` saves the window
 *              as it first appears and quits (a test without clicks: which language it speaks). (in)
 * @param argv  Command-line arguments, passed through to QApplication. (in)
 *
 * @return
 *   The event loop's exit code.
 **/
int main( int argc, char *argv[] )
{
    QApplication      app( argc, argv );
    SetupWindow       win;
    const QStringList args = app.arguments();
    const int         shot = static_cast<int>( args.indexOf( "--script-shot" ) );
    if ( shot > 0 && shot + 1 < args.size() )
    {
        win.setAttribute( Qt::WA_ShowWithoutActivating ); // a test run takes nobody's keyboard
        const QString png = args[shot + 1];
        QTimer::singleShot( 800, &win, [&win, png]()
        {
            win.grab().save( png );
            QApplication::quit();
        } );
    }
    win.show();
    return app.exec();
}
