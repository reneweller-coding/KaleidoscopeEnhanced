/**
 * @file WebRemote.h
 * @brief Embedded HTTP web-remote server: scene browser, force-scene API, snapshot/replay/blackout/favourite/skip controls.
 */
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

/**
 * @brief Embedded single-page HTTP remote control for the visualizer (scene browser, force-scene, snapshot, replay, blackout, favourite, live parameters).
 *
 * Listens on a TCP port (CLI `-t <port>`) and serves one self-contained HTML/CSS/JS page plus a
 * small set of GET-only JSON/JPEG API endpoints under /api/. All request handling runs on the
 * Qt main thread (QTcpServer's signals fire on the Qt event loop), so it can call straight into
 * GLwidget and FilterShader the same way the keyboard shortcut handler does — no cross-thread
 * synchronization is needed. Deliberately unauthenticated: it is meant as a LAN convenience
 * remote only and should not be port-forwarded to the internet.
 */
class WebRemote : public QObject
{
public:
	/**
	 * @brief Creates the QTcpServer and starts listening on the given port, logging the outcome to stderr.
	 * @param widget The GLwidget this remote controls and queries; also used as the QObject parent for lifetime management.
	 * @param port TCP port to listen on (all interfaces), typically from the CLI -t flag.
	 */
	WebRemote( GLwidget *widget, int port );

private:
	/**
	 * @brief Accepts pending TCP connections and wires up one-shot request handling for each.
	 *
	 * For every new connection, reads the request on the first readyRead, parses the request
	 * line, dispatches "/" and the GET /api/ routes by calling into GLwidget / FilterShader,
	 * writes a single HTTP/1.1 response, and closes the connection (no keep-alive, no chunked
	 * request bodies).
	 */
	void handleConnection();

	GLwidget   *m_widget = nullptr;   ///< The visualizer widget this remote controls and queries; not owned.
	QTcpServer *m_server = nullptr;   ///< The listening TCP server; a child QObject, so it is destroyed automatically with this.
};
