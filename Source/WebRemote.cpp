// WebRemote.cpp — see WebRemote.h.
#include "WebRemote.h"
#include "glwidget.h"
#include "filterShader.h"

#include <QtNetwork/QTcpServer>
#include <QtNetwork/QTcpSocket>
#include <QtCore/QUrl>
#include <QtCore/QUrlQuery>

// The phone page: dark, thumb-sized controls, fetch()-driven, self-refreshing.
static const char *kPage = R"HTML(<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kaleidoscope Remote</title>
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
<h1>Kaleidoscope Remote</h1>
<img id="prev" style="width:100%;border-radius:10px;background:#000;min-height:80px"
     src="/api/snapshot" alt="">
<button class="big" onclick="cmd('/api/next')">&#9193; N&auml;chster Effekt</button>
<div class="row">
 <button id="blackout" onclick="cmd('/api/toggle?k=blackout')">&#9899; Blackout</button>
 <button onclick="cmd('/api/fav')">&#11088; Favorit</button>
 <button id="replayarm" onclick="cmd('/api/toggle?k=replayarm')">Replay-Puffer</button>
 <button onclick="cmd('/api/replay')">&#128190; Replay speichern</button>
</div>
<div class="row" id="cfgs"></div>
<label>Reactivity <span class="val" id="vreactivity"></span></label>
<input type="range" id="reactivity" min="0" max="3" step="0.05"
       oninput="setv('reactivity',this.value)">
<label>Trails <span class="val" id="vtrails"></span></label>
<input type="range" id="trails" min="0" max="0.95" step="0.05"
       oninput="setv('trails',this.value)">
<label>Mood <span class="val" id="vmood"></span></label>
<input type="range" id="mood" min="0" max="2.5" step="0.05"
       oninput="setv('mood',this.value)">
<label>Latenz-Vorlauf (ms) <span class="val" id="vlatency"></span></label>
<input type="range" id="latency" min="0" max="250" step="5"
       oninput="setv('latency',this.value/1000)">
<div class="row">
 <button id="lightshow" onclick="cmd('/api/toggle?k=lightshow')">Lightshow</button>
 <button id="autoconfig" onclick="cmd('/api/toggle?k=autoconfig')">Auto-Preset</button>
</div>
<div class="row">
 <button class="big" id="scenetoggle" onclick="toggleScenes()">&#127916; Szenen-Browser</button>
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
 fetch('/api/scenes').then(r=>r.json()).then(s=>{
  d.innerHTML=''; d.style.display='grid';
  s.scenes.forEach((n,i)=>{const b=document.createElement('button');
   b.textContent=n; b.style.margin='0'; b.style.padding='10px 6px';
   b.style.fontSize='.85em';
   b.onclick=()=>{cmd('/api/force?i='+i);};
   d.appendChild(b);});
 });}
</script></body></html>)HTML";

WebRemote::WebRemote( GLwidget *widget, int port )
	: QObject( widget ), m_widget( widget )
{
	m_server = new QTcpServer( this );
	QObject::connect( m_server, &QTcpServer::newConnection,
	                  this, [this]() { handleConnection(); } );
	if( m_server->listen( QHostAddress::Any, quint16(port) ) )
		fprintf( stderr, "WEB REMOTE: http://<this-pc>:%d/\n", port );
	else
		fprintf( stderr, "WEB REMOTE: could not listen on port %d (%s)\n",
		         port, m_server->errorString().toLocal8Bit().constData() );
}

void WebRemote::handleConnection()
{
	while( QTcpSocket *sock = m_server->nextPendingConnection() )
	{
		QObject::connect( sock, &QTcpSocket::readyRead, sock, [this, sock]()
		{
			const QByteArray req = sock->readAll();
			const int eol = req.indexOf( "\r\n" );
			const QList<QByteArray> parts = req.left( eol < 0 ? req.size() : eol ).split( ' ' );
			QByteArray body = "{}";
			QByteArray ctype = "application/json";

			if( parts.size() >= 2 && parts[0] == "GET" )
			{
				const QUrl url = QUrl::fromEncoded( parts[1] );
				const QString path = url.path();
				const QUrlQuery q( url );

				if( path == "/" )
				{
					body = kPage;
					ctype = "text/html; charset=utf-8";
				}
				else if( path == "/api/state" )
				{
					QStringList cfgs;
					for( const QString &n : m_widget->remoteConfigNames() )
						cfgs << ("\"" + n + "\"");
					body = QString( "{\"reactivity\":%1,\"trails\":%2,\"mood\":%3,"
					                "\"latency\":%4,\"lightShow\":%5,\"autoConfig\":%6,"
					                "\"active\":%7,\"blackout\":%8,\"replayArmed\":%9,"
					                "\"fps\":%10,\"renderScale\":%11,"
					                "\"configs\":[%12]}" )
					       .arg( FilterShader::reactivity() ).arg( FilterShader::trails() )
					       .arg( FilterShader::mood() ).arg( FilterShader::latency() )
					       .arg( FilterShader::lightShow() ? 1 : 0 )
					       .arg( m_widget->autoConfigEnabled() ? 1 : 0 )
					       .arg( m_widget->remoteActiveConfig() )
					       .arg( FilterShader::blackout() ? 1 : 0 )
					       .arg( m_widget->remoteReplayArmed() ? 1 : 0 )
					       .arg( m_widget->fpsValue() )
					       .arg( FilterShader::renderScale() )
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
						names << ("\"" + n + "\"");
					body = ("{\"scenes\":[" + names.join( "," ) + "]}").toUtf8();
				}
				else if( path == "/api/force" )
					m_widget->remoteForceScene( q.queryItemValue( "i" ).toInt() );
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
					if      ( k == "reactivity" ) FilterShader::setReactivity( v );
					else if ( k == "trails"     ) FilterShader::setTrails( v );
					else if ( k == "mood"       ) FilterShader::setMood( v );
					else if ( k == "latency"    ) FilterShader::setLatency( v );
				}
				else if( path == "/api/toggle" )
				{
					const QString k = q.queryItemValue( "k" );
					if      ( k == "lightshow"  ) FilterShader::toggleLightShow();
					else if ( k == "blackout"   ) FilterShader::toggleBlackout();
					else if ( k == "replayarm"  ) m_widget->remoteToggleReplayArm();
					else if ( k == "autoconfig" )
						m_widget->setAutoConfigEnabled( !m_widget->autoConfigEnabled() );
				}
			}

			QByteArray resp = "HTTP/1.1 200 OK\r\nContent-Type: " + ctype +
			                  "\r\nContent-Length: " + QByteArray::number( body.size() ) +
			                  "\r\nConnection: close\r\n\r\n" + body;
			sock->write( resp );
			sock->disconnectFromHost();
		} );
		QObject::connect( sock, &QTcpSocket::disconnected, sock, &QObject::deleteLater );
	}
}
