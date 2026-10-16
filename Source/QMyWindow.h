//---------------------------------------------------------------------------
//                              QMyWindow
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  Declares QMyWindow, the top-level QMainWindow that hosts the GLwidget via the generated mainwindow.ui layout.
 *
 *  @author René Weller
 */

#ifndef QMYWINDOW_H
#define QMYWINDOW_H

#include <QtWidgets/QWidget>

#include "mainwindow.h"

/** @class QMyWindow
 *
 * Top-level application window that hosts GLwidget.
 *
 * QMyWindow wraps the Qt Designer layout generated into mainwindow.h
 * (Ui::MainWindow, which embeds a GLwidget as its central widget). It sets the
 * window title, wires the "Exit" menu action to a quit slot, and forwards the
 * request to the rest of the application via signalQuitApp(). It also stores a
 * working directory, set from outside via setDirectory().
 **/
class QMyWindow : public QMainWindow
{
    Q_OBJECT

public:
    /**  Constructs the window: builds the UI from Ui::MainWindow, sets the window title, and connects the Exit action
     * to slotQuitApp().
     *
     * @param parent  Parent widget, forwarded to QMainWindow. (in)
     **/
    explicit QMyWindow( QWidget *parent );
    /**  Stores the working directory for later use.
     *
     * @param directory  Directory path to remember. (in)
     **/
    void setDirectory( QString directory );

public slots:
    /** Slot bound to the "Exit" menu action; emits signalQuitApp(). */
    void slotQuitApp();

signals:
    /** Emitted when the user requests to quit the application (via the Exit menu action). */
    void signalQuitApp();

private:
    Ui::MainWindow m_ui; ///< Generated Designer UI (holds the central GLwidget and menu actions).

    QString m_directory; ///< Working directory set via setDirectory().
private:
    /** Not copyable (CGVR template: copy constructor and assignment are always declared). */
    QMyWindow( const QMyWindow & ) = delete;
    /**  Not assignable; see the copy constructor.
     *
     * @return
     *   Nothing: the operator is deleted, so no call compiles.
     **/
    QMyWindow &operator=( const QMyWindow & ) = delete;
};

#endif
