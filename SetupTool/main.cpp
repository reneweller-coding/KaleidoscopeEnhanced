/**
 * @file main.cpp
 * @brief Entry point for the Kaleidoscope Setup tool (see SetupWindow.h).
 */
#include <QtWidgets/QApplication>
#include "SetupWindow.h"

int main( int argc, char *argv[] )
{
	QApplication app( argc, argv );
	SetupWindow win;
	win.show();
	return app.exec();
}
