#include <QtWidgets/QFileDialog>

#include "QMyWindow.h"

QMyWindow::QMyWindow(QWidget *parent ): QMainWindow(parent) 
{
	m_ui.setupUi( this );

	// Override the title from the .ui (was "MainWindow").
	setWindowTitle( QStringLiteral("Kaleidoscope-Visualizer") );

	connect( m_ui.actionExit, SIGNAL(triggered()), SLOT(slotQuitApp()));
}  


void QMyWindow::slotQuitApp() 
{ 
	emit signalQuitApp(); 
}

void QMyWindow::setDirectory( QString directory )
{
	m_directory = directory;
}


