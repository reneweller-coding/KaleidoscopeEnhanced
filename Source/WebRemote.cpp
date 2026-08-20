/**
 * @file WebRemote.cpp
 * @brief Implementation of WebRemote: the embedded phone-remote HTML/JS page and its GET-only JSON/JPEG /api/ endpoints.
 */
// WebRemote.cpp — see WebRemote.h.
#include "WebRemote.h"
#include "glwidget.h"
#include "RenderPipeline.h"
#include "Strings.h"

#include <QtNetwork/QTcpServer>
#include <QtNetwork/QTcpSocket>
#include <QtNetwork/QUdpSocket>
#include <QtNetwork/QHostAddress>
#include <QtCore/QUrl>
#include <QtCore/QUrlQuery>
#include <QtCore/QSysInfo>
#include <QtCore/QCoreApplication>

/// LAN discovery: fixed UDP port + magic request string the Android app
/// broadcasts. Bound with ShareAddress so several Kaleidoscope instances on
/// the SAME PC can all listen here and each answer for itself (Windows
/// delivers a copy of every broadcast datagram to every bound socket).
static const quint16 kDiscoveryPort  = 45677;
static const char   *kDiscoveryMagic = "KALEIDO_DISCOVER_V1";

/// Escapes a string for embedding inside a JSON double-quoted string literal
/// (backslash, quote, and control characters). Every JSON string this file
/// builds carries user-authored text at some remove (a preset's
/// ConfigurationName, a scene's bare filename) via plain QString::arg()
/// interpolation with no escaping of its own -- a name containing a `"`
/// would otherwise break the whole response for every client (fetch()'s
/// .json() throws, the Android app's JSONObject parse throws).
static QString jsonEscape( const QString &s )
{
	QString out;
	out.reserve( s.size() + 8 );
	for( QChar c : s )
	{
		switch( c.unicode() )
		{
			case '"':  out += "\\\""; break;
			case '\\': out += "\\\\"; break;
			case '\n': out += "\\n";  break;
			case '\r': out += "\\r";  break;
			case '\t': out += "\\t";  break;
			default:
				if( c.unicode() < 0x20 )
					out += QString( "\\u%1" ).arg( int(c.unicode()), 4, 16, QChar('0') );
				else
					out += c;
		}
	}
	return out;
}

/**
 * @brief The single-page HTML/CSS/JS remote-control UI template served for GET "/".
 *
 * The phone page: dark, thumb-sized controls, fetch()-driven, self-refreshing. Polls
 * /api/state and /api/snapshot every 2s and posts user actions to the other /api/ endpoints
 * implemented in handleConnection(). Entirely self-contained (inline CSS/JS, no external
 * assets), so the server never has to serve anything besides this string and the JSON/JPEG
 * API responses.
 *
 * Every user-visible label is a @@TOKEN@@ placeholder, filled in by buildPage() from
 * Strings::T() in the CURRENT language -- see buildPage() below. Keeping the template as one
 * readable raw string (rather than building the HTML via C++ string concatenation) means the
 * markup/CSS/JS structure stays exactly as easy to read and edit as before.
 */
static const char *kPageTemplate = R"HTML(<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>@@TITLE@@</title>
<style>
 body{background:#101018;color:#eee;font-family:sans-serif;margin:0;padding:12px}
 h1{font-size:1.1em;color:#8cf;margin:4px 0 12px}
 .row{margin:10px 0}
 button{background:#26263a;color:#eee;border:1px solid #446;border-radius:10px;
        padding:12px 16px;font-size:1em;margin:3px}
 button.active{background:#3a6ea5;border-color:#8cf}
 button.big{width:100%;padding:16px;font-size:1.15em}
 input[type=range]{width:100%}
 label{display:block;color:#9ab;font-size:.85em;margin-top:8px}
 .val{color:#8cf;float:right}
</style></head><body>
<h1>@@H1@@</h1>
<img id="prev" style="width:100%;border-radius:10px;background:#000;min-height:80px"
     src="/api/snapshot" alt="">
<button class="big" onclick="cmd('/api/next')">&#9193; @@NEXT@@</button>
<div class="row">
 <button id="blackout" onclick="cmd('/api/toggle?k=blackout')">&#9899; @@BLACKOUT@@</button>
 <button onclick="cmd('/api/fav')">&#11088; @@FAVORITE@@</button>
 <button id="replayarm" onclick="cmd('/api/toggle?k=replayarm')">@@REPLAYBUF@@</button>
 <button onclick="cmd('/api/replay')">&#128190; @@REPLAYSAVE@@</button>
</div>
<div class="row" id="cfgs"></div>
<label>@@REACTIVITY@@ <span class="val" id="vreactivity"></span></label>
<input type="range" id="reactivity" min="0" max="3" step="0.05"
       oninput="setv('reactivity',this.value)">
<label>@@TRAILS@@ <span class="val" id="vtrails"></span></label>
<input type="range" id="trails" min="0" max="0.95" step="0.05"
       oninput="setv('trails',this.value)">
<label>@@MOOD@@ <span class="val" id="vmood"></span></label>
<input type="range" id="mood" min="0" max="2.5" step="0.05"
       oninput="setv('mood',this.value)">
<label>@@LATENCY@@ <span class="val" id="vlatency"></span></label>
<input type="range" id="latency" min="0" max="250" step="5"
       oninput="setv('latency',this.value/1000)">
<div class="row">
 <button id="lightshow" onclick="cmd('/api/toggle?k=lightshow')">@@LIGHTSHOW@@</button>
 <button id="autoconfig" onclick="cmd('/api/toggle?k=autoconfig')">@@AUTOPRESET@@</button>
 <button id="autoscale" onclick="cmd('/api/toggle?k=autoscale')">@@AUTOSCALE@@</button>
</div>
<div class="row">
 <button id="nowplaying" onclick="cmd('/api/toggle?k=nowplaying')">@@TITLEREVEAL@@</button>
 <button id="lyrics" onclick="cmd('/api/toggle?k=lyrics')">@@LYRICSPREFIX@@?</button>
</div>
<div class="row">
 <button id="artistimages" onclick="cmd('/api/toggle?k=artistimages')">@@ARTISTIMAGES@@</button>
 <button id="video" onclick="cmd('/api/toggle?k=video')">@@VIDEO@@</button>
</div>
<div class="row">
 <button class="big" id="scenetoggle" onclick="toggleScenes()">&#127916; @@SCENEBROWSER@@</button>
 <div id="scenes" style="display:none;max-height:45vh;overflow-y:auto;
      display:none;grid-template-columns:1fr 1fr;gap:4px"></div>
</div>
<script>
let hold=0;
function cmd(u){hold=Date.now()+300;fetch(u).then(refresh);}
function setv(k,v){hold=Date.now()+800;fetch('/api/set?k='+k+'&v='+v);
  document.getElementById('v'+k).textContent=(k=='latency')?Math.round(v*1000):(+v).toFixed(2);}
function refresh(){ if(Date.now()<hold) return;
 fetch('/api/state').then(r=>r.json()).then(s=>{
  for(const k of ['reactivity','trails','mood']){
   document.getElementById(k).value=s[k];
   document.getElementById('v'+k).textContent=(+s[k]).toFixed(2);}
  document.getElementById('latency').value=s.latency*1000;
  document.getElementById('vlatency').textContent=Math.round(s.latency*1000);
  document.getElementById('lightshow').className=s.lightShow?'active':'';
  document.getElementById('autoconfig').className=s.autoConfig?'active':'';
  document.getElementById('blackout').className=s.blackout?'active':'';
  document.getElementById('replayarm').className=s.replayArmed?'active':'';
  document.getElementById('autoscale').className=s.autoScale?'active':'';
  document.getElementById('nowplaying').className=s.nowPlaying?'active':'';
  document.getElementById('artistimages').className=s.artistImages?'active':'';
  document.getElementById('video').className=s.videoEnabled?'active':'';
  const lyricsNames=@@LYRICSARR@@;
  const lb=document.getElementById('lyrics');
  lb.textContent='@@LYRICSPREFIX@@'+lyricsNames[s.lyricsMode];
  lb.className=s.lyricsMode>0?'active':'';
  const c=document.getElementById('cfgs'); c.innerHTML='';
  s.configs.forEach((n,i)=>{const b=document.createElement('button');
   b.textContent=n; if(i==s.active)b.className='active';
   b.onclick=()=>cmd('/api/config?i='+i); c.appendChild(b);});
 });}
setInterval(refresh,2000); refresh();
setInterval(()=>{document.getElementById('prev').src='/api/snapshot?ts='+Date.now();},2000);
let scenesOpen=false;
function toggleScenes(){
 scenesOpen=!scenesOpen;
 const d=document.getElementById('scenes');
 if(!scenesOpen){d.style.display='none';return;}
 d.style.display='grid';
 loadScenes();}
function loadScenes(){
 if(!scenesOpen) return;
 fetch('/api/scenes').then(r=>r.json()).then(s=>{
  const d=document.getElementById('scenes');
  d.innerHTML='';
  s.scenes.forEach((n,i)=>{const b=document.createElement('button');
   b.style.cssText='margin:0;padding:0;display:flex;flex-direction:column;'+
                    'align-items:stretch;overflow:hidden';
   const im=document.createElement('img');
   im.src='/api/thumb?i='+i+'&ts='+Date.now();
   im.style.cssText='width:100%;height:52px;object-fit:cover;background:#1a1a26';
   im.onerror=()=>{im.style.display='none';};
   const lbl=document.createElement('div');
   lbl.textContent=n;
   lbl.style.cssText='padding:6px 4px;font-size:.78em';
   b.appendChild(im); b.appendChild(lbl);
   b.onclick=()=>{cmd('/api/force?i='+i);};
   d.appendChild(b);});
 });}
setInterval(loadScenes,5000);
</script></body></html>)HTML";

/**
 * @brief Fills in kPageTemplate's @@TOKEN@@ placeholders from Strings::T() in the CURRENT
 *        language, rebuilt fresh on every GET "/" so a language change in the setup tool takes
 *        effect on the phone the next time it (re)loads the page -- no server restart needed.
 */
static QByteArray buildPage()
{
	QString page = QString::fromUtf8( kPageTemplate );
	auto sub = [&page]( const char *token, StrId id )
	{
		page.replace( QLatin1String( token ), QString::fromUtf8( Strings::T( id ) ) );
	};
	sub( "@@TITLE@@",        S_WR_TITLE );
	sub( "@@H1@@",           S_WR_H1 );
	sub( "@@NEXT@@",         S_WR_NEXT );
	sub( "@@BLACKOUT@@",     S_WR_BLACKOUT );
	sub( "@@FAVORITE@@",     S_WR_FAVORITE );
	sub( "@@REPLAYBUF@@",    S_WR_REPLAY_BUFFER );
	sub( "@@REPLAYSAVE@@",   S_WR_REPLAY_SAVE );
	sub( "@@REACTIVITY@@",   S_WR_REACTIVITY );
	sub( "@@TRAILS@@",       S_WR_TRAILS );
	sub( "@@MOOD@@",         S_WR_MOOD );
	sub( "@@LATENCY@@",      S_WR_LATENCY );
	sub( "@@LIGHTSHOW@@",    S_WR_LIGHTSHOW );
	sub( "@@AUTOPRESET@@",   S_WR_AUTOPRESET );
	sub( "@@AUTOSCALE@@",    S_WR_AUTOSCALE );
	sub( "@@TITLEREVEAL@@",  S_WR_TITLEREVEAL );
	sub( "@@ARTISTIMAGES@@", S_WR_ARTISTIMAGES );
	sub( "@@VIDEO@@",        S_WR_VIDEO );
	sub( "@@SCENEBROWSER@@", S_WR_SCENEBROWSER );
	// @@LYRICSPREFIX@@ appears twice (the initial button text and the JS
	// template literal) -- QString::replace() with no count limit handles
	// both occurrences from one call, same as every sub() above.
	sub( "@@LYRICSPREFIX@@", S_WR_LYRICS_PREFIX );
	// The JS array literal: these three words are our OWN fixed translation
	// strings (never user data), so no JS-string escaping is needed -- see
	// Strings.cpp, none of them contain a quote/backslash.
	page.replace( QLatin1String( "@@LYRICSARR@@" ),
	              QString( "['%1','%2','%3']" )
	                  .arg( QString::fromUtf8( Strings::T( S_WR_LYRICS_OFF ) ) )
	                  .arg( QString::fromUtf8( Strings::T( S_WR_LYRICS_SCROLL ) ) )
	                  .arg( QString::fromUtf8( Strings::T( S_WR_LYRICS_KARAOKE ) ) ) );
	return page.toUtf8();
}

WebRemote::WebRemote( GLwidget *widget, int port )
	: QObject( widget ), m_widget( widget )
{
	m_server = new QTcpServer( this );
	QObject::connect( m_server, &QTcpServer::newConnection,
	                  this, [this]() { handleConnection(); } );

	m_httpPort = bindFreePort( port );
	if( m_httpPort )
		fprintf( stderr, "WEB REMOTE: http://<this-pc>:%d/\n", m_httpPort );
	else
		fprintf( stderr, "WEB REMOTE: could not find a free port near %d (%s)\n",
		         port, m_server->errorString().toLocal8Bit().constData() );

	// LAN auto-discovery, so the Android app never needs a typed IP. Runs
	// independently of whether the HTTP bind above succeeded — a discovery
	// reply that carries port 0 is harmless (the app would just fail to
	// connect, same as today), and it costs nothing to still answer.
	m_discoverySocket = new QUdpSocket( this );
	if( m_discoverySocket->bind( QHostAddress::AnyIPv4, kDiscoveryPort,
	                              QUdpSocket::ShareAddress | QUdpSocket::ReuseAddressHint ) )
	{
		QObject::connect( m_discoverySocket, &QUdpSocket::readyRead,
		                  this, [this]() { handleDiscovery(); } );
		fprintf( stderr, "WEB REMOTE: LAN auto-discovery listening on UDP %d\n", kDiscoveryPort );
	}
	else
		fprintf( stderr, "WEB REMOTE: could not bind discovery UDP %d (%s) "
		         "- the phone app will need the address typed in manually.\n",
		         kDiscoveryPort, m_discoverySocket->errorString().toLocal8Bit().constData() );
}

int WebRemote::bindFreePort( int preferred )
{
	// A handful of instances on one PC is the realistic ceiling; beyond that
	// something else is wrong and failing loudly (port 0 => the log message
	// above) is more useful than silently trying dozens of ports.
	for( int p = preferred; p < preferred + 20; ++p )
		if( m_server->listen( QHostAddress::Any, quint16(p) ) )
			return p;
	return 0;
}

void WebRemote::handleDiscovery()
{
	while( m_discoverySocket->hasPendingDatagrams() )
	{
		QByteArray buf;
		buf.resize( int( m_discoverySocket->pendingDatagramSize() ) );
		QHostAddress sender;
		quint16      senderPort;
		m_discoverySocket->readDatagram( buf.data(), buf.size(), &sender, &senderPort );

		if( buf != kDiscoveryMagic )
			continue;   // stray traffic on the port - not our protocol

		// Don't advertise an instance nobody could actually connect to: the
		// app would auto-pick it (by identity, or as the sole result) and
		// loop forever redialling a port that was never open. Silence here
		// just makes this instance invisible to discovery, same as if its
		// UDP reply never arrived at all -- the app's normal "none found"
		// fallback (last known address / manual entry) takes over.
		if( m_httpPort == 0 )
			continue;

		QString activeConfig;
		const int active = m_widget->remoteActiveConfig();
		const QStringList cfgs = m_widget->remoteConfigNames();
		if( active >= 0 && active < cfgs.size() )
			activeConfig = cfgs[active];

		const QByteArray reply = QString(
		    "{\"name\":\"%1\",\"port\":%2,\"pid\":\"%3\",\"config\":\"%4\"}" )
		        .arg( jsonEscape( QSysInfo::machineHostName() ) )
		        .arg( m_httpPort )
		        .arg( QCoreApplication::applicationPid() )
		        .arg( jsonEscape( activeConfig ) ).toUtf8();
		m_discoverySocket->writeDatagram( reply, sender, senderPort );
	}
}

void WebRemote::handleConnection()
{
	while( QTcpSocket *sock = m_server->nextPendingConnection() )
	{
		// Reads the entire request on the FIRST readyRead and processes it immediately — no
		// buffering across multiple reads. Fine here because every client is this page's own
		// fetch() calls issuing tiny GET requests that always arrive in a single TCP segment;
		// a general-purpose HTTP server would need to handle a request split across reads.
		QObject::connect( sock, &QTcpSocket::readyRead, sock, [this, sock]()
		{
			const QByteArray req = sock->readAll();
			const int eol = req.indexOf( "\r\n" );
			const QList<QByteArray> parts = req.left( eol < 0 ? req.size() : eol ).split( ' ' );
			// Default response for an unmatched GET path (or a non-GET request): 200 OK with an
			// empty JSON object, rather than a 404 — the page's polling fetches never hit this.
			QByteArray body = "{}";
			QByteArray ctype = "application/json";

			// GET-only dispatch: the request line's method/target, then one branch per route.
			// Every branch either fills body/ctype for the response below, or (for the
			// fire-and-forget action routes) just calls straight into GLwidget/RenderPipeline
			// and leaves body as the default "{}" acknowledgement.
			if( parts.size() >= 2 && parts[0] == "GET" )
			{
				const QUrl url = QUrl::fromEncoded( parts[1] );
				const QString path = url.path();
				const QUrlQuery q( url );

				if( path == "/" )
				{
					body = buildPage();
					ctype = "text/html; charset=utf-8";
				}
				else if( path == "/api/state" )
				{
					QStringList cfgs;
					for( const QString &n : m_widget->remoteConfigNames() )
						cfgs << ("\"" + jsonEscape( n ) + "\"");
					body = QString( "{\"reactivity\":%1,\"trails\":%2,\"mood\":%3,"
					                "\"latency\":%4,\"lightShow\":%5,\"autoConfig\":%6,"
					                "\"active\":%7,\"blackout\":%8,\"replayArmed\":%9,"
					                "\"fps\":%10,\"renderScale\":%11,"
					                "\"autoScale\":%12,\"nowPlaying\":%13,"
					                "\"lyricsMode\":%14,\"artistImages\":%15,\"videoEnabled\":%16,"
					                "\"configs\":[%17]}" )
					       .arg( RenderPipeline::reactivity() ).arg( RenderPipeline::trails() )
					       .arg( RenderPipeline::mood() ).arg( RenderPipeline::latency() )
					       .arg( RenderPipeline::lightShow() ? 1 : 0 )
					       .arg( m_widget->autoConfigEnabled() ? 1 : 0 )
					       .arg( m_widget->remoteActiveConfig() )
					       .arg( RenderPipeline::blackout() ? 1 : 0 )
					       .arg( m_widget->remoteReplayArmed() ? 1 : 0 )
					       .arg( m_widget->fpsValue() )
					       .arg( RenderPipeline::renderScale() )
					       .arg( m_widget->autoScaleEnabled() ? 1 : 0 )
					       .arg( m_widget->nowPlayingEnabled() ? 1 : 0 )
					       .arg( m_widget->lyricsModeValue() )
					       .arg( m_widget->artistImagesEnabled() ? 1 : 0 )
					       .arg( m_widget->videoPipEnabled() ? 1 : 0 )
					       .arg( cfgs.join( "," ) ).toUtf8();
				}
				else if( path == "/api/snapshot" )
				{
					body  = m_widget->remoteSnapshot();
					ctype = "image/jpeg";
					if( body.isEmpty() ) { body = "{}"; ctype = "application/json"; }
				}
				else if( path == "/api/next" )
					m_widget->remoteNextEffect();
				else if( path == "/api/scenes" )
				{
					QStringList names;
					for( const QString &n : m_widget->remoteSceneNames() )
						names << ("\"" + jsonEscape( n ) + "\"");
					body = ("{\"scenes\":[" + names.join( "," ) + "]}").toUtf8();
				}
				else if( path == "/api/force" )
					m_widget->remoteForceScene( q.queryItemValue( "i" ).toInt() );
				else if( path == "/api/thumb" )
				{
					body = m_widget->remoteThumb( q.queryItemValue( "i" ).toInt() );
					ctype = "image/jpeg";
					if( body.isEmpty() ) { body = "{}"; ctype = "application/json"; }
				}
				else if( path == "/api/fav" )
					m_widget->remoteFavorite();
				else if( path == "/api/replay" )
					m_widget->remoteSaveReplay();
				else if( path == "/api/config" )
					m_widget->remoteSelectConfig( q.queryItemValue( "i" ).toInt() );
				else if( path == "/api/set" )
				{
					const QString k = q.queryItemValue( "k" );
					const float   v = q.queryItemValue( "v" ).toFloat();
					if      ( k == "reactivity" ) RenderPipeline::setReactivity( v );
					else if ( k == "trails"     ) RenderPipeline::setTrails( v );
					else if ( k == "mood"       ) RenderPipeline::setMood( v );
					else if ( k == "latency"    ) RenderPipeline::setLatency( v );
				}
				else if( path == "/api/toggle" )
				{
					const QString k = q.queryItemValue( "k" );
					if      ( k == "lightshow"  ) RenderPipeline::toggleLightShow();
					else if ( k == "blackout"   ) RenderPipeline::toggleBlackout();
					else if ( k == "replayarm"  ) m_widget->remoteToggleReplayArm();
					else if ( k == "autoconfig" )
						m_widget->setAutoConfigEnabled( !m_widget->autoConfigEnabled() );
					else if ( k == "autoscale" )
						m_widget->setAutoScaleEnabled( !m_widget->autoScaleEnabled() );
					else if ( k == "nowplaying" )
						m_widget->setNowPlayingEnabled( !m_widget->nowPlayingEnabled() );
					else if ( k == "artistimages" )
						m_widget->setArtistImagesEnabled( !m_widget->artistImagesEnabled() );
					else if ( k == "video" )
						m_widget->setVideoPipEnabled( !m_widget->videoPipEnabled() );
					else if ( k == "lyrics" )   // cycles: off -> scroll -> karaoke -> off
						m_widget->setLyricsModeValue( ( m_widget->lyricsModeValue() + 1 ) % 3 );
				}
			}

			// "Connection: close" on every response: the client (this page's fetch() calls)
			// opens a fresh TCP connection per request, so there is no keep-alive to manage.
			QByteArray resp = "HTTP/1.1 200 OK\r\nContent-Type: " + ctype +
			                  "\r\nContent-Length: " + QByteArray::number( body.size() ) +
			                  "\r\nConnection: close\r\n\r\n" + body;
			sock->write( resp );
			sock->disconnectFromHost();
		} );
		QObject::connect( sock, &QTcpSocket::disconnected, sock, &QObject::deleteLater );
	}
}
