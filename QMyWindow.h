#ifndef QMYWINDOW_H
#define QMYWINDOW_H

#include <QtWidgets/QWidget>

#include "mainwindow.h"

class QMyWindow: public QMainWindow {
	Q_OBJECT

public:
	QMyWindow(QWidget *parent);
	void setDirectory( QString directory );

public slots:
	void slotQuitApp();

signals:
	void signalQuitApp();

private:
	Ui::MainWindow m_ui;

	QString m_directory;
};

#endif