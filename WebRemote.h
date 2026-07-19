// WebRemote.h
// ---------------------------------------------------------------------------
// Tiny embedded HTTP server (CLI -t <port>) serving a phone-friendly remote
// control page: switch presets, trigger the next effect, and adjust the live
// parameters (reactivity / trails / mood / latency lead) plus the toggles
// (light show, auto-preset).  GET-only, single-page, no dependencies beyond
// QtNetwork.  Runs on the main thread (QTcpServer events on the Qt loop), so
// it can call straight into GLwidget like the keyboard handler does.
//
// SECURITY NOTE: this is a LAN convenience remote without authentication —
// it only exposes the same harmless controls as the keyboard.  Do not port-
// forward it to the internet.
// ---------------------------------------------------------------------------
#pragma once

#include <QtCore/QObject>

class GLwidget;
class QTcpServer;

class WebRemote : public QObject
{
public:
	WebRemote( GLwidget *widget, int port );

private:
	void handleConnection();

	GLwidget   *m_widget = nullptr;
	QTcpServer *m_server = nullptr;
};
