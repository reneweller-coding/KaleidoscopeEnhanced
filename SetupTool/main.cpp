/**
 * @file main.cpp
 * @brief Entry point for the Kaleidoscope Setup tool (see SetupWindow.h).
 */
#include <QtWidgets/QApplication>
#include "SetupWindow.h"

/**
 * @brief Creates the QApplication, shows the single SetupWindow and runs the event loop.
 * @param argc Command-line argument count, passed through to QApplication (no arguments of its own).
 * @param argv Command-line arguments, passed through to QApplication.
 * @return The event loop's exit code.
 */
int main( int argc, char *argv[] )
{
	QApplication app( argc, argv );
	SetupWindow win;
	win.show();
	return app.exec();
}
