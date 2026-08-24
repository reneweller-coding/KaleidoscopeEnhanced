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
#include <QtCore/QTimer>
#include <memory>
#include <QtCore/QSysInfo>
#include <QtCore/QCoreApplication>

/// LAN discovery: fixed UDP port + magic request string the Android app
/// broadcasts. Bound with ShareAddress so several Kaleidoscope instances on
/// the SAME PC can all listen here and each answer for itself (Windows
/// delivers a copy of every broadcast datagram to every bound socket).
static const quint16 kDiscoveryPort  = 45677;
static const char   *kDiscoveryMagic = "KALEIDO_DISCOVER_V1";

/// How long a kept-alive connection may sit idle before the server drops it.
/// Long enough to span the page's 2 s polling cadence many times over, short
/// enough that a phone that walked out of the room doesn't hold a socket.
static const int kKeepAliveIdleMs = 30000;

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
 body{background:#101018;color:#eee;font-family:sans-serif;margin:0;padding:12px;
      -webkit-text-size-adjust:100%}
 h1{font-size:1.1em;color:#8cf;margin:4px 0 8px}
 .row{margin:10px 0}
 button{background:#26263a;color:#eee;border:1px solid #446;border-radius:10px;
        padding:12px 16px;font-size:1em;margin:3px}
 button.active{background:#3a6ea5;border-color:#8cf}
 button.big{width:100%;padding:16px;font-size:1.15em}
 button.rec{background:#7a2233;border-color:#c55}
 button.rec.active{background:#c0392b;border-color:#f88}
 input[type=range]{width:100%}
 label{display:block;color:#9ab;font-size:.85em;margin-top:8px}
 .val{color:#8cf;float:right}
 /* Status strip: what is playing right now, always visible above the tabs --
    the preset row alone could not show a HIDDEN preset (e.g. -c Komplett),
    which is why "which preset is active" used to be invisible. */
 .status{display:flex;justify-content:space-between;align-items:center;gap:8px;
         background:#181826;border:1px solid #303048;border-radius:10px;
         padding:8px 10px;margin:8px 0;font-size:.85em}
 .status b{color:#8cf;font-weight:600}
 .dot{display:inline-block;width:9px;height:9px;border-radius:50%;
      background:#c0392b;margin-right:5px;animation:blink 1.2s infinite}
 @keyframes blink{50%{opacity:.25}}
 /* Tab bar: horizontally scrollable so it never wraps on a narrow phone. */
 .tabs{display:flex;overflow-x:auto;gap:4px;margin:10px 0 4px;
       padding-bottom:4px;-webkit-overflow-scrolling:touch}
 .tabs button{flex:0 0 auto;margin:0;padding:10px 14px;font-size:.95em;
              border-radius:10px 10px 0 0}
 .panel{display:none}
 .panel.on{display:block}
 .hint{color:#778;font-size:.78em;margin:6px 2px}
 pre.info{background:#181826;border:1px solid #303048;border-radius:10px;
          padding:10px;font-size:.8em;color:#adf;white-space:pre-wrap;
          word-break:break-word;margin:6px 0}
</style></head><body>
<h1>@@H1@@</h1>
<img id="prev" style="width:100%;border-radius:10px;background:#000;min-height:80px"
     src="/api/snapshot" alt="">
<div class="status">
 <span>@@ACTIVEPRESET@@: <b id="curcfg">–</b></span>
 <span id="recind" style="display:none;color:#f88"><i class="dot"></i>@@RECORDINGNOW@@</span>
 <span id="fpsind" style="color:#778"></span>
</div>

<div class="tabs">
 <button id="tab-live"    onclick="showTab('live')">@@TABLIVE@@</button>
 <button id="tab-presets" onclick="showTab('presets')">@@TABPRESETS@@</button>
 <button id="tab-capture" onclick="showTab('capture')">@@TABCAPTURE@@</button>
 <button id="tab-display" onclick="showTab('display')">@@TABDISPLAY@@</button>
 <button id="tab-image"   onclick="showTab('image')">@@TABIMAGE@@</button>
 <button id="tab-info"    onclick="showTab('info')">@@TABINFO@@</button>
</div>

<div class="panel on" id="p-live">
 <button class="big" onclick="cmd('/api/next')">&#9193; @@NEXT@@</button>
 <div class="row">
  <button id="blackout" onclick="cmd('/api/toggle?k=blackout')">&#9899; @@BLACKOUT@@</button>
  <button id="freeze" onclick="cmd('/api/toggle?k=freeze')">&#10052; @@FREEZE@@</button>
  <button id="pin" onclick="cmd('/api/toggle?k=pin')">&#128204; @@PIN@@</button>
 </div>
 <div class="row">
  <button onclick="cmd('/api/fav')">&#11088; @@FAVORITE@@</button>
  <button onclick="cmd('/api/mark')">&#128278; @@MARK@@</button>
  <button onclick="cmd('/api/tap')">&#128341; @@TAPTEMPO@@</button>
 </div>
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
</div>

<div class="panel" id="p-presets">
 <div class="row" id="cfgs"></div>
 <button class="big" id="scenetoggle" onclick="toggleScenes()">&#127916; @@SCENEBROWSER@@</button>
 <div id="scenes" style="display:none;max-height:45vh;overflow-y:auto;
      grid-template-columns:1fr 1fr;gap:4px"></div>
</div>

<div class="panel" id="p-capture">
 <button class="big rec" id="record" onclick="cmd('/api/toggle?k=record')">
  &#9210; @@RECORDSTART@@</button>
 <div class="row">
  <button onclick="cmd('/api/screenshot')">&#128247; @@SCREENSHOT@@</button>
 </div>
 <div class="row">
  <button id="replayarm" onclick="cmd('/api/toggle?k=replayarm')">@@REPLAYBUF@@</button>
  <button onclick="cmd('/api/replay')">&#128190; @@REPLAYSAVE@@</button>
 </div>
 <div class="row">
  <button onclick="cmd('/api/savemarked')">&#128193; @@SAVEMARKED@@</button>
 </div>
</div>

<div class="panel" id="p-display">
 <div class="row">
  <button id="lightshow" onclick="cmd('/api/toggle?k=lightshow')">@@LIGHTSHOW@@</button>
  <button id="nowplaying" onclick="cmd('/api/toggle?k=nowplaying')">@@TITLEREVEAL@@</button>
 </div>
 <div class="row">
  <button id="lyrics" onclick="cmd('/api/toggle?k=lyrics')">@@LYRICSPREFIX@@?</button>
 </div>
 <div class="row">
  <button id="artistimages" onclick="cmd('/api/toggle?k=artistimages')">@@ARTISTIMAGES@@</button>
  <button id="video" onclick="cmd('/api/toggle?k=video')">@@VIDEO@@</button>
 </div>
 <div class="row">
  <button id="shaderinfo" onclick="cmd('/api/toggle?k=shaderinfo')">@@SHADERNAMES@@</button>
  <button id="features" onclick="cmd('/api/toggle?k=features')">@@FEATUREOVERLAY@@</button>
 </div>
</div>

<div class="panel" id="p-image">
 <label>@@STEREOMODE@@</label>
 <div class="row" id="stereo"></div>
 <label>@@STEREODEPTH@@ <span class="val" id="vstereodepth"></span></label>
 <input type="range" id="stereodepth" min="0" max="2" step="0.1"
        oninput="setv('stereodepth',this.value)">
 <label>@@RENDERSCALE@@ <span class="val" id="vrenderscale"></span></label>
 <input type="range" id="renderscale" min="0.4" max="1" step="0.05"
        oninput="setv('renderscale',this.value)">
 <div class="row">
  <button id="autoscale" onclick="cmd('/api/toggle?k=autoscale')">@@AUTOSCALE@@</button>
  <button id="autoconfig" onclick="cmd('/api/toggle?k=autoconfig')">@@AUTOPRESET@@</button>
 </div>
</div>

<div class="panel" id="p-info">
 <pre class="info" id="shaders">–</pre>
 <div class="status"><span>@@VERSION@@: <b id="appver">–</b></span>
  <span id="updstatus" style="color:#778"></span></div>
 <div class="row" id="updrow" style="display:none">
  <button class="big" id="updbtn" onclick="cmd('/api/installupdate')">
   &#11015; @@INSTALLUPDATE@@</button>
  <div class="hint">@@UPDATEHINT@@</div>
 </div>
 <div class="row">
  <button onclick="cmd('/api/savedefaults')">&#128190; @@SAVEDEFAULTS@@</button>
 </div>
</div>
<script>
let hold=0;
function cmd(u){hold=Date.now()+300;fetch(u).then(refresh);}
function setv(k,v){hold=Date.now()+800;fetch('/api/set?k='+k+'&v='+v);
  document.getElementById('v'+k).textContent=(k=='latency')?Math.round(v*1000):(+v).toFixed(2);}
let tab='live';
function showTab(t){
 tab=t;
 document.querySelectorAll('.panel').forEach(p=>p.classList.remove('on'));
 document.getElementById('p-'+t).classList.add('on');
 document.querySelectorAll('.tabs button').forEach(b=>b.className='');
 document.getElementById('tab-'+t).className='active';
 // The scene grid only makes sense (and only costs requests) while its own
 // tab is on screen -- leaving it means its lazy loader should stop too.
 if(t!='presets'&&scenesOpen) toggleScenes();
 try{localStorage.setItem('krTab',t);}catch(e){}}
const setCls=(id,on)=>{const e=document.getElementById(id);
 if(e) e.className=(e.id=='record'?'big rec':'')+(on?(e.id=='record'?' active':'active'):'');};
function refresh(){ if(Date.now()<hold) return;
 fetch('/api/state').then(r=>r.json()).then(s=>{
  for(const k of ['reactivity','trails','mood']){
   document.getElementById(k).value=s[k];
   document.getElementById('v'+k).textContent=(+s[k]).toFixed(2);}
  document.getElementById('latency').value=s.latency*1000;
  document.getElementById('vlatency').textContent=Math.round(s.latency*1000);
  document.getElementById('stereodepth').value=s.stereoDepth;
  document.getElementById('vstereodepth').textContent=(+s.stereoDepth).toFixed(1);
  document.getElementById('renderscale').value=s.renderScale;
  document.getElementById('vrenderscale').textContent=(+s.renderScale).toFixed(2);
  setCls('lightshow',s.lightShow); setCls('autoconfig',s.autoConfig);
  setCls('blackout',s.blackout);   setCls('replayarm',s.replayArmed);
  setCls('autoscale',s.autoScale); setCls('nowplaying',s.nowPlaying);
  setCls('artistimages',s.artistImages); setCls('video',s.videoEnabled);
  setCls('freeze',s.frozen);       setCls('pin',s.pinned);
  setCls('shaderinfo',s.shaderInfo); setCls('features',s.featureOverlay);
  setCls('record',s.recording);
  document.getElementById('record').innerHTML=
    (s.recording?'⏹ @@RECORDSTOP@@':'⏺ @@RECORDSTART@@');
  document.getElementById('recind').style.display=s.recording?'':'none';
  document.getElementById('fpsind').textContent='@@FPS@@ '+s.fps;
  document.getElementById('curcfg').textContent=s.activeName||'@@NOTHINGPLAYING@@';
  document.getElementById('shaders').textContent=s.shaders||'–';
  document.getElementById('appver').textContent=s.appVersion||'–';
  document.getElementById('updstatus').textContent=s.updateStatus||'';
  // The install button only exists once a newer release was actually found.
  document.getElementById('updrow').style.display=s.updateAvail?'':'none';
  if(s.updateAvail) document.getElementById('updbtn').innerHTML=
    '⬇ @@INSTALLUPDATE@@ '+(s.updateVersion||'');
  const lyricsNames=@@LYRICSARR@@;
  const lb=document.getElementById('lyrics');
  lb.textContent='@@LYRICSPREFIX@@'+lyricsNames[s.lyricsMode];
  lb.className=s.lyricsMode>0?'active':'';
  // Preset row: highlight by NAME, not by index -- the active preset can be a
  // hidden one that isn't in this list at all (started with -c), in which case
  // no button lights up and the status strip above is what names it.
  const c=document.getElementById('cfgs'); c.innerHTML='';
  s.configs.forEach((n,i)=>{const b=document.createElement('button');
   b.textContent=n; if(n===s.activeName)b.className='active';
   b.onclick=()=>cmd('/api/config?i='+i); c.appendChild(b);});
  const st=document.getElementById('stereo'); st.innerHTML='';
  ['Aus','SBS','Top/Bottom','Anaglyph'].forEach((n,i)=>{
   const b=document.createElement('button');
   b.textContent=n; if(i==s.stereoMode)b.className='active';
   b.onclick=()=>cmd('/api/set?k=stereomode&v='+i); st.appendChild(b);});
 });}
setInterval(refresh,2000); refresh();
setInterval(()=>{document.getElementById('prev').src='/api/snapshot?ts='+Date.now();},2000);
// Scene browser: with 300+ scenes, the naive "fetch every thumbnail, every
// 5s, forever" design (still in git history) fires that many no-keep-alive
// TCP connections in a burst -- on the SAME thread as rendering -- every
// time the panel is open, which is what made this feel like it hangs.
// Instead: build the button/label grid once per open (cheap, no network
// beyond one small /api/scenes JSON call), but only fetch a thumbnail image
// once its <img> actually scrolls into view (IntersectionObserver), and only
// re-poll the ones that failed (scene not visited yet this session) AND are
// currently visible, on a slower cadence.
let scenesOpen=false, sceneRetryTimer=null, sceneObserver=null;
function toggleScenes(){
 scenesOpen=!scenesOpen;
 const d=document.getElementById('scenes');
 if(!scenesOpen){
  d.style.display='none';
  if(sceneRetryTimer){clearInterval(sceneRetryTimer);sceneRetryTimer=null;}
  return;}
 d.style.display='grid';
 buildScenes();
 if(!sceneRetryTimer) sceneRetryTimer=setInterval(retryFailedThumbs,4000);}
function buildScenes(){
 fetch('/api/scenes').then(r=>r.json()).then(s=>{
  const d=document.getElementById('scenes');
  d.innerHTML='';
  if(sceneObserver) sceneObserver.disconnect();
  sceneObserver=new IntersectionObserver(entries=>{
   entries.forEach(e=>{ if(e.isIntersecting) loadThumb(e.target); });
  },{root:d,rootMargin:'200px'});
  s.scenes.forEach((n,i)=>{const b=document.createElement('button');
   b.style.cssText='margin:0;padding:0;display:flex;flex-direction:column;'+
                    'align-items:stretch;overflow:hidden';
   const im=document.createElement('img');
   im.dataset.idx=i;
   im.style.cssText='width:100%;height:52px;object-fit:cover;background:#1a1a26';
   im.onerror=()=>{im.style.display='none'; im.dataset.failed='1';};
   const lbl=document.createElement('div');
   lbl.textContent=n;
   lbl.style.cssText='padding:6px 4px;font-size:.78em';
   b.appendChild(im); b.appendChild(lbl);
   b.onclick=()=>{cmd('/api/force?i='+i);};
   d.appendChild(b);
   sceneObserver.observe(im);});
 });}
function loadThumb(im,retry){
 sceneObserver.unobserve(im);
 im.style.display='';
 delete im.dataset.failed;
 im.src='/api/thumb?i='+im.dataset.idx+(retry?('&ts='+Date.now()):'');}
function retryFailedThumbs(){
 if(!scenesOpen) return;
 const cr=document.getElementById('scenes').getBoundingClientRect();
 document.querySelectorAll('#scenes img[data-failed="1"]').forEach(im=>{
  const r=im.getBoundingClientRect();
  if(r.bottom<cr.top||r.top>cr.bottom) return;   // not currently visible -- wait
  loadThumb(im,true);});}
// Restore the last-used tab LAST: showTab() touches scenesOpen, and a `let`
// is in its temporal dead zone until its declaration above has run -- calling
// this any earlier throws a ReferenceError and leaves no tab selected at all.
try{const t=localStorage.getItem('krTab');
    showTab(t&&document.getElementById('p-'+t)?t:'live');}catch(e){showTab('live');}
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
	sub( "@@MARK@@",         S_WR_MARK );
	sub( "@@SAVEMARKED@@",   S_WR_SAVEMARKED );
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
	sub( "@@TABLIVE@@",      S_WR_TAB_LIVE );
	sub( "@@TABPRESETS@@",   S_WR_TAB_PRESETS );
	sub( "@@TABCAPTURE@@",   S_WR_TAB_CAPTURE );
	sub( "@@TABDISPLAY@@",   S_WR_TAB_DISPLAY );
	sub( "@@TABIMAGE@@",     S_WR_TAB_IMAGE );
	sub( "@@TABINFO@@",      S_WR_TAB_INFO );
	sub( "@@FREEZE@@",       S_WR_FREEZE );
	sub( "@@PIN@@",          S_WR_PIN );
	sub( "@@TAPTEMPO@@",     S_WR_TAPTEMPO );
	// @@RECORDSTART@@ appears twice (initial button text + the JS that swaps
	// the label live), same unlimited-replace reasoning as @@LYRICSPREFIX@@.
	sub( "@@RECORDSTART@@",  S_WR_RECORD_START );
	sub( "@@RECORDSTOP@@",   S_WR_RECORD_STOP );
	sub( "@@SCREENSHOT@@",   S_WR_SCREENSHOT );
	sub( "@@SHADERNAMES@@",  S_WR_SHADERNAMES );
	sub( "@@FEATUREOVERLAY@@", S_WR_FEATUREOVERLAY );
	sub( "@@STEREOMODE@@",   S_WR_STEREOMODE );
	sub( "@@STEREODEPTH@@",  S_WR_STEREODEPTH );
	sub( "@@RENDERSCALE@@",  S_WR_RENDERSCALE );
	sub( "@@SAVEDEFAULTS@@", S_WR_SAVEDEFAULTS );
	sub( "@@ACTIVEPRESET@@", S_WR_ACTIVE_PRESET );
	sub( "@@NOTHINGPLAYING@@", S_WR_NOTHING_PLAYING );
	sub( "@@FPS@@",          S_WR_FPS );
	sub( "@@RECORDINGNOW@@", S_WR_RECORDING_NOW );
	sub( "@@VERSION@@",      S_WR_VERSION );
	// appears twice (initial button text + the JS that appends the version)
	sub( "@@INSTALLUPDATE@@", S_WR_INSTALLUPDATE );
	sub( "@@UPDATEHINT@@",   S_WR_UPDATEHINT );
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
		// HTTP/1.1 keep-alive: the page fires a burst of small GETs (state,
		// snapshot, and one per visible scene thumbnail). Closing after each
		// one forced a fresh TCP handshake per request -- barely noticeable on
		// localhost, but a full extra round trip each time over the WiFi link
		// a phone actually uses. The connection is now reused until the client
		// drops it or it goes idle.
		//
		// That means a socket can carry SEVERAL requests, so the old
		// "readAll() is exactly one request" assumption no longer holds:
		// bytes are accumulated per connection and every COMPLETE request in
		// the buffer is answered in turn. GET has no body, so end-of-headers
		// (CRLFCRLF) is end-of-request.
		auto buf = std::make_shared<QByteArray>();

		// Without this an abandoned connection (phone locked, app swiped away)
		// would sit in the server forever now that nothing closes it.
		QTimer *idle = new QTimer( sock );
		idle->setSingleShot( true );
		idle->setInterval( kKeepAliveIdleMs );
		QObject::connect( idle, &QTimer::timeout, sock, [sock]() { sock->disconnectFromHost(); } );
		idle->start();

		QObject::connect( sock, &QTcpSocket::readyRead, sock, [this, sock, buf, idle]()
		{
		  idle->start();                      // re-arm: this connection is alive
		  buf->append( sock->readAll() );
		  int hdrEnd;
		  while( ( hdrEnd = buf->indexOf( "\r\n\r\n" ) ) >= 0 )
		  {
			const QByteArray req = buf->left( hdrEnd + 4 );
			buf->remove( 0, hdrEnd + 4 );
			// HTTP/1.1 keeps the connection open unless the client says otherwise.
			const bool closeAfter = req.contains( "Connection: close" )
			                     || req.contains( "connection: close" );
			const int eol = req.indexOf( "\r\n" );
			const QList<QByteArray> parts = req.left( eol < 0 ? req.size() : eol ).split( ' ' );
			// Default response for an unmatched GET path (or a non-GET request): 200 OK with an
			// empty JSON object, rather than a 404 — the page's polling fetches never hit this.
			QByteArray body = "{}";
			QByteArray ctype = "application/json";
			bool cacheable = false;   // only /api/thumb hits (a real JPEG) sets this

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
					// QString::arg() only reaches %99, and more importantly
					// re-scans the WHOLE string for the lowest-numbered marker
					// on every call -- a %1 appearing inside an already-
					// substituted value would be eaten by the next arg(). Built
					// by concatenation instead now that the state carries this
					// many fields.
					auto num = []( double v ) { return QString::number( v ); };
					auto flag = []( bool b )  { return QString( b ? "1" : "0" ); };
					body = ( "{\"reactivity\":"   + num( RenderPipeline::reactivity() )
					       + ",\"trails\":"       + num( RenderPipeline::trails() )
					       + ",\"mood\":"         + num( RenderPipeline::mood() )
					       + ",\"latency\":"      + num( RenderPipeline::latency() )
					       + ",\"lightShow\":"    + flag( RenderPipeline::lightShow() )
					       + ",\"autoConfig\":"   + flag( m_widget->autoConfigEnabled() )
					       + ",\"active\":"       + QString::number( m_widget->remoteActiveConfig() )
					       + ",\"activeName\":\"" + jsonEscape( m_widget->remoteActiveConfigName() ) + "\""
					       + ",\"blackout\":"     + flag( RenderPipeline::blackout() )
					       + ",\"replayArmed\":"  + flag( m_widget->remoteReplayArmed() )
					       + ",\"fps\":"          + QString::number( m_widget->fpsValue() )
					       + ",\"renderScale\":"  + num( RenderPipeline::renderScale() )
					       + ",\"autoScale\":"    + flag( m_widget->autoScaleEnabled() )
					       + ",\"nowPlaying\":"   + flag( m_widget->nowPlayingEnabled() )
					       + ",\"lyricsMode\":"   + QString::number( m_widget->lyricsModeValue() )
					       + ",\"artistImages\":" + flag( m_widget->artistImagesEnabled() )
					       + ",\"videoEnabled\":" + flag( m_widget->videoPipEnabled() )
					       // second wave: the remaining keyboard functions
					       + ",\"recording\":"    + flag( m_widget->remoteRecording() )
					       + ",\"frozen\":"       + flag( RenderPipeline::frozen() )
					       + ",\"pinned\":"       + flag( RenderPipeline::pinned() )
					       + ",\"shaderInfo\":"   + flag( m_widget->shaderInfoVisible() )
					       + ",\"featureOverlay\":" + flag( m_widget->featureOverlayVisible() )
					       + ",\"stereoMode\":"   + QString::number( RenderPipeline::stereoMode() )
					       + ",\"stereoDepth\":"  + num( RenderPipeline::stereoDepth() )
					       + ",\"shaders\":\""    + jsonEscape( m_widget->remoteShaderInfo() ) + "\""
				       + ",\"appVersion\":\"" + jsonEscape( m_widget->appVersion() ) + "\""
				       + ",\"updateCheck\":"  + flag( m_widget->updateCheckEnabled() )
				       + ",\"updateAvail\":"  + flag( m_widget->updateAvailable() )
				       + ",\"updateVersion\":\"" + jsonEscape( m_widget->updateVersion() ) + "\""
				       + ",\"updateStatus\":\""  + jsonEscape( m_widget->updateStatus() ) + "\""
					       + ",\"configs\":["     + cfgs.join( "," ) + "]}" ).toUtf8();
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
					else cacheable = true;   // a real JPEG: safe for the browser to cache (see below)
				}
				else if( path == "/api/fav" )
					m_widget->remoteFavorite();
				else if( path == "/api/mark" )
					m_widget->remoteToggleMark();
				else if( path == "/api/savemarked" )
					m_widget->remoteSaveMarked();
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
					else if ( k == "stereodepth") RenderPipeline::setStereoDepth( v );
					else if ( k == "renderscale") RenderPipeline::setRenderScale( v );
					else if ( k == "stereomode" ) RenderPipeline::setStereoMode( int(v) );
					else if ( k == "lyricsmode" ) m_widget->setLyricsModeValue( int(v) );
				}
				else if( path == "/api/tap" )
					m_widget->remoteTapTempo();
				else if( path == "/api/screenshot" )
				{
					const QString fn = m_widget->remoteScreenshot();
					body = ( "{\"file\":\"" + jsonEscape( fn ) + "\"}" ).toUtf8();
				}
				else if( path == "/api/savedefaults" )
					m_widget->remoteSaveDefaults();
				// Explicit user action only -- the check itself never downloads.
				else if( path == "/api/installupdate" )
					m_widget->remoteInstallUpdate();
				else if( path == "/api/toggle" )
				{
					const QString k = q.queryItemValue( "k" );
					if      ( k == "lightshow"  ) RenderPipeline::toggleLightShow();
					else if ( k == "blackout"   ) RenderPipeline::toggleBlackout();
					else if ( k == "replayarm"  ) m_widget->remoteToggleReplayArm();
					else if ( k == "record"     ) m_widget->remoteToggleRecord();
					else if ( k == "freeze"     ) RenderPipeline::toggleFreeze();
					else if ( k == "pin"        ) RenderPipeline::togglePin();
					else if ( k == "stereo"     ) RenderPipeline::cycleStereo();
					else if ( k == "shaderinfo" )
						m_widget->setShaderInfoVisible( !m_widget->shaderInfoVisible() );
					else if ( k == "features" )
						m_widget->setFeatureOverlayVisible( !m_widget->featureOverlayVisible() );
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

			// A scene thumbnail is near-static (the active scene's is the only one that can
			// ever change, and only once per session-visit) -- a short max-age lets the
			// browser skip the round trip on a quick close/reopen of the scene browser
			// instead of re-fetching all of them from scratch every time.
			QByteArray resp = "HTTP/1.1 200 OK\r\nContent-Type: " + ctype +
			                  "\r\nContent-Length: " + QByteArray::number( body.size() ) +
			                  ( cacheable ? "\r\nCache-Control: max-age=30" : "" ) +
			                  ( closeAfter ? "\r\nConnection: close"
			                               : "\r\nConnection: keep-alive" ) +
			                  "\r\n\r\n" + body;
			sock->write( resp );
			if( closeAfter )
			{
				sock->disconnectFromHost();
				return;
			}
		  }
		} );
		QObject::connect( sock, &QTcpSocket::disconnected, sock, &QObject::deleteLater );
	}
}
