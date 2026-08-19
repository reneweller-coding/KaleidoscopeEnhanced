/**
 * @file WebRemote.h
 * @brief Embedded HTTP web-remote server: scene browser, force-scene API, snapshot/replay/blackout/favourite/skip controls, and LAN auto-discovery.
 */
// WebRemote.h
// ---------------------------------------------------------------------------
// Tiny embedded HTTP server (CLI -t <port>, on by default at 8080) serving a
// phone-friendly remote control page: switch presets, trigger the next
// effect, and adjust the live parameters (reactivity / trails / mood /
// latency lead) plus the toggles (light show, auto-preset).  GET-only,
// single-page, no dependencies beyond QtNetwork.  Runs on the main thread
// (QTcpServer events on the Qt loop), so it can call straight into GLwidget
// like the keyboard handler does.
//
// Also runs a tiny UDP discovery responder alongside the HTTP server, so the
// companion Android app never needs a typed IP: it broadcasts a magic
// request on the LAN, and every running instance answers with its hostname,
// HTTP port, and active preset — letting the phone auto-connect (or, with
// several instances running, show a picker). If the requested HTTP port is
// already taken (e.g. a second instance on this same PC), the next few ports
// are tried automatically so each instance still ends up reachable.
//
// SECURITY NOTE: this is a LAN convenience remote without authentication —
// it only exposes the same harmless controls as the keyboard, and the
// discovery responder only ever announces host/port/preset name (no photos,
// no file paths, no credentials). Do not port-forward it to the internet.
// ---------------------------------------------------------------------------
#pragma once

#include <QtCore/QObject>

class GLwidget;
class QTcpServer;
class QUdpSocket;

/**
 * @brief Embedded single-page HTTP remote control for the visualizer (scene browser, force-scene, snapshot, replay, blackout, favourite, live parameters).
 *
 * Listens on a TCP port (CLI `-t <port>`) and serves one self-contained HTML/CSS/JS page plus a
 * small set of GET-only JSON/JPEG API endpoints under /api/. All request handling runs on the
 * Qt main thread (QTcpServer's signals fire on the Qt event loop), so it can call straight into
 * GLwidget and RenderPipeline the same way the keyboard shortcut handler does — no cross-thread
 * synchronization is needed. Deliberately unauthenticated: it is meant as a LAN convenience
 * remote only and should not be port-forwarded to the internet.
 */
class WebRemote : public QObject
{
public:
	/**
	 * @brief Creates the QTcpServer, listens on @p port (or the next few free ports if that one's taken), and starts the UDP discovery responder alongside it.
	 * @param widget The GLwidget this remote controls and queries; also used as the QObject parent for lifetime management.
	 * @param port Preferred TCP port to listen on (all interfaces), typically from the CLI -t flag (default 8080).
	 */
	WebRemote( GLwidget *widget, int port );

private:
	/**
	 * @brief Accepts pending TCP connections and wires up one-shot request handling for each.
	 *
	 * For every new connection, reads the request on the first readyRead, parses the request
	 * line, dispatches "/" and the GET /api/ routes by calling into GLwidget / RenderPipeline,
	 * writes a single HTTP/1.1 response, and closes the connection (no keep-alive, no chunked
	 * request bodies).
	 */
	void handleConnection();

	/**
	 * @brief Answers pending LAN discovery broadcasts on m_discoverySocket with this instance's host/port/active-preset.
	 *
	 * Ignores any datagram that isn't exactly the expected magic request (stray traffic on the
	 * discovery port). Replies are sent unicast straight back to the sender's address/port, so
	 * the requester needs no separate listening socket beyond the one it broadcast from.
	 */
	void handleDiscovery();

	/**
	 * @brief Binds m_server to the first free TCP port starting at @p preferred.
	 * @param preferred The requested port; tried first.
	 * @return The port actually bound, or 0 if none of the attempted ports were free.
	 */
	int bindFreePort( int preferred );

	GLwidget   *m_widget          = nullptr;   ///< The visualizer widget this remote controls and queries; not owned.
	QTcpServer *m_server          = nullptr;   ///< The listening TCP server; a child QObject, so it is destroyed automatically with this.
	QUdpSocket *m_discoverySocket = nullptr;   ///< LAN discovery responder; a child QObject, destroyed automatically with this.
	int         m_httpPort        = 0;         ///< The port m_server actually ended up listening on (may differ from the requested one).
};
