/*****************************************************************************\
 *                              GLwidget
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Implements GLwidget: the timer-driven render loop, configuration loading/switching, keyboard/mouse input, the
 *  MIDI/audio-menu/lyrics overlays, and persisted UI settings.
 *
 *  @author René Weller
 */

#include <math.h>
#include <algorithm>

#include <QtCore/QFile>
#include <QtCore/QTextStream>
#include <QtCore/QFileInfo>
#include <QtCore/QTemporaryFile>
#include <QtCore/QPointer>
#include <QtCore/QThreadPool>
#include <QtCore/QBuffer>
#include <QtCore/QDateTime>
#include <QtCore/QFileSystemWatcher>
#include <QtCore/QStandardPaths>
#include <QtCore/QTimer>
#include <QtNetwork/QNetworkInterface>
#include <QtGui/QKeyEvent>
#include <QtGui/QKeySequence>
#include <QtCore/QCoreApplication>
#include <QtCore/QSettings>
#include <QtCore/QRegularExpression>
#include <QtCore/QProcess>
#include <QtCore/QDir>
#include <QtGui/QMouseEvent>
#include <QtGui/QScreen>
#include <QtGui/QWindow>
#include <QtGui/QPainter>
#include <QtWidgets/QMessageBox>
#include <QtGui/QImage>

#include <QtCore/qdir.h>
#include <QtCore/qfileinfo.h>

// #include<GL/GLU.h>

#include "glcore.h" // core-profile GL entry points (glcoreInit)
#include "glwidget.h"
#include "ShaderWorker.h"
#include "ShaderForge.h"
#include "PlatformQt.h"
#include "SettingsFile.h"
#include "WebRemote.h"
#include "CueReceiver.h"
#include "QrCode.h"
#include "UpdateCheck.h"
#include "Version.h"
#include "SpoutOut.h" // global facades, released once in ~GLwidget
#include "SpoutIn.h"
#include "VideoIn.h"
#include "VideoPiP.h"
#include "Strings.h"
#include "coreclock.h"

#ifndef GL_MULTISAMPLE
#define GL_MULTISAMPLE \
    0x809D ///< Core GL enable token for multisampling, provided here in case the GL header set lacks it.
#endif


// Start configuration requested on the command line (-c <name>); empty = default.
QString               GLwidget::M_StartConfig;
int                   GLwidget::M_FrameDivisor = 1;  // ini frameDivisor (main())
int                   GLwidget::M_RemotePort = 8080; // on by default (LAN-only, auto-discovered); -t 0 disables
bool                  GLwidget::M_RemotePortFromCli = false;
bool                  GLwidget::M_BatchRender = false;
std::atomic<unsigned> GLwidget::M_Heartbeat{ 0 };

namespace
{

/** What a key press meant to a scrolling overlay menu. */
enum class MenuKeyE
{
    NONE,
    MOVED,
    ACCEPT,
    CANCEL
};

/**  Common key handling for the scrolling overlay menus.
 *
 * @param key     The Qt key code. (in)
 * @param cursor  The menu's selected row; moved by the navigation keys. (in,out)
 * @param count   Number of rows in the menu. (in)
 *
 * @return
 *   MOVED if the cursor moved, ACCEPT for Return/Enter, CANCEL for Escape/Back, NONE if the key is not the menu's.
 *
 * Shared by the preset picker and the audio-source picker so the two cannot
 * drift apart: both had a nine-entry ceiling because selection was bound to
 * the digit keys, and both are now driven by a cursor instead.
 *
 * Returns MenuKeyE::None for anything it does not consume, so the caller falls
 * through to the normal handler and the digit shortcuts keep working.
 **/
MenuKeyE menuNavKey( int key, int &cursor, int count )
{
    if ( count <= 0 )
        return MenuKeyE::NONE;
    switch ( key )
    {
        case Qt::Key_Up: cursor = ( cursor - 1 + count ) % count; return MenuKeyE::MOVED;
        case Qt::Key_Down: cursor = ( cursor + 1 ) % count; return MenuKeyE::MOVED;
        case Qt::Key_PageUp: cursor = std::max( 0, cursor - 5 ); return MenuKeyE::MOVED;
        case Qt::Key_PageDown: cursor = std::min( count - 1, cursor + 5 ); return MenuKeyE::MOVED;
        case Qt::Key_Home: cursor = 0; return MenuKeyE::MOVED;
        case Qt::Key_End: cursor = count - 1; return MenuKeyE::MOVED;
        case Qt::Key_Return:
        case Qt::Key_Enter: return MenuKeyE::ACCEPT;
        // Escape quits the app everywhere else; inside a menu it has to mean
        // "never mind, close this" instead.
        case Qt::Key_Escape:
        case Qt::Key_Back: return MenuKeyE::CANCEL; // remote "Back"
        default: return MenuKeyE::NONE;
    }
}

/**  Clamp a menu cursor and derive the first visible row.
 *
 * @param cursor   The selected row; clamped to the list. (in,out)
 * @param top      The first visible row; receives the new one. (out)
 * @param count    Number of rows in the list. (in)
 * @param visible  Number of rows the menu shows at once. (in)
 *
 * Scrolls by as little as possible, so the list does not jump around under the
 * user when the cursor merely steps past the edge.
 **/
void menuScroll( int &cursor, int &top, int count, int visible )
{
    cursor = std::max( 0, std::min( cursor, count - 1 ) );
    if ( cursor < top )
        top = cursor;
    if ( cursor >= top + visible )
        top = cursor - visible + 1;
    top = std::max( 0, std::min( top, count - visible ) );
}

/**  Feeds one key into a menu's type-to-filter string.
 *
 * @param e       The key event. (in)
 * @param filter  The menu's filter text; edited by the key. (in,out)
 * @param cursor  The selected row; set back to 0 when the filter changes. (in,out)
 *
 * @return
 *   True if the key belonged to the filter (consumed), false otherwise.
 *
 * Backspace removes a character, printable characters append. Any change puts
 * the cursor back on the first match, since the row it pointed at is usually
 * not in the new result set.
 **/
bool menuFilterKey( QKeyEvent *e, QString &filter, int &cursor )
{
    if ( e->key() == Qt::Key_Backspace )
    {
        if ( !filter.isEmpty() )
        {
            filter.chop( 1 );
            cursor = 0;
        }
        return true;
    }
    const QString t = e->text();
    if ( t.size() != 1 || !t.at( 0 ).isPrint() )
        return false;
    // A leading space would only ever match everything, so ignore it; inside
    // the filter it is meaningful, because device names are full of them.
    if ( t.at( 0 ).isSpace() && filter.isEmpty() )
        return false;
    filter.append( t );
    cursor = 0;
    return true;
}

/**  Which row of a menu a point falls on, or -1 for none.
 *
 * @param hit  Geometry recorded by that menu's last draw. (in)
 * @param p    Point in widget coordinates. (in)
 *
 * @return
 *   The row index under the point, or -1.
 **/
int menuRowAt( const MenuHit &hit, const QPoint &p )
{
    if ( hit.rowH <= 0 || hit.rows <= 0 || !hit.box.contains( p ) )
        return -1;
    const int rel = p.y() - hit.rowY0;
    if ( rel < 0 )
        return -1;
    const int row = rel / hit.rowH;
    return ( row < hit.rows ) ? hit.top + row : -1;
}

} // namespace

// ---- Web-remote hooks (called from WebRemote on the main thread) ----
/**  A UI text from the string table as a QString.
 *
 * @param id  The text's id. (in)
 *
 * @return
 *   The text in the UI language.
 **/
static QString ui( StrIdE id )
{
    return QString::fromUtf8( Strings::uiText( id ) );
}

/**  "on" or "off" in the UI language.
 *
 * @param on  The state. (in)
 *
 * @return
 *   The word.
 **/
static QString onOff( bool on )
{
    return ui( on ? S_FB_ON : S_FB_OFF );
}

QStringList GLwidget::remoteUrls() const
{
    QStringList out;
    const int   port = m_webRemote ? m_webRemote->port() : 0;
    if ( port <= 0 )
        return out;
    // Real adapters only, cable before wireless: on the test machine a VPN tunnel came first,
    // and the QR code carries the first address.  The names are a second net for drivers that report no type.
    static const char *const Virtual[] = { "virtual", "vethernet", "vmware", "virtualbox", "hyper-v", "wsl",
                                           "loopback", "bluetooth", "tap-", "tunnel", "vpn", "docker",
                                           "nordlynx", "wireguard", "tailscale", "zerotier", "hamachi", "openvpn" };
    QStringList              wired, wireless;
    for ( const QNetworkInterface &nif : QNetworkInterface::allInterfaces() )
    {
        const auto flags = nif.flags();
        const auto type = nif.type();
        if ( !( flags & QNetworkInterface::IsUp ) || !( flags & QNetworkInterface::IsRunning )
             || ( flags & QNetworkInterface::IsLoopBack )
             || ( type != QNetworkInterface::Ethernet && type != QNetworkInterface::Wifi
                  && type != QNetworkInterface::Ieee80211 ) )
            continue;
        const QString name = ( nif.humanReadableName() + " " + nif.name() ).toLower();
        bool          virt = false;
        for ( const char *v : Virtual )
            virt |= name.contains( QLatin1String( v ) );
        if ( virt )
            continue;
        for ( const QNetworkAddressEntry &e : nif.addressEntries() )
        {
            const QHostAddress a = e.ip();
            if ( a.protocol() != QAbstractSocket::IPv4Protocol )
                continue;
            const quint32 v4 = a.toIPv4Address(); // 10/8, 172.16/12, 192.168/16
            if ( ( v4 >> 24 ) == 10 || ( v4 >> 20 ) == 0xAC1 || ( v4 >> 16 ) == 0xC0A8 )
                ( type == QNetworkInterface::Ethernet ? wired : wireless )
                    << QString( "http://%1:%2/" ).arg( a.toString() ).arg( port );
        }
    }
    out << wired << wireless;
    return out;
}

void GLwidget::showRemoteCard( int secs )
{
    m_cardUrls = remoteUrls();
    if ( m_cardUrls.isEmpty() )
        return;
    m_cardUntil = m_fpsTimer.elapsed() + secs * 1000;
    update();
}

void GLwidget::drawRemoteCard( QPainter *painter, float alpha )
{
    // Sized by the window: the code has to be readable from across a room on a projector and still fit a laptop.
    const int    u = std::max( 10, height() / 34 );
    const QrCode qr = QrCode::encode( m_cardUrls.front().toStdString() );
    if ( qr.size() == 0 )
        return;
    const int module = std::max( 3, ( height() * 40 / 100 ) / ( qr.size() + 8 ) );
    const int qr_side = module * ( qr.size() + 8 ); // with the quiet zone of four modules a side
    QFont     big( "Segoe UI" ), small( "Segoe UI" );
    big.setPixelSize( u * 13 / 10 );
    big.setBold( true );
    small.setPixelSize( u * 9 / 10 );
    const QFontMetrics fb( big ), fs( small );
    int                text_w = fs.horizontalAdvance( ui( S_CARD_PHONE ) );
    for ( const QString &url : m_cardUrls )
        text_w = std::max( text_w, fb.horizontalAdvance( url ) );
    text_w = std::max( text_w, fs.horizontalAdvance( ui( S_CARD_KEYS ) ) );
    const int box_w = std::min( width() - 2 * u, std::max( text_w, qr_side ) + 2 * u );
    const int lines = 2 + static_cast<int>( m_cardUrls.size() );
    const int box_h = std::min( height() - 2 * u, qr_side + lines * u * 17 / 10 + 3 * u );
    const int x0 = ( width() - box_w ) / 2, y0 = ( height() - box_h ) / 2;
    const int a = static_cast<int>( 255.f * alpha );
    painter->fillRect( x0, y0, box_w, box_h, QColor( 12, 14, 20, a * 225 / 255 ) );
    painter->fillRect( x0, y0, box_w, 4, QColor( 255, 190, 80, a ) );
    int y = y0 + u;
    painter->setFont( small );
    painter->setPen( QColor( 220, 226, 236, a ) );
    painter->drawText( QRect( x0, y, box_w, u * 3 / 2 ), Qt::AlignCenter, ui( S_CARD_PHONE ) );
    y += u * 17 / 10;
    painter->setFont( big );
    painter->setPen( QColor( 255, 255, 255, a ) );
    for ( const QString &url : m_cardUrls )
    {
        painter->drawText( QRect( x0, y, box_w, u * 3 / 2 ), Qt::AlignCenter, url );
        y += u * 17 / 10;
    }
    // The code: white field with its quiet zone, black modules -- fully opaque once faded in, or a camera
    // reads the picture behind it.
    const int qx = ( width() - qr_side ) / 2, qy = y + u / 2;
    painter->fillRect( qx, qy, qr_side, qr_side, QColor( 255, 255, 255, a ) );
    for ( int my = 0; my < qr.size(); ++my )
        for ( int mx = 0; mx < qr.size(); ++mx )
            if ( qr.dark( mx, my ) )
                painter->fillRect( qx + ( mx + 4 ) * module, qy + ( my + 4 ) * module, module, module,
                                   QColor( 0, 0, 0, a ) );
    painter->setFont( small );
    painter->setPen( QColor( 180, 190, 205, a ) );
    painter->drawText( QRect( x0, qy + qr_side + u / 2, box_w, u * 3 / 2 ), Qt::AlignCenter, ui( S_CARD_KEYS ) );
}

QStringList GLwidget::remoteConfigNames() const
{
    QStringList out;
    for ( Configuration *c : m_configurationList )
        out << c->getConfigurationName();
    return out;
}

int GLwidget::remoteActiveConfig() const
{
    for ( size_t i = 0; i < m_configurationList.size(); ++i )
        if ( m_configurationList[i] == m_actConfiguration )
            return static_cast<int>( i );
    return -1;
}

// The active config can be one that ISN'T in m_configurationList at all --
// a hidden preset picked with -c, most commonly "Komplett". remoteActiveConfig()
// then returns -1 and the remote's preset row highlights nothing, which reads
// as "the remote doesn't know what's playing". Reporting the NAME separately
// lets the page label it even when there is no button to light up.
QString GLwidget::remoteActiveConfigName() const
{
    return m_actConfiguration ? m_actConfiguration->getConfigurationName() : QString();
}

/**  Where screenshots go: Pictures/Kaleidoscope (beside the program's working folder if that cannot be made).
 *
 * @return
 *   The folder, created.
 **/
static QString shotDir()
{
    const QString pics = QStandardPaths::writableLocation( QStandardPaths::PicturesLocation );
    if ( !pics.isEmpty() && QDir().mkpath( pics + "/Kaleidoscope" ) )
        return pics + "/Kaleidoscope";
    QDir().mkpath( "screenshots" );
    return QFileInfo( "screenshots" ).absoluteFilePath();
}

QString GLwidget::remoteScreenshot()
{
    // The screenshot (16.10.2026) was grabFramebuffer(): it rendered the frame again WITH every overlay on it
    // (the 'i' and 'v' panels, the help, the menu -- hence the menu's 150 ms wait), and saved it under a relative
    // name in the working folder (bin\).  Now the next frame is read at its clean point, before any overlay
    // (paintGL, beside the recorder's capture), and saved by a worker under Pictures\Kaleidoscope, named after
    // the time and the scene.
    QString scene;
    if ( m_actConfiguration && m_actConfiguration->renderPipeline() )
    {
        float taste = 1.f;
        scene = m_actConfiguration->renderPipeline()->activeSceneTaste( taste );
    }
    const QString path =
        QDir( shotDir() )
            .filePath( QString( "kaleidoscope_%1%2.png" )
                           .arg( QDateTime::currentDateTime().toString( "yyyyMMdd_hhmmss" ) )
                           .arg( scene.isEmpty() ? QString() : "_" + scene ) );
    // KALEIDO_SHOT_OVERLAYS=1: the window as it is, overlays and all (the old way) -- for checking the overlays.
    if ( qEnvironmentVariableIsSet( "KALEIDO_SHOT_OVERLAYS" ) )
    {
        const bool ok = grabFramebuffer().convertToFormat( QImage::Format_RGB888 ).save( path );
        fprintf( stderr, ok ? "Saved screenshot: %s\n" : "Screenshot NOT saved: %s\n", qPrintable( path ) );
        if ( ok )
            m_lastShot = path;
        return path;
    }
    m_shotPending = path;
    update();
    return m_shotPending;
}

QString GLwidget::remoteLastShotName() const
{
    return QFileInfo( m_lastShot ).fileName();
}

QByteArray GLwidget::remoteLastShot() const
{
    QFile f( m_lastShot );
    return ( !m_lastShot.isEmpty() && f.open( QIODevice::ReadOnly ) ) ? f.readAll() : QByteArray();
}

void GLwidget::remoteTapTempo()
{
    if ( m_audioAnalyzer )
        m_audioAnalyzer->tapTempo();
}

QString GLwidget::remoteShaderInfo() const
{
    if ( m_actConfiguration && m_actConfiguration->renderPipeline() )
        return m_actConfiguration->renderPipeline()->activeShaderInfo();
    return QString();
}

// ---- Optional update check ------------------------------------------------
// m_update stays null unless the setting is on, so with the feature switched
// off nothing here ever touches the network.
QString GLwidget::appVersion() const
{
    return QString::fromLatin1( KALEIDOSCOPE_VERSION );
}

bool GLwidget::updateAvailable() const
{
    return m_update && m_update->updateAvailable();
}

QString GLwidget::updateVersion() const
{
    return m_update ? m_update->latestVersion() : QString();
}

QString GLwidget::updateStatus() const
{
    return m_update ? m_update->status() : QString();
}

void GLwidget::remoteInstallUpdate()
{
    if ( m_update )
        m_update->downloadAndInstall();
}

void GLwidget::remoteSelectConfig( int idx )
{
    if ( idx >= 0 && idx < static_cast<int>( m_configurationList.size() )
         && m_configurationList[idx] != m_actConfiguration )
        switchConfig( m_configurationList[idx] );
}

void GLwidget::remoteNextEffect()
{
    if ( m_actConfiguration && m_actConfiguration->renderPipeline() )
        m_actConfiguration->renderPipeline()->requestSceneChange();
}

void GLwidget::remoteFavorite()
{
    if ( m_actConfiguration && m_actConfiguration->renderPipeline() )
    {
        m_actConfiguration->renderPipeline()->favoriteCurrentEffect();
        m_actConfiguration->renderPipeline()->rememberCue( cueTrackKey(), cuePosSec() );
        float         taste = 1.f;
        const QString scene = m_actConfiguration->renderPipeline()->activeSceneTaste( taste );
        feedback( ui( S_FB_FAVORITE_FMT ).arg( scene ).arg( taste, 0, 'f', 2 ) );
    }
}

void GLwidget::remoteBan()
{
    if ( !m_actConfiguration || !m_actConfiguration->renderPipeline() )
        return;
    QString scene;
    if ( m_actConfiguration->renderPipeline()->banCurrentScene( scene ) )
        feedback( ui( S_FB_BANNED_FMT ).arg( scene ), 5000 );
    else
        feedback( ui( S_FB_BAN_REFUSED ) );
}

void GLwidget::remoteUnban( const QString &base )
{
    if ( !m_actConfiguration || !m_actConfiguration->renderPipeline() )
        return;
    m_actConfiguration->renderPipeline()->unbanScene( base );
    feedback( ui( S_FB_UNBANNED_FMT ).arg( base.endsWith( ".frag" ) ? base.left( base.size() - 5 ) : base ) );
}

void GLwidget::remoteUnbanIndex( int idx )
{
    if ( m_actConfiguration && m_actConfiguration->renderPipeline() )
    {
        const QString base = m_actConfiguration->renderPipeline()->sceneBase( idx );
        if ( !base.isEmpty() )
            remoteUnban( base );
    }
}

float GLwidget::remoteSceneTaste( int idx, bool &banned )
{
    banned = false;
    return ( m_actConfiguration && m_actConfiguration->renderPipeline() )
               ? m_actConfiguration->renderPipeline()->sceneTaste( idx, banned )
               : 1.f;
}

void GLwidget::remoteUnfavorite()
{
    if ( m_actConfiguration && m_actConfiguration->renderPipeline() )
        feedback( ui( S_FB_UNFAVORITE_FMT ).arg( m_actConfiguration->renderPipeline()->resetTasteCurrent() ) );
}

void GLwidget::remoteForgetCues()
{
    if ( m_actConfiguration && m_actConfiguration->renderPipeline() )
        feedback( ui( S_FB_CUES_FORGOTTEN_FMT ).arg( m_actConfiguration->renderPipeline()->forgetSongCues() ) );
}

QString GLwidget::cueTrackKey() const
{
    // KALEIDO_FAKE_TRACK=artist|title makes the cue memory testable offline:
    // there is no SMTC title then, but a fixed key and the run time as the
    // position.
    static const QString Fake = qEnvironmentVariable( "KALEIDO_FAKE_TRACK" );
    if ( !Fake.isEmpty() )
        return Fake;
    if ( !m_nowPlaying )
        return QString();
    const QString title = m_nowPlaying->title().trimmed();
    if ( title.isEmpty() )
        return QString();
    return ( m_nowPlaying->artist().trimmed() + "|" + title ).toLower();
}

double GLwidget::cuePosSec() const
{
    static const bool Fake = !qEnvironmentVariable( "KALEIDO_FAKE_TRACK" ).isEmpty();
    if ( Fake )
        return m_fpsTimer.elapsed() / 1000.0;
    return m_nowPlaying ? m_nowPlaying->positionNowSec() : -1.0;
}

void GLwidget::remoteToggleMark()
{
    if ( m_actConfiguration && m_actConfiguration->renderPipeline() )
        m_actConfiguration->renderPipeline()->toggleMarkCurrentScene();
}

void GLwidget::remoteSaveMarked()
{
    if ( m_actConfiguration && m_actConfiguration->renderPipeline() )
        m_actConfiguration->renderPipeline()->saveMarkedPreset();
}

QStringList GLwidget::remoteSceneNames()
{
    if ( m_actConfiguration && m_actConfiguration->renderPipeline() )
        return m_actConfiguration->renderPipeline()->sceneNames();
    return QStringList();
}

void GLwidget::remoteForceScene( int idx )
{
    if ( m_actConfiguration && m_actConfiguration->renderPipeline() )
        m_actConfiguration->renderPipeline()->forceScene( idx );
}

/**  On-disk thumbnail cache path for one (config, scene) pair.
 *
 * @param config  Configuration (preset) name, used as the sub-folder. (in)
 * @param scene   Scene name, used as the file stem. (in)
 *
 * @return
 *   Absolute path of the form ..\\ThumbCache\\CONFIG\\SCENE.jpg (the file need not exist).
 *
 * Sibling of Presets\/kaleidoscope_settings.ini (relative to the Release/Debug
 * CWD), keyed by NAME rather than index since indices aren't stable across
 * restarts (a config edit reorders/adds entries) but names are.
 **/
static QString thumbCachePath( const QString &config, const QString &scene )
{
    return Platform::assetPath( "..\\ThumbCache\\" + config + "\\" + scene + ".jpg" );
}

QByteArray GLwidget::remoteThumb( int idx ) const
{
    if ( idx >= 0 && idx < static_cast<int>( m_sceneThumbs.size() ) && !m_sceneThumbs[idx].isEmpty() )
        return m_sceneThumbs[idx];

    // Not captured yet THIS session -- fall back to a thumbnail persisted by
    // a past one, if this exact scene was ever landed on before. Read fresh
    // each time rather than caching into m_sceneThumbs: misses are rare
    // (fires once per not-yet-revisited scene while the browser is open)
    // and this keeps remoteThumb() const.
    if ( idx >= 0 && m_actConfiguration )
    {
        const QStringList names = m_actConfiguration->renderPipeline()
                                      ? m_actConfiguration->renderPipeline()->sceneNames()
                                      : QStringList();
        if ( idx < names.size() )
        {
            QFile f( thumbCachePath( m_actConfiguration->getConfigurationName(), names[idx] ) );
            if ( f.open( QIODevice::ReadOnly ) )
                return f.readAll();
        }
    }
    return QByteArray();
}

/**  A picture as JPEG.
 *
 * @param img      The picture. (in)
 * @param quality  JPEG quality, 0..100. (in)
 *
 * @return
 *   The encoded bytes.
 **/
static QByteArray jpegOf( const QImage &img, int quality )
{
    QByteArray jpg;
    QBuffer    buf( &jpg );
    buf.open( QIODevice::WriteOnly );
    img.save( &buf, "JPG", quality );
    return jpg;
}

void GLwidget::updateRemotePreview()
{
    // Until 16.10.2026 this read the whole frame synchronously (glReadPixels, 18.7 MB at 2880x1620), mirrored and
    // smooth-scaled it twice and encoded two JPEGs, all in the render thread: 31-45 ms (median 35) every 0.9 s
    // while the phone page was open -- four frames lost at 120 Hz, once a second.  Now the GPU shrinks the frame
    // (halving blits, each an exact 2x2 box filter, then one last linear step to 360 px, flipped upright on the
    // way), the small picture goes into a pixel-pack buffer, is mapped two frames later when the GPU is long done
    // with it, and a worker encodes it.

    // 1. The read issued two frames ago: map it (no stall) and hand the picture to a worker.
    if ( m_snapReadAgo >= 0 && ++m_snapReadAgo >= 2 )
    {
        m_snapReadAgo = -1;
        glBindBuffer( GL_PIXEL_PACK_BUFFER, m_snapPbo );
        if ( const void *px = glMapBuffer( GL_PIXEL_PACK_BUFFER, GL_READ_ONLY ) )
        {
            const QImage img = QImage( static_cast<const uchar *>( px ), m_snapOutW, m_snapOutH,
                                       QImage::Format_RGBA8888 )
                                   .copy();
            glUnmapBuffer( GL_PIXEL_PACK_BUFFER );
            m_snapEncoding = true;
            const QPointer<GLwidget> self( this );
            const int                scene = m_snapScene;
            const QString            config = m_snapConfig, scene_name = m_snapSceneName;
            QThreadPool::globalInstance()->start(
                [self, img, scene, config, scene_name]
            {
                const QByteArray jpg = jpegOf( img, 70 );
                QByteArray       tjpg;
                if ( scene >= 0 )
                {
                    tjpg = jpegOf( img.scaledToHeight( 120, Qt::SmoothTransformation ), 65 );
                    // Persisted too, so a scene browsed in a PAST session already has a thumbnail on the very
                    // first /api/thumb request of this one (remoteThumb()'s disk fallback). Keyed by config+scene
                    // NAME (stable across restarts), not index (isn't).
                    if ( !scene_name.isEmpty() )
                    {
                        const QString path = thumbCachePath( config, scene_name );
                        QDir().mkpath( QFileInfo( path ).absolutePath() );
                        QFile f( path );
                        if ( f.open( QIODevice::WriteOnly ) )
                            f.write( tjpg );
                    }
                }
                // Back on the GUI thread, where WebRemote reads them; through qApp, because this widget may be
                // gone by then (the QPointer says so there, safely, on the thread that deletes it).
                QMetaObject::invokeMethod(
                    qApp,
                    [self, jpg, tjpg, scene, config]
                {
                    if ( !self )
                        return;
                    self->m_snapEncoding = false;
                    self->m_snapJpg = jpg;
                    // Scene indices name the scenes of one preset: a thumbnail of another goes nowhere.
                    if ( scene >= 0 && self->m_actConfiguration
                         && self->m_actConfiguration->getConfigurationName() == config )
                    {
                        if ( scene >= static_cast<int>( self->m_sceneThumbs.size() ) )
                            self->m_sceneThumbs.resize( scene + 1 );
                        self->m_sceneThumbs[scene] = tjpg;
                    }
                },
                    Qt::QueuedConnection );
            } );
        }
        glBindBuffer( GL_PIXEL_PACK_BUFFER, 0 );
    }

    // 2. Due: shrink the frame on the GPU and start reading the small picture back.
    const qint64 now = m_fpsTimer.elapsed();
    if ( m_snapReadAgo >= 0 || m_snapEncoding || M_RemotePort <= 0 || now >= m_snapWantedUntil
         || now - m_snapLast <= 900 || m_width <= 1 || m_height <= 1 )
        return;
    m_snapLast = now;
    if ( m_snapSrcW != m_width || m_snapSrcH != m_height )
    {
        freeRemotePreview();
        // Halve while the next half still has 360 rows, then one step to 360 (or the frame's own height).
        int w = m_width, h = m_height;
        while ( h / 2 >= 360 && m_snapLevels < SnapMaxLevels - 1 )
        {
            w = std::max( 1, w / 2 );
            h /= 2;
            m_snapW[m_snapLevels] = w;
            m_snapH[m_snapLevels++] = h;
        }
        m_snapOutH = std::min( 360, m_height );
        m_snapOutW = std::max(
            2, static_cast<int>( std::lround( m_snapOutH * static_cast<double>( m_width ) / m_height ) ) );
        m_snapW[m_snapLevels] = m_snapOutW;
        m_snapH[m_snapLevels++] = m_snapOutH;
        glGenTextures( m_snapLevels, m_snapTex );
        glGenFramebuffers( m_snapLevels, m_snapFbo );
        for ( int i = 0; i < m_snapLevels; ++i )
        {
            glBindTexture( GL_TEXTURE_2D, m_snapTex[i] );
            glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA8, m_snapW[i], m_snapH[i], 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr );
            glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
            glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
            glBindFramebuffer( GL_FRAMEBUFFER, m_snapFbo[i] );
            glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, m_snapTex[i], 0 );
        }
        glBindTexture( GL_TEXTURE_2D, 0 );
        glGenBuffers( 1, &m_snapPbo );
        glBindBuffer( GL_PIXEL_PACK_BUFFER, m_snapPbo );
        glBufferData( GL_PIXEL_PACK_BUFFER, static_cast<GLsizeiptr>( m_snapOutW ) * m_snapOutH * 4, nullptr,
                      GL_STREAM_READ );
        glBindBuffer( GL_PIXEL_PACK_BUFFER, 0 );
        m_snapSrcW = m_width;
        m_snapSrcH = m_height;
    }
    glBindFramebuffer( GL_READ_FRAMEBUFFER, defaultFramebufferObject() );
    int sw = m_width, sh = m_height;
    for ( int i = 0; i < m_snapLevels; ++i )
    {
        const bool last = i == m_snapLevels - 1;
        glBindFramebuffer( GL_DRAW_FRAMEBUFFER, m_snapFbo[i] );
        glBlitFramebuffer( 0, 0, sw, sh, 0, last ? m_snapH[i] : 0, m_snapW[i], last ? 0 : m_snapH[i],
                           GL_COLOR_BUFFER_BIT, GL_LINEAR ); // the last step flips the rows upright
        glBindFramebuffer( GL_READ_FRAMEBUFFER, m_snapFbo[i] );
        sw = m_snapW[i];
        sh = m_snapH[i];
    }
    glBindBuffer( GL_PIXEL_PACK_BUFFER, m_snapPbo );
    glPixelStorei( GL_PACK_ALIGNMENT, 1 );
    glReadPixels( 0, 0, m_snapOutW, m_snapOutH, GL_RGBA, GL_UNSIGNED_BYTE, nullptr );
    glBindBuffer( GL_PIXEL_PACK_BUFFER, 0 );
    glBindFramebuffer( GL_FRAMEBUFFER, defaultFramebufferObject() );
    m_snapReadAgo = 0;

    // A per-scene thumbnail rides along: not from a crossfade (a blend is no shot of either scene) nor from the
    // blackout. It only grows the cache while the remote page is open -- the scene browser shows no image yet for
    // scenes nobody has landed on this session.
    RenderPipeline *rp = m_actConfiguration ? m_actConfiguration->renderPipeline() : nullptr;
    m_snapScene = -1;
    m_snapSceneName.clear();
    if ( rp && !rp->sceneTransitioning() && !RenderPipeline::blackout() && rp->activeSceneIndex() >= 0 )
    {
        m_snapScene = rp->activeSceneIndex();
        m_snapConfig = m_actConfiguration->getConfigurationName();
        const QStringList names = rp->sceneNames();
        if ( m_snapScene < names.size() )
            m_snapSceneName = names[m_snapScene];
    }
}

void GLwidget::freeRemotePreview()
{
    if ( m_snapLevels > 0 )
    {
        glDeleteFramebuffers( m_snapLevels, m_snapFbo );
        glDeleteTextures( m_snapLevels, m_snapTex );
    }
    if ( m_snapPbo )
        glDeleteBuffers( 1, &m_snapPbo );
    m_snapPbo = 0;
    m_snapLevels = 0;
    m_snapSrcW = m_snapSrcH = 0;
    m_snapReadAgo = -1;
}

QByteArray GLwidget::remoteSnapshot()
{
    m_snapWantedUntil = m_fpsTimer.elapsed() + 10000;
    return m_snapJpg;
}
bool                     GLwidget::M_AutoRecord = false;
std::atomic<MidiInput *> GLwidget::M_MidiOpened{ nullptr };

void GLwidget::traverseConfigurations( const QString &dirname, std::vector<Configuration *> &configurationList )
{
    QDir dir( dirname );
    dir.setFilter( QDir::Dirs | QDir::Files | QDir::NoSymLinks );

    const QFileInfoList fileinfolist = dir.entryInfoList();
    foreach ( const QFileInfo &fi, fileinfolist )
    {
        if ( fi.baseName() == "." || fi.baseName() == ".." || fi.baseName() == "" )
        {
            continue;
        }
        if ( fi.isDir() && fi.isReadable() )
        {
            // This is the conditional for recursion
            traverseConfigurations( fi.absoluteFilePath(), configurationList );
        }
        else
        {
            /*if( fi.QImageReader::canRead(  ) )*/
            if ( fi.suffix() == "xml" )
            {
                // do something;
                Configuration *conf = new Configuration( fi.filePath() );
                configurationList.push_back( conf );
            }
        }
    }
}



GLwidget::GLwidget( QWidget *parent )
    : QOpenGLWidget( parent ),
      m_xTrans( 0.0 ),
      m_yTrans( 0.0 ),
      m_zTrans( -2 ),
      m_showSelectConfigurationMenu( false ),
      m_showFeatureOverlay( false ),
      m_audioAnalyzer( nullptr ),
      m_fpsCounter( 0 ),
      m_fpsValue( 0 ),
      m_fpsLastPeriod( 0 )
{
    setFocusPolicy( Qt::StrongFocus );
    setFocus();

    // m_directory = "C:\\Users\\weller\\Pictures";

    // Restore persisted UI state (auto-config / auto-scale toggles, and the last
    // active config as the default start config) before we pick the start config.
    loadUiSettings();

    // Video export (-e): everything that needs no GL happens now, before a window
    // exists -- the audio decode can take a while, and an error (no ffmpeg, an
    // unreadable file) ends the run here with its "[export] error" line.  The
    // engine renders at the video's own size: no render scale below 1.
    if ( VideoExport::requested() )
    {
        m_export = new VideoExport();
        if ( !m_export->prepare() )
        {
            delete m_export; // removes the decoded audio again
            exit( 2 );
        }
        RenderPipeline::setRenderScale( 1.f );
    }

    m_configurationList.clear();
    {
        // Timed: reading every preset at the start is the one large piece of work before the window appears.
        QElapsedTimer presets_timer;
        presets_timer.start();
        traverseConfigurations( Platform::presetsDir( ".." ) /*directory*/,
                                m_configurationList );
        fprintf( stderr, "Presets: %d files read in %.2f s\n", static_cast<int>( m_configurationList.size() ),
                 presets_timer.nsecsElapsed() * 1e-9 );
    }

    // Embedded web remote (CLI -t <port>): phone page with the same harmless
    // controls as the keyboard.  Parented to this widget; main-thread events.
    if ( M_RemotePort > 0 )
        m_webRemote = new WebRemote( this, M_RemotePort );

    // Score cues from a generator (CueReceiver.h): OFF unless cuePort says otherwise.  Same
    // arrangement as the web remote -- a child QObject with a socket on the main thread, so a
    // datagram becomes state that the very next frame reads without any synchronisation.
    if ( m_cuePort > 0 && !m_export )
        new CueReceiver( this, m_cueBind, m_cuePort );
    // The external clock (AudioAnalyzer::externalBeat()): a beat cue keeps the time the moment it arrives, a
    // DAW's MIDI clock too (applyMidi()).  externalClock=false leaves the time to the analysis alone.
    {
        QSettings s( SettingsFile::path(), QSettings::IniFormat );
        AudioAnalyzer::M_ExternalClock = s.value( "externalClock", true ).toBool();
        AudioAnalyzer::M_ClockDelay =
            std::clamp( s.value( "clockDelay", AudioAnalyzer::M_ClockDelay ).toFloat(), 0.f, 0.5f );
    }
    ScoreCues::instance().setBeatListener( [this]( qint64 ms )
    {
        if ( m_audioAnalyzer )
            m_audioAnalyzer->externalBeat( "score cues", ms, 0.f, true );
    } );

    // Optional update check -- OFF unless switched on in the setup tool, and
    // even then it only ASKS GitHub and reports; downloading and running the
    // installer needs a separate, explicit action (see UpdateCheck.h).
    if ( m_updateCheck && !m_export )
    {
        m_update = new UpdateCheck( this );
        m_update->start();
    }

    // Shader HOT-RELOAD (dev aid): watch every user shader; a saved file is
    // recompiled live on the next frame.  Editors often save via replace, so
    // the (dropped) watch path is re-added shortly after each change.
    {
        QStringList watch;
        for ( const QString &d : { QString( "..\\Scene2D" ), QString( "..\\FX" ),
                                   QString( "..\\Transitions" ) } )
            for ( const QFileInfo &fi : QDir( Platform::assetPath( d ) ).entryInfoList( { "*.frag" }, QDir::Files ) )
                watch << fi.absoluteFilePath();
        if ( !watch.isEmpty() && !m_export )
        {
            m_shaderWatcher = new QFileSystemWatcher( this );
            m_shaderWatcher->addPaths( watch );
            connect( m_shaderWatcher, &QFileSystemWatcher::fileChanged, this,
                     [this]( const QString &p )
            {
                m_pendingReloads.insert( QFileInfo( p ).fileName() );
                QTimer::singleShot( 250, this, [this, p]
                {
                    if ( QFile::exists( p ) && m_shaderWatcher )
                        m_shaderWatcher->addPath( p );
                } );
            } );
        }
    }

    // Robustness: a missing/empty presets directory used to crash here with
    // an out-of-range vector access.  Fail with a clear message instead.
    if ( m_configurationList.empty() )
    {
        fprintf( stderr, "FATAL: no preset *.xml files found in "
                         "..\\Presets - cannot start.\n" );
        exit( 1 );
    }

    // HIDDEN presets (hidden="true" on the root element, e.g. the Komplett
    // master reference and the Test* benches): moved to a side list so they
    // never appear in the user-facing selection — menu, digit keys, web
    // remote and auto-config all index m_configurationList only.  They stay
    // fully loadable via -c <name>; the by-name lookups search both lists.
    // The debug setting keeps them in the normal list, so the digit keys, the
    // menu and the web remote can reach Komplett and the Test* benches without
    // a command line. Off by default: they are a reference and an inspection
    // bench, not something to land on while enjoying the show.
    bool show_hidden = false;
    {
        const QString ini_path =
            SettingsFile::path();
        QSettings s( ini_path, QSettings::IniFormat );
        show_hidden = s.value( "showHiddenPresets", false ).toBool();
        // Named ABSOLUTELY, and once. The path is relative to the WORKING
        // DIRECTORY: run from Release/ that is the repository root, run from the
        // packaged bin/ it is the package root. An older copy left beside the exe
        // is therefore never read, and the only symptom is a setting that appears
        // not to work. Same reasoning as the "Photo source: ..." line below --
        // with more than one candidate, say which one won.
        fprintf( stderr, "Settings: %s%s\n",
                 QFileInfo( ini_path ).absoluteFilePath().toLocal8Bit().constData(),
                 QFileInfo( ini_path ).exists() ? "" : " (missing - using defaults)" );
        // The very first start (no settings file yet): the card with the remote's address and its QR code, once.
        m_firstStart = !QFileInfo( ini_path ).exists();
        if ( m_firstStart && m_webRemote && m_webRemote->port() > 0 && !M_BatchRender )
            QTimer::singleShot( 3000, this, [this]()
            { showRemoteCard( 45 ); } );
    }
    // A preset built entirely from geom="mesh" scenes has nothing left once
    // the optional model pack is absent, and RenderPipeline would fall back
    // to a plain pass-through -- an entry in the menu that shows the photos
    // and nothing else. Take it out of the selection instead, so unpacking
    // the models is what makes it appear. No shipped preset is mesh-only
    // today; the guard is what makes adding one safe.
    // Presets/ also holds rigs.xml (the camera-rig table), which has no
    // ConfigurationName: loaded as a preset it showed up as an empty row in
    // the preset menus. Anything without a name is not a preset.
    for ( size_t i = m_configurationList.size(); i-- > 0; )
        if ( m_configurationList[i]->getConfigurationName().trimmed().isEmpty() )
        {
            // Said, except for the rig table, which is no preset and is meant to be there: an XML file of the
            // preset folder that silently did not show up was a riddle (a typo in the attribute, a file a tool
            // half wrote, one that could not be read -- Configuration says which).
            const QFileInfo src( m_configurationList[i]->sourceFile() );
            if ( src.fileName().compare( "rigs.xml", Qt::CaseInsensitive ) != 0 )
                fprintf( stderr, "PRESET: %s has no ConfigurationName - not offered\n",
                         qPrintable( src.fileName() ) );
            m_hiddenConfigurations.push_back( m_configurationList[i] );
            m_configurationList.erase( m_configurationList.begin() + i );
        }

    for ( size_t i = m_configurationList.size(); i-- > 0; )
    {
        Configuration *c = m_configurationList[i];
        if ( c->loadedScenes() == 0 && c->skippedMeshScenes() > 0 && !c->isHidden() )
        {
            fprintf( stderr, "Configuration '%s' needs the 3D model pack "
                             "(all %d of its scenes were skipped) - not offered.\n",
                     c->getConfigurationName().toLocal8Bit().constData(),
                     c->skippedMeshScenes() );
            m_hiddenConfigurations.push_back( c );
            m_configurationList.erase( m_configurationList.begin() + i );
        }
    }

    for ( size_t i = show_hidden ? 0 : m_configurationList.size(); i-- > 0; )
        if ( m_configurationList[i]->isHidden() )
        {
            fprintf( stderr, "Configuration '%s' is hidden (selectable only via -c).\n",
                     m_configurationList[i]->getConfigurationName().toLocal8Bit().constData() );
            m_hiddenConfigurations.push_back( m_configurationList[i] );
            m_configurationList.erase( m_configurationList.begin() + i );
        }
    if ( m_configurationList.empty() )
    {
        // Every preset hidden: a broken setup — show them anyway rather than
        // dying, since each hidden file is still a complete, working preset.
        fprintf( stderr, "WARNING: every configuration is hidden - showing them anyway.\n" );
        m_configurationList.swap( m_hiddenConfigurations );
    }

    // The 3D models are an optional extra download, so a plain install has
    // none of the geom="mesh" scenes. Say so once, with the count: otherwise
    // the only symptom is "the catalogue is smaller than the docs claim",
    // which looks like a bug rather than a missing (optional) component.
    {
        int skipped = 0;
        for ( Configuration *c : m_configurationList )
            skipped += c->skippedMeshScenes();
        for ( Configuration *c : m_hiddenConfigurations )
            skipped += c->skippedMeshScenes();
        m_skippedMesh = skipped;
        if ( skipped > 0 )
            fprintf( stderr,
                     "3D model pack not installed: %d mesh scene(s) skipped. "
                     "Unpack the models into the Models folder to enable them.\n",
                     skipped );
    }

    // Default to the first configuration, or the one requested with -c <name>.
    // -c searches the hidden list too: that is the dev/CI door into the
    // Komplett master and the Test* benches.
    m_actConfiguration = m_configurationList[0];
    if ( !M_StartConfig.isEmpty() )
    {
        bool found = false;
        for ( const auto *lst : { &m_configurationList, &m_hiddenConfigurations } )
        {
            for ( Configuration *c : *lst )
                if ( c->getConfigurationName()
                         .compare( M_StartConfig, Qt::CaseInsensitive )
                     == 0 )
                {
                    m_actConfiguration = c;
                    found = true;
                    break;
                }
            if ( found )
                break;
        }
        if ( !found )
            fprintf( stderr, "Configuration '%s' not found - using default.\n",
                     M_StartConfig.toLocal8Bit().constData() );
    }

    // What the session starts with, start preset and command line included: an exit writes back only what changed
    // after this (a -c or -t of this run is no new default).
    rememberUiSettings();
    checkSettingsWritable();

    resetRotation();
}

GLwidget::~GLwidget()
{
    // Take the measurement along before everything is torn down (no-op
    // without KALEIDO_COST_LOG).
    dumpSceneCost();

    // A video export still running (the process is ending some other way):
    // finish the file with the frames so far.
    const bool exported = ( m_export != nullptr );
    if ( m_export )
    {
        if ( !m_exportEnded )
        {
            makeCurrent();
            m_export->endGL( true );
            doneCurrent();
        }
        delete m_export;
        m_export = nullptr;
    }

    // Save the last chosen state - covers the GRACEFUL quit path (window X,
    // menu "Exit": app.quit() -> app.exec() returns -> this destructor runs).
    // The hard exit(0) spots (Escape/Q/double click) additionally call
    // saveAllSettings() themselves BEFORE exit() - exit() stops execution at
    // once and runs NO C++ destructors, so this one would never get its turn
    // for them.  An export saves nothing: it must not become the live show's
    // start preset.
    // The remote preview: a worker still encoding one finishes first (its result goes to qApp, where a QPointer
    // finds this widget gone), then the GL objects go.
    QThreadPool::globalInstance()->waitForDone( 2000 );
    if ( m_snapLevels > 0 || m_snapPbo )
    {
        makeCurrent();
        freeRemotePreview();
        doneCurrent();
    }

    if ( !exported )
        saveAllSettings( false );

    // Closing mid-recording: finalise cleanly (drains + joins the encoder
    // worker) WHILE the audio analyzer is still alive — the recorder closes
    // the WAV through it.  After shutdown() the recorder never touches it.
    m_recorder.shutdown();
    ScoreCues::instance().setBeatListener( nullptr ); // nothing may reach the analyzer once it is gone
    if ( m_audioAnalyzer )
    {
        m_audioAnalyzer->stop();
        m_audioAnalyzer->wait();
        delete m_audioAnalyzer;
    }
    if ( m_nowPlaying )
    {
        m_nowPlaying->stop();
        delete m_nowPlaying; // joins its thread
    }
    if ( m_midi )
    {
        m_midi->stop();
        delete m_midi;
    }
    delete m_trackMedia;
    // The global Spout facades are released ONCE here (not per preset switch)
    // — with the GL context current, so the receiver texture dies cleanly.
    makeCurrent();
    spoutOutRelease();
    spoutInRelease();
    videoInRelease();
    videoPipRelease();
    // Keep the context current across the Configuration deletes too: each
    // ~RenderPipeline runs cleanTextures()/cleanShaderPrograms() (glDelete*), which
    // need a current GL context — otherwise those deletes are silently dropped
    // (GL_INVALID_OPERATION) and the cleanup is meaningless.
    for ( unsigned int i = 0; i < m_configurationList.size(); ++i )
        delete m_configurationList[i];
    for ( unsigned int i = 0; i < m_hiddenConfigurations.size(); ++i )
        delete m_hiddenConfigurations[i];
    doneCurrent();
}

/*void GLwidget::slotReloadShader(void)
{
    m_renderPipeline->loadShader();
    updateGL();
}*/


bool GLwidget::slotSetDirectory( const QString &filename )
{
    // bool success = m_renderPipeline->loadObj(filename.toAscii().data());
    // updateGL();

    m_directory = filename;
    return true;
}

void GLwidget::initializeGL()
{
    // glEnable(GL_DEPTH_TEST);
    // glEnable(GL_RESCALE_NORMAL);
    // glEnable(GL_CULL_FACE);
    // glShadeModel(GL_SMOOTH); // we use flat shading
    // glEnable(GL_LIGHTING); // enable lighting
    // glEnable(GL_LIGHT0);
    // glLightModeli(GL_LIGHT_MODEL_TWO_SIDE,GL_TRUE);


    // Load OpenGL core entry points now that we have a current context
    // (glcore replaced GLee for the 4.3-core migration; compute entries are
    // optional, everything else is required).
    if ( !glcoreInit() )
        fprintf( stderr, "FATAL: required OpenGL core functions missing\n" );
    // A thread with a shared context compiles the chain labs' specialised
    // variants, so their builds never stall the picture (ShaderWorker.h).
    shaderWorkerStart( context() );
    // Big shaders (the 3D lab's geometry variants) are built by a helper
    // process and loaded as program binaries (ShaderForge.h).
    shaderForgeInit();
    applyQualityProfile();

    // An export renders at the video's size from the first frame on; resizeGL()
    // leaves it there whatever the preview window measures.
    if ( m_export )
        m_actConfiguration->start( m_export->width(), m_export->height() );
    else
        m_actConfiguration->start( 100, 100 );

    const char *version = reinterpret_cast<const char *>( glGetString( GL_VERSION ) );
    fprintf( stderr, "VERSION %s (core profile)\n", version );

    // Same gate as checkGLErrors(), and far more useful: the driver names the
    // call that failed and usually why, where a glGetError() checkpoint can only
    // report where the failure was NOTICED -- often several subsystems past the
    // cause, which sends the reader to the wrong file.
    if ( qEnvironmentVariableIsSet( "KALEIDO_GL_DEBUG" ) )
        glcoreEnableDebugOutput();

    // Complete every fixed sampler unit ONCE, before anything draws.
    //
    // The engine parcels its texture units out statically: photos on 0-2, the
    // sims on 7-11, the compute effects on 12-27 (CfxInfoTable), spectrum on 28,
    // shadow maps on 31/32. Every shader's sampler uniforms point at those
    // units from its first frame -- but the textures only appear once their
    // producer has run, and a draw is validated against every declared sampler,
    // reached or not. So each scene's very first frames validated against
    // empty units, a few warnings per scene activation, hundreds per catalogue
    // sweep. A complete 1x1 stand-in on each unit ends that; every real
    // producer simply binds over it.
    {
        const GLuint d2 = glcoreDummyTex2D();
        for ( int u = 0; u <= 28; ++u )
        {
            glActiveTexture( GL_TEXTURE0 + u );
            glBindTexture( GL_TEXTURE_2D, d2 );
        }
        // The shadow units carry a COMPARE-mode sampler; their stand-in reads
        // depth 1.0 = nothing occludes, so an incoming shadow scene that fades
        // in before any shadow pass ever ran renders fully lit, not undefined.
        const GLuint ds = glcoreDummyShadow();
        glActiveTexture( GL_TEXTURE0 + 31 );
        glBindTexture( GL_TEXTURE_2D, ds );
        glActiveTexture( GL_TEXTURE0 + 32 );
        glBindTexture( GL_TEXTURE_2D, ds );
        glActiveTexture( GL_TEXTURE0 );
    }

    // Migration/validation aid: compile every shader of the active preset
    // eagerly, then quit — the log holds one verdict per shader.
    if ( qEnvironmentVariableIsSet( "KALEIDO_COMPILE_ALL" ) )
    {
        if ( m_actConfiguration->renderPipeline() )
            m_actConfiguration->renderPipeline()->compileAllShaders();
        fflush( stderr );
        exit( 0 );
    }

    // Video export: no capture, no now-playing, no MIDI, no frame timer -- the
    // export drives the frames itself (exportStep()).
    if ( m_export )
    {
        beginExport();
        return;
    }

    // A preset may bring its own audio (AudioFile="..."), which the review
    // preset uses so a scene looks the same on every run -- live audio cannot
    // give you that, and comparing two recordings of the same shader is the
    // whole point of a review pass. Analysed silently, exactly like -w.
    //
    // Only the ACTIVE preset's, and only if the command line said nothing:
    // -w/-x are the explicit instruction and outrank a file named in XML.
    if ( AudioAnalyzer::M_OfflineWav.isEmpty()
         && m_actConfiguration && !m_actConfiguration->audioFile().isEmpty() )
    {
        const QString wav =
            Platform::assetPath( m_actConfiguration->audioFile() );
        // Only if the file is actually there. The analyser's offline branch
        // RETURNS on a WAV it cannot open -- adopting a missing path would not
        // merely lose the preset's track, it would end the session with no
        // audio at all, live capture included. A package without the file
        // (the WAV lives in Tools/, which older packages did not ship) must
        // degrade to listening, and say why.
        if ( !QFileInfo::exists( wav ) )
        {
            fprintf( stderr, "AUDIO: preset '%s' names %s, which does not exist - "
                             "falling back to live capture.\n",
                     m_actConfiguration->getConfigurationName().toLocal8Bit().constData(),
                     wav.toLocal8Bit().constData() );
        }
        else
        {
            AudioAnalyzer::M_OfflineWav = wav;
            fprintf( stderr, "AUDIO: preset '%s' supplies its own track: %s\n",
                     m_actConfiguration->getConfigurationName().toLocal8Bit().constData(),
                     AudioAnalyzer::M_OfflineWav.toLocal8Bit().constData() );
        }
    }

    // Start audio analyser (WASAPI loopback – captures any playing audio)
    m_audioAnalyzer = new AudioAnalyzer( this );
    // The source chosen last time (audio menu); missing devices fall back to the default until they come back.
    {
        QSettings     st( SettingsFile::path(), QSettings::IniFormat );
        const QString dev = st.value( "audioDevice" ).toString();
        if ( !dev.isEmpty() )
            m_audioAnalyzer->requestDevice( dev, st.value( "audioDeviceInput", false ).toBool() );
    }
    m_audioAnalyzer->start();
    m_recorder.setAudioAnalyzer( m_audioAnalyzer );

    // Start the "now playing" poller (SMTC: title/artist of the current track).
    m_nowPlaying = new NowPlaying();
    m_nowPlaying->start();

    // Lyrics + artist images (LRCLIB / Deezer) - loads only on a track change
    // and only if one of the modes is active.
    m_trackMedia = new TrackMedia();
    // Test hook: KALEIDO_LYRICS_TEST="Artist|Title" forces a fetch without a
    // running player; the playback position then runs on the app clock
    // (deterministic for batch probes).  KALEIDO_LYRICS_MODE=1|2 picks the
    // mode; artist images are switched on with it.
    {
        QByteArray t = qgetenv( "KALEIDO_LYRICS_TEST" );
        if ( !t.isEmpty() )
        {
            QStringList parts = QString::fromLocal8Bit( t ).split( '|' );
            if ( parts.size() == 2 )
            {
                m_lyricsTest = true;
                m_artistShow = true;
                QByteArray md = qgetenv( "KALEIDO_LYRICS_MODE" );
                m_lyricsMode = md.isEmpty() ? 2 : qBound( 0, md.toInt(), 2 );
                m_trackStartMs = 0;
                QByteArray dur_env = qgetenv( "KALEIDO_VIDEO_TEST_DURATION" );
                double     dur = dur_env.isEmpty() ? -1.0 : dur_env.toDouble();
                m_trackMedia->requestTrack( parts[0], parts[1], dur );
                fprintf( stderr, "[Lyrics] TESTMODUS: %s - %s (Modus %d)\n",
                         parts[0].toLocal8Bit().constData(),
                         parts[1].toLocal8Bit().constData(), m_lyricsMode );
            }
        }
    }

    // KALEIDO_KEYS="2000:A;2600:Shift+W;3000:;" -- a key script for UI tests: each key (a QKeySequence name) is
    // posted to this window as a Qt event that many milliseconds after the start.  Inside the app only: keys
    // simulated through the system once went to whatever window the user was working in.
    if ( qEnvironmentVariableIsSet( "KALEIDO_KEYS" ) )
        for ( const QString &step : qEnvironmentVariable( "KALEIDO_KEYS" ).split( ';', Qt::SkipEmptyParts ) )
        {
            const int colon = step.indexOf( ':' );
            if ( colon <= 0 )
                continue;
            const QKeySequence seq( step.mid( colon + 1 ) );
            if ( seq.isEmpty() )
                continue;
            const QKeyCombination key = seq[0];
            QTimer::singleShot( step.left( colon ).toInt(), this, [this, key]()
            {
                QCoreApplication::postEvent( this,
                                             new QKeyEvent( QEvent::KeyPress, key.key(), key.keyboardModifiers() ) );
            } );
        }

    // Optional MIDI control: opens the first controller if one is connected.
    // MIDI opens on a thread of its own and is taken over by applyMidi() once it
    // is open: a hanging MIDI subsystem (03.10.2026: midiInGetNumDevs() never
    // returned) must not keep the app from starting.  KALEIDO_NO_MIDI: none at all.
    if ( !qEnvironmentVariableIsSet( "KALEIDO_NO_MIDI" ) )
    {
        const QString midi_want =
            QSettings( SettingsFile::path(), QSettings::IniFormat ).value( "midiDevice" ).toString();
        std::thread( [midi_want]
        {
            MidiInput *mi = new MidiInput();
            if ( mi->start( midi_want ) )
            {
                fprintf( stderr, "MIDI input: %s\n", mi->deviceName().toLocal8Bit().constData() );
                M_MidiOpened.store( mi );
            }
            else
                delete mi;
        } ).detach();
    }

#ifdef WIN32
    // Kiosk / installation: keep the display on and suppress the screensaver and
    // system standby for as long as the visualizer runs (ES_CONTINUOUS makes the
    // request persistent without needing to be re-issued).
    SetThreadExecutionState( ES_CONTINUOUS | ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED );
#endif

    // start FPS timer (shown in the 'i' overlay)
    m_fpsTimer.start();
    m_fpsLastPeriod = 0;
    m_fpsCounter = 0;

    // Ceiling for the adaptive render scale.
    //
    // This used to be `renderScale()` unconditionally, which made the adaptation
    // a ONE-WAY RATCHET: the controller lowers the scale when it sees < 45 fps,
    // RenderPipeline persists that lowered value to the settings file, and the
    // next launch then adopted it as the CEILING as well. Floor and ceiling met
    // at the 0.35 minimum and the scale could never climb back -- the app stayed
    // at 12% of the pixel count on hardware idling at 60 fps, with no way out but
    // hand-editing the ini. Measured here: 61-63 fps at scale 0.35 and not one
    // upward adjustment, because `scale < m_autoScaleMax` was 0.35 < 0.35.
    //
    // An EXPLICIT -s is still honoured as a hard ceiling, which was the original
    // intent; the persisted working value no longer is.
    // A ceiling ABOVE 1.0 is a quality request, not something to creep up on:
    // climbing 1.0 -> 2.0 in 0.05 steps would be 20 visible resolution changes
    // over half a minute. Start AT the requested quality and let the adaptive
    // scaler walk it back only if the machine cannot hold the target rate.
    if ( !RenderPipeline::M_RenderScaleFromCli
         && RenderPipeline::renderScaleMax() > RenderPipeline::renderScale() )
        RenderPipeline::setRenderScale( RenderPipeline::renderScaleMax() );

    m_autoScaleMax = RenderPipeline::M_RenderScaleFromCli
                         ? RenderPipeline::renderScale()
                         : RenderPipeline::renderScaleMax();

    // Periodic refresh timer, paced to the DISPLAY, not to a hard-coded 60 Hz.
    //
    // This was startTimer(16.666666666666) -- and startTimer takes an int, so it
    // truncated to 16 ms and pinned the whole app to ~62 Hz no matter what the
    // panel could do. On a 120/144/240 Hz monitor or TV that threw away most of
    // the refresh rate for no reason: measured here, the renderer sits at 60-63
    // fps with the render scale still at its 0.35 floor, i.e. there is plenty of
    // GPU headroom going unused.
    //
    // Animation is unaffected by the change of rate: both time bases integrate a
    // MEASURED delta (RenderPipeline::paint adds m_nanotimer.elapsed() to
    // m_globaltime, and AudioConditioner::update takes the same dt for the
    // audioPhase/audioAdvance accumulators), so motion speed is wall-clock based
    // and identical at any frame rate.
    applyDisplayRate();
    // The window moved to another screen (a projector, a TV at 50 Hz): the rate follows -- it used to be fixed at
    // the start, so the adaptive resolution and the cube budget kept judging by the first screen's rate.
    if ( QWindow *w = window()->windowHandle() )
        connect( w, &QWindow::screenChanged, this, [this]( QScreen * )
        { applyDisplayRate(); } );

    // CLI -r: begin recording straight away (for testing / debugging).
    if ( M_AutoRecord )
        m_recorder.toggle();

    // glEnable(GL_MULTISAMPLE); //rwrwforeground
    setAutoFillBackground( false ); // rwrwforeground
}

/**  Write the measured per-scene render cost to scene-cost.json.
 *
 * The scheduler's selection budget runs on a hand-set `complexity`
 * attribute -- an estimate nobody ever checked against a clock.  This
 * writes what the frames actually cost, so the estimate can be replaced by
 * a measurement.  Milliseconds per frame, averaged over the frames the
 * scene was on screen; scenes seen for under 30 frames are left out
 * because a handful of frames is dominated by shader compilation.
 **/
void GLwidget::dumpSceneCost()
{
    if ( m_sceneCost.isEmpty() )
        return;
    QFile f( "scene-cost.json" );
    if ( !f.open( QIODevice::WriteOnly | QIODevice::Text ) )
        return;
    QTextStream o( &f );
    o << "{\n";
    bool first = true;
    for ( auto it = m_sceneCost.constBegin(); it != m_sceneCost.constEnd(); ++it )
    {
        if ( it.value().frames < 30 )
            continue;
        if ( !first )
            o << ",\n";
        first = false;
        o << "  \"" << it.key() << "\": { \"ms\": "
          << QString::number( it.value().ms / it.value().frames, 'f', 3 );
        if ( it.value().coverN )
            o << ", \"cover\": "
              << QString::number( it.value().cover / it.value().coverN, 'f', 4 );
        if ( it.value().gpuFrames >= 30 )
            o << ", \"ms_gpu\": " << QString::number( it.value().gpuMs / it.value().gpuFrames, 'f', 3 );
        o << " }";
    }
    o << "\n}\n";
    f.close();
    fprintf( stderr, "Szenenkosten: %d Szenen -> scene-cost.json\n",
             static_cast<int>( m_sceneCost.size() ) );
    m_sceneCost.clear();
}

void GLwidget::paintGL()
{
    if ( m_export )
    {
        paintExportPreview();
        return;
    }

    // KALEIDO_COST_LOG=1: how expensive is each scene REALLY.  The complexity
    // attribute the scheduler's selection budget depends on is hand-made to
    // this day -- an estimate nobody ever measured.  Here the truth comes for
    // free: frame time, charged to the scene active at the moment, written
    // out as JSON at the end.
    static const bool CostLog = qEnvironmentVariableIsSet( "KALEIDO_COST_LOG" );
    // KALEIDO_FRAME_LOG=<ms>: report every frame that took longer than <ms>
    // (default 25).  A stutter is ONE long frame; the per-second fps average
    // hides it (a single 200 ms frame among 100 still reads as ~95 fps), so
    // this logs the outliers with their wall-clock offset from the start and
    // what the lazy warm-up did in that same frame -- which is what turns
    // "it stutters after start" into a named cause.
    static const bool   FrameLog = qEnvironmentVariableIsSet( "KALEIDO_FRAME_LOG" );
    static const double FrameLimit = FrameLog
                                         ? std::max( 1.0, qEnvironmentVariable( "KALEIDO_FRAME_LOG" ).toDouble() )
                                         : 0.0;
    const qint64        frame_t0 = ( CostLog || FrameLog ) ? m_fpsTimer.nsecsElapsed() : 0;
    const qint64        cost_t0 = frame_t0;

    // KALEIDO_GPU_TIMING=1: the GPU time of each frame.  With vsync the fps
    // stop at the panel's rate (120 here) and hide how much headroom a scene
    // has -- or how far a slower GPU is from it.  A ring of four queries is
    // read three frames late, so the readback never waits for the GPU.
    // KALEIDO_COST_LOG uses the same ring: the GPU time of a frame is charged to the scene that stood when it was
    // queued -- the CPU wall clock around draw() only approached it where a sync (the recorder's map) happened to
    // wait for the GPU.
    static const bool GpuTiming = qEnvironmentVariableIsSet( "KALEIDO_GPU_TIMING" );
    static GLuint     gpu_q[4] = { 0, 0, 0, 0 };
    static QString    gpu_scene[4]; // the scene each query is charged to (empty: a fade or a switch, not charged)
    static float      gpu_scale[4] = { 1.f, 1.f, 1.f, 1.f }; // the render scale it ran at
    static QString    gpu_last_scene;
    static int        gpu_frame = 0;
    static double     gpu_sum = 0.0, gpu_max = 0.0;
    static int        gpu_n = 0;
    static qint64     gpu_last = 0;
    const bool        gpu_on = ( GpuTiming || CostLog || m_autoScale ) && glGenQueries && glBeginQuery && glEndQuery
                               && glGetQueryObjectuiv;
    m_gpuQueries = gpu_on;
    if ( gpu_on )
    {
        if ( !gpu_q[0] )
            glGenQueries( 4, gpu_q );
        const GLuint old = gpu_q[( gpu_frame + 1 ) & 3]; // issued three frames ago
        if ( gpu_frame >= 3 )
        {
            GLuint ready = 0;
            glGetQueryObjectuiv( old, 0x8867 /* GL_QUERY_RESULT_AVAILABLE */, &ready );
            if ( ready )
            {
                GLuint ns = 0;
                glGetQueryObjectuiv( old, GL_QUERY_RESULT, &ns );
                const double ms = ns * 1e-6;
                gpu_sum += ms;
                ++gpu_n;
                if ( ms > gpu_max )
                    gpu_max = ms;
                // The adaptive resolution's measure (updateAdaptiveScale()).
                m_gpuMs[m_gpuMsHead] = static_cast<float>( ms );
                m_gpuMsHead = ( m_gpuMsHead + 1 ) % static_cast<int>( m_gpuMs.size() );
                ++m_gpuMsCount;
                QString &charged = gpu_scene[( gpu_frame + 1 ) & 3];
                if ( CostLog && !charged.isEmpty() )
                {
                    SceneCost &c = m_sceneCost[charged];
                    c.gpuMs += ms;
                    ++c.gpuFrames;
                }
                // The adaptive resolution remembers each scene's cost per pixel (at scale 1), to pick the scale the
                // next time the scene comes in.
                if ( m_autoScale && !charged.isEmpty() )
                {
                    const float sc = std::max( 0.1f, gpu_scale[( gpu_frame + 1 ) & 3] );
                    const float at1 = static_cast<float>( ms ) / ( sc * sc );
                    auto        it = m_sceneGpuAt1.find( charged );
                    if ( it == m_sceneGpuAt1.end() )
                        m_sceneGpuAt1.insert( charged, at1 );
                    else
                        it.value() += 0.1f * ( at1 - it.value() );
                }
                charged.clear();
            }
        }
        // Charged only while a scene stands: not in a fade (two scenes and their blend), not on the first frame
        // after a switch (a program's first draw makes the driver build its machine code).
        QString scene;
        if ( ( CostLog || m_autoScale ) && m_actConfiguration && m_actConfiguration->renderPipeline() )
        {
            RenderPipeline   *rp = m_actConfiguration->renderPipeline();
            const QStringList nm = rp->sceneNames();
            const int         idx = rp->activeSceneIndex();
            if ( idx >= 0 && idx < nm.size() && !rp->sceneTransitioning() )
            {
                if ( nm[idx] == gpu_last_scene )
                    scene = nm[idx];
                gpu_last_scene = nm[idx];
            }
            else
                gpu_last_scene.clear();
        }
        gpu_scene[gpu_frame & 3] = scene;
        gpu_scale[gpu_frame & 3] = RenderPipeline::renderScale();
        glBeginQuery( 0x88BF /* GL_TIME_ELAPSED */, gpu_q[gpu_frame & 3] );
    }

    draw();

    if ( gpu_on )
    {
        glEndQuery( 0x88BF );
        ++gpu_frame;
        const qint64 t = m_fpsTimer.elapsed();
        if ( GpuTiming && t - gpu_last >= 1000 && gpu_n > 0 )
        {
            fprintf( stderr, "[gpu] %.2f ms avg  %.2f ms max  %dx%d  renderScale %.2f\n",
                     gpu_sum / gpu_n, gpu_max, m_width, m_height, RenderPipeline::renderScale() );
            gpu_sum = gpu_max = 0.0;
            gpu_n = 0;
            gpu_last = t;
        }
    }

    if ( FrameLog )
    {
        const double ms = ( m_fpsTimer.nsecsElapsed() - frame_t0 ) * 1e-6;
        // The time between two frames, too: a stall in the buffer swap or outside
        // paintGL (another process holding the GPU) does not show in the frame's own time.
        static qint64 prev_t0 = 0;
        const double  gap = prev_t0 > 0 ? ( frame_t0 - prev_t0 ) * 1e-6 : 0.0;
        prev_t0 = frame_t0;
        if ( gap > 2.0 * FrameLimit )
            fprintf( stderr, "[gap] t=%7.2fs  %8.1f ms since the last frame\n", m_fpsTimer.elapsed() / 1000.0, gap );
        if ( ms > FrameLimit )
            fprintf( stderr, "[frame] t=%7.2fs  %8.1f ms  warm=%s\n",
                     m_fpsTimer.elapsed() / 1000.0, ms,
                     RenderPipeline::lastWarmLabel().isEmpty()
                         ? "-"
                         : RenderPipeline::lastWarmLabel().toLocal8Bit().constData() );
    }

    if ( CostLog && m_actConfiguration && m_actConfiguration->renderPipeline() )
    {
        RenderPipeline   *rp = m_actConfiguration->renderPipeline();
        const QStringList nm = rp->sceneNames();
        const int         idx = rp->activeSceneIndex();
        if ( idx >= 0 && idx < nm.size() )
        {
            SceneCost  &c = m_sceneCost[nm[idx]];
            const float cov = rp->activeCoverage();
            if ( cov >= 0.f )
            {
                c.cover += cov;
                ++c.coverN;
            }
            c.ms += ( m_fpsTimer.nsecsElapsed() - cost_t0 ) * 1e-6;
            ++c.frames;
        }
    }

    // qglColor(Qt::white);
    // renderText(100, 100, "txt", QFont("Arial", 32, QFont::Bold, false) );


    // glDisable(GL_LIGHTING);
    // glDisable(GL_DEPTH_TEST);
    // qglColor(Qt::white);
    // renderText(100, 100, "Dies ist ein langer OpenGL Text", QFont("Arial", 48, QFont::Bold, false) );
    // glEnable(GL_DEPTH_TEST);
    // glEnable(GL_LIGHTING);

    // FPS measurement: recompute once per second, shown in the 'i' overlay.
    const qint64 now = m_fpsTimer.elapsed();
    if ( now - m_fpsLastPeriod >= 1000 )
    {
        m_fpsValue = static_cast<int>( m_fpsCounter * 1000.0 / static_cast<double>( now - m_fpsLastPeriod ) + 0.5 );
        m_fpsCounter = 0;
        m_fpsLastPeriod = now;
        // KALEIDO_FPS_LOG=1 also puts it in the log, with the render scale next
        // to it -- the two only mean something together, since updateAdaptiveScale()
        // trades one for the other and persists the result to the settings file.
        // Without this pairing a "slow" report is unattributable: a scale pinned
        // at its 0.35 floor and a genuinely expensive frame look identical.
        static const bool FpsLog = qEnvironmentVariableIsSet( "KALEIDO_FPS_LOG" );
        if ( FpsLog )
            fprintf( stderr, "[fps] %d fps  renderScale %.2f\n",
                     m_fpsValue, RenderPipeline::renderScale() );
    }
    ++m_fpsCounter;

    // Keep the frame rate near target by nudging the internal render scale.
    updateAdaptiveScale();
}


// static unsigned int counterExportImages = 0;
// static bool save_images = true;



void GLwidget::stepSweeps( qint64 nowMs )
{
    // KALEIDO_FX_SWEEP=<seconds>: the same walk, but over the OVERLAYS.
    // The scene stays put (review mode holds it) and the combine shader steps
    // on, so each overlay lands at a known timestamp over identical content --
    // which is what makes "this FX does nothing" measurable instead of a
    // suspicion.  Independent of the scene sweep; setting both walks scenes.
    if ( fxSweepSeconds() > 0 && !sweepActive()
         && m_actConfiguration && m_actConfiguration->renderPipeline() )
    {
        RenderPipeline   *rp = m_actConfiguration->renderPipeline();
        const QStringList names = rp->fxNames();
        if ( !m_sweepReview )
        {
            m_sweepReview = true;
            rp->setReviewMode( true );
        }
        const qint64 now_ms = nowMs;
        if ( m_fxSweepNextMs < 0 || now_ms >= m_fxSweepNextMs )
        {
            if ( m_fxSweepIdx < names.size() )
            {
                fprintf( stderr, "[fxsweep] %3d/%d  t=%.1fs  %s\n", m_fxSweepIdx,
                         static_cast<int>( names.size() ), now_ms * 0.001,
                         names[m_fxSweepIdx].toLocal8Bit().constData() );
                rp->forceFx( m_fxSweepIdx );
                ++m_fxSweepIdx;
            }
            else if ( m_fxSweepIdx == names.size() )
            {
                fprintf( stderr, "[fxsweep] finished after %d fx\n", m_fxSweepIdx );
                ++m_fxSweepIdx;
            }
            m_fxSweepNextMs = now_ms + static_cast<qint64>( fxSweepSeconds() ) * 1000;
        }
    }

    // KALEIDO_SCENE_SWEEP=<seconds>: step through EVERY scene of the loaded
    // config in catalogue order, holding each for that many seconds. The
    // scheduler picks scenes at random by design, which is right for viewing
    // and useless for reviewing: to see all of a 500-entry catalogue by chance
    // you would have to render several times its length and would still miss
    // entries. This walks it exactly once. The recorder captures on the same
    // wall clock, so scene n sits at a known timestamp in the output file --
    // which is what makes a contact sheet attributable.
    if ( sweepActive() && m_actConfiguration && m_actConfiguration->renderPipeline() )
    {
        RenderPipeline   *rp = m_actConfiguration->renderPipeline();
        const QStringList names = rp->sceneNames();

        // Review mode already exists for exactly this problem -- it stops the
        // scheduler cutting on harmonic changes, section boundaries and drops
        // -- but Configuration.cpp only turns it on for configs NAMED "Test*".
        // A sweep must not depend on what its config happens to be called: a
        // third of the windows in the first run were stolen mid-scene, which
        // is invisible in the output unless you happen to know a station
        // family has no synthwave grid.
        if ( !m_sweepReview )
        {
            m_sweepReview = true;
            rp->setReviewMode( true );
        }
        const qint64 now_ms = nowMs;
        const int    secs = sweepSeconds();

        if ( m_sweepNextMs < 0 || now_ms >= m_sweepNextMs )
        {
            if ( m_sweepIdx < names.size() )
            {
                fprintf( stderr, "[sweep] %3d/%d  t=%.1fs  %s\n", m_sweepIdx,
                         static_cast<int>( names.size() ), now_ms * 0.001,
                         names[m_sweepIdx].toLocal8Bit().constData() );
                rp->forceScene( m_sweepIdx );
                m_sweepWant = m_sweepIdx;
                m_sweepJumpMs = now_ms;
                m_sweepRetried = false;
                ++m_sweepIdx;
            }
            else if ( m_sweepIdx == names.size() )
            {
                fprintf( stderr, "[sweep] finished after %d scenes\n", m_sweepIdx );
                ++m_sweepIdx; // report once, then idle
            }
            m_sweepNextMs = now_ms + static_cast<qint64>( secs ) * 1000;
        }

        // The scheduler keeps its own counsel -- a musical trigger can cut away
        // mid-window. Reviewing the result then silently attributes frames to
        // the wrong scene, which is worse than a gap: it looks like a scene has
        // a backdrop it does not have. (That is exactly how this was found: a
        // synthwave grid appeared behind three station families whose shaders
        // contain no grid at all.) So log what is ACTUALLY on screen, and put
        // the requested scene back if it was taken away.
        const int act = rp->activeSceneIndex();
        if ( act != m_sweepShown )
        {
            m_sweepShown = act;
            fprintf( stderr, "[shown] t=%.1fs  %3d  %s\n", now_ms * 0.001, act,
                     ( act >= 0 && act < names.size() )
                         ? names[act].toLocal8Bit().constData()
                         : "?" );
        }
        // Only after the cross-fade has had time to land: during a fade
        // actTexture() still reports the OUTGOING scene, so retrying earlier
        // would cancel the fade it is waiting on and never converge.
        if ( !m_sweepRetried && m_sweepWant >= 0 && act != m_sweepWant
             && now_ms - m_sweepJumpMs > 3000 )
        {
            m_sweepRetried = true;
            fprintf( stderr, "[sweep] retry %d (scheduler cut to %d)\n", m_sweepWant, act );
            rp->forceScene( m_sweepWant );
        }
    }
}

void GLwidget::draw()
{
    AudioFeatures audio;
    if ( m_audioAnalyzer )
        audio = m_audioAnalyzer->getFeatures();
    if ( RenderPipeline::freezeTime() >= 0.f ) // a comparison run: silence, whatever is playing
        audio = AudioFeatures();
    m_eventLatch.apply( audio ); // the beats, onsets and track changes since the last frame, none lost
    updateRest( audio );

    // Song boundaries: the silence between tracks and the media session's title (updateSongBoundary()).
    updateSongBoundary( audio );

    // The scene and FX sweeps (KALEIDO_SCENE_SWEEP, KALEIDO_FX_SWEEP), on the wall clock live.
    stepSweeps( m_fpsTimer.elapsed() );

    // Apply any queued MIDI control messages.
    applyMidi();

    // OSC output: hand the freshly fetched features to the sender. Beat events
    // leave immediately, the periodic layers rate-limit themselves; a render
    // frame (~7-16 ms) is the only latency added, well under the ~100 ms the
    // literature calls "tight" for beat-synchronous visuals.
    if ( m_osc.enabled() )
    {
        const float dt = m_oscClock.isValid()
                             ? static_cast<float>( m_oscClock.restart() ) * 0.001f
                             : 0.f;
        if ( !m_oscClock.isValid() )
            m_oscClock.start();
        m_osc.tick( audio, dt );
        if ( m_actConfiguration && m_actConfiguration->renderPipeline() )
        {
            OscSender::ShowState st;
            m_actConfiguration->renderPipeline()->showState( st.scene, st.fading, st.transition, st.fadeSecs,
                                                             st.blackout, st.rgb );
            st.preset = m_actConfiguration->getConfigurationName().toUtf8();
            st.riseRate = RenderPipeline::strictLight() ? 1.f : 2.f;
            m_osc.show( st, dt );
        }
    }

    // Batch render (-x): once the offline WAV has been fully analysed, stop
    // the recording (which kicks off the detached ffmpeg mux) and quit —
    // unattended WAV-to-video rendering.
    if ( M_BatchRender && !m_batchStopping && m_audioAnalyzer
         && m_audioAnalyzer->isFinished() )
    {
        m_batchStopping = true;
        if ( m_recorder.recording() )
            m_recorder.toggle();
        fprintf( stderr, "BATCH: WAV done - exiting (the mp4 mux continues detached)\n" );
        QTimer::singleShot( 3000, []
        { QCoreApplication::quit(); } );
    }

    // Hot-reload: recompile shaders whose files changed (GL context current).
    // Applied to EVERY configuration's pipeline; lazily-uncompiled programs
    // pick up the new source on their eventual first compile anyway.
    if ( !m_pendingReloads.isEmpty() )
    {
        for ( const QString &n : m_pendingReloads )
            for ( const auto *lst : { &m_configurationList, &m_hiddenConfigurations } )
                for ( Configuration *c : *lst )
                    if ( c && c->renderPipeline() )
                        c->renderPipeline()->reloadFragment( n );
        m_pendingReloads.clear();
    }

    // Auto-config-by-mood (optional, key 'a'): may switch m_actConfiguration.
    updateAutoConfig( audio );

    // QOpenGLWidget renders into its own FBO, not framebuffer 0.  Tell the
    // pipeline where the final image must land, otherwise it draws off-screen.
    m_actConfiguration->renderPipeline()->setDefaultFBO( defaultFramebufferObject() );

    if ( m_restState == RestE::RESTING )
    {
        // At rest no scene runs: the window stays black, a few frames a second (timerEvent()); the menu and the
        // notices still draw on top, so the show can be woken from them.
        glBindFramebuffer( GL_FRAMEBUFFER, defaultFramebufferObject() );
        glViewport( 0, 0, m_width, m_height );
        glClearColor( 0.f, 0.f, 0.f, 1.f );
        glClear( GL_COLOR_BUFFER_BIT );
    }
    else
    {
        m_actConfiguration->renderPipeline()->tickCues( cueTrackKey(), cuePosSec() );
        m_actConfiguration->renderPipeline()->paint( m_rotationMatrix, m_xTrans, m_yTrans, m_zTrans, audio );
    }

    // Capture the clean frame (before any overlay is drawn) while recording
    // or while the instant-replay ring is armed.
    m_recorder.captureIfDue( m_width, m_height );

    // Web-remote live preview, refreshed ~1x per second while the phone page polls /api/snapshot.
    updateRemotePreview();

    // A screenshot asked for (remoteScreenshot()): the clean frame, read once (a sync read, but once per press),
    // opaque -- the default framebuffer's alpha is not the picture's -- and saved by a worker.
    if ( !m_shotPending.isEmpty() )
    {
        QImage img( m_width, m_height, QImage::Format_RGBA8888 );
        glBindFramebuffer( GL_READ_FRAMEBUFFER, defaultFramebufferObject() );
        glReadPixels( 0, 0, m_width, m_height, GL_RGBA, GL_UNSIGNED_BYTE, img.bits() );
        const QString            path = m_shotPending;
        const QPointer<GLwidget> self( this );
        m_shotPending.clear();
        QThreadPool::globalInstance()->start( [self, img, path]
        {
            const bool ok = img.mirrored().convertToFormat( QImage::Format_RGB888 ).save( path );
            fprintf( stderr, ok ? "Saved screenshot: %s\n" : "Screenshot NOT saved: %s\n", qPrintable( path ) );
            if ( ok )
                QMetaObject::invokeMethod( qApp, [self, path]
                {
                    if ( self )
                        self->m_lastShot = path;
                } );
        } );
    }

    // Config cross-fade: draw the captured previous frame on top, fading out.
    float fade_alpha = 0.f;
    if ( m_fadeStart >= 0 )
    {
        const qint64 dur = 700; // fade length (ms)
        qint64       el = m_fpsTimer.elapsed() - m_fadeStart;
        if ( el >= dur || m_fadePixmap.isNull() )
        {
            m_fadeStart = -1; // done
            m_fadePixmap = QPixmap();
        }
        else
            fade_alpha = 1.f - static_cast<float>( el ) / static_cast<float>( dur );
    }

    // Now-playing TITLE REVEAL: on a track change the title is handed to the
    // engine, which weaves it through the picture in the present pass (the
    // text unfolds out of a kaleidoscopic swirl — replaces the old QPainter
    // lower third).  Toggle stays on key 'p'.
    float np_alpha = 0.f; // the QPainter lower third is retired (reveal instead)
    if ( m_nowPlaying && m_showNowPlaying )
    {
        QString np_title = m_nowPlaying->title();
        if ( !np_title.isEmpty() && np_title != m_lastNpTitle )
        {
            m_lastNpTitle = np_title;
            m_npShownAt = m_fpsTimer.elapsed();
            if ( m_actConfiguration && m_actConfiguration->renderPipeline() )
                m_actConfiguration->renderPipeline()->showTitle( np_title,
                                                                 m_nowPlaying->artist() );
            // Track change: fetch lyrics + artist images for the new title
            // (only if a mode is active - otherwise no network requests).
            m_trackStartMs = m_fpsTimer.elapsed();
            m_posSmooth = -1.0; // set the consumer PLL up again (new song = new timeline)
            m_palValid = false; // the cover palette belongs to the old artist
            m_lastKaraokeLineSeen = -1;
            m_lineChangeMs = -1;
            if ( m_trackMedia && !m_lyricsTest
                 && ( m_lyricsMode > 0 || m_artistShow ) )
            {
                // Music-video search only makes sense (and is only worth the
                // download) when the artist-image corner is actually shown --
                // that's the slot it takes over. Passing <=0 when it's off
                // makes requestTrack() skip the video gate entirely (see
                // TrackMedia.h), no separate flag needed there.
                const double dur_sec = ( m_artistShow && m_videoEnabled )
                                           ? m_nowPlaying->timeline().durationSec
                                           : -1.0;
                m_trackMedia->requestTrack( m_nowPlaying->artist(), np_title, dur_sec );
            }
        }
    }

    // Lyrics/artist-image overlay: compute the state + upload the textures
    // (the GL context is current here), then hand it to the PresentPass.
    if ( m_actConfiguration && m_actConfiguration->renderPipeline() )
        updateTrackOverlays( m_actConfiguration->renderPipeline() );
    // Demo/test hook: KALEIDO_TITLE_TEST=1 fires one reveal a few seconds in
    // (lets the reveal be tuned without a real media session running).
    {
        static bool title_test = qEnvironmentVariableIsSet( "KALEIDO_TITLE_TEST" );
        if ( title_test && m_fpsTimer.elapsed() > 3000 )
        {
            title_test = false;
            if ( m_actConfiguration && m_actConfiguration->renderPipeline() )
                m_actConfiguration->renderPipeline()->showTitle( "Neon Cathedral",
                                                                 "The Prisms" );
        }
    }

    // printf( "Painting Now\n" );
    // Only spin up a QPainter when an overlay or the cross-fade needs it, so the
    // normal render path is pure GL (no QPainter/GL state interaction).
    const float notice_alpha = noticeAlpha();
    const float card_alpha = m_cardUntil > 0
                                 ? std::clamp( static_cast<float>( m_cardUntil - m_fpsTimer.elapsed() ) / 400.f, 0.f,
                                               1.f )
                                 : 0.f;
    if ( m_cardUntil > 0 && card_alpha <= 0.f )
        m_cardUntil = 0;
    if ( m_showSelectConfigurationMenu || m_showFeatureOverlay || m_showHelp
         || m_showAudioMenu || m_showShaderInfo || m_recorder.recording()
         || fade_alpha > 0.f || np_alpha > 0.f || m_osd.isOpen() || notice_alpha > 0.f || card_alpha > 0.f )
    {
        QPainter painter( this );
        // painter.setRenderHint(QPainter::Antialiasing);
        if ( fade_alpha > 0.f )
        {
            painter.setOpacity( fade_alpha );
            painter.drawPixmap( rect(), m_fadePixmap );
            painter.setOpacity( 1.0 );
        }
        if ( m_showSelectConfigurationMenu )
            showSelectConfigurationsMenu( &painter );
        if ( m_showFeatureOverlay )
            drawFeatureOverlay( &painter, audio );
        if ( m_showHelp )
            drawHelpOverlay( &painter );
        if ( m_showAudioMenu )
            drawAudioMenu( &painter );
        if ( m_showShaderInfo && m_actConfiguration && m_actConfiguration->renderPipeline() )
        {
            QString     info = m_actConfiguration->renderPipeline()->activeShaderInfo();
            QStringList rows = info.split( '\n' );
            // Grows upward: a chain lab adds up to ten lines of its chain.
            int y = height() - 120 - 28 * ( rows.size() > 3 ? rows.size() - 3 : 0 );
            if ( y < 40 )
                y = 40;
            painter.fillRect( 20, y - 24, 820, 28 * rows.size() + 16, QColor( 0, 0, 0, 175 ) );
            painter.setFont( QFont( "Consolas", 13, QFont::Bold ) );
            for ( int i = 0; i < rows.size(); ++i )
            {
                painter.setPen( QColor( 140, 230, 170 ) );
                painter.drawText( 34, y + i * 28, rows[i] );
            }
        }
        if ( m_recorder.recording() )
        {
            painter.setBrush( QColor( 230, 40, 40 ) );
            painter.setPen( Qt::NoPen );
            painter.drawEllipse( width() - 150, 26, 16, 16 );
            painter.setPen( QColor( 255, 255, 255 ) );
            painter.setFont( QFont( "Consolas", 12, QFont::Bold ) );
            painter.drawText( width() - 126, 39,
                              QString::fromUtf8( Strings::uiText( S_REC_FMT ) ).arg( m_recorder.frameCount() ) );
        }
        if ( card_alpha > 0.f )
            drawRemoteCard( &painter, card_alpha );
        if ( notice_alpha > 0.f )
            drawNotice( &painter, notice_alpha );
        m_osd.draw( &painter, width(), height() ); // last: on top of everything
        painter.end();
    }

    /*if (save_images)
    {
        QString efn = "G:/temp/file";
        efn.append( QString::number(counterExportImages) );
        efn.append(".png");

        //printf("Saving Image: %d\n", efn.data() );

        this->grabFrameBuffer().save(efn);
        counterExportImages++;
    }*/
}


/**  Draw the configuration picker (key '0').
 *
 * The list scrolls and filters: the digit keys only ever reached nine presets,
 * so anything past the ninth -- which the hidden-preset debug switch and a
 * saved Marked preset both push you past -- was simply unreachable. Arrow keys
 * move the cursor, typing narrows the list, Enter activates, and only a window
 * of the list is drawn so rows keep a readable size however many presets exist.
 *
 * Two things are marked, and they mean different things: the cursor bar is
 * where Enter would take you, the dot marks the preset that is actually
 * running. They coincide when the menu opens.
 **/
void GLwidget::showSelectConfigurationsMenu( QPainter *painter )
{
    const QVector<int> hits = configMenuMatches();
    const int          nr_configurations = hits.size();

    // Sized from height(), NOT m_height: m_height is in DEVICE pixels
    // (height() * devicePixelRatio) while QPainter works in logical ones, so
    // deriving a point size from it scales the text up by the display's DPI
    // factor on top of Qt's own scaling. The old code did exactly that.
    // Clamped to the range the other overlays use (fixed 12-14 pt).
    const int fontsize = std::max( 10, std::min( height() / 45, 18 ) );
    QFont     font = painter->font();
    font.setPointSize( fontsize );
    painter->setFont( font );
    QFontMetrics fm( painter->font() );

    const int line_h = fm.lineSpacing();
    const int pad_y = line_h / 2;
    // Leave room for the title and the key hint, and never fill the screen.
    const int max_rows = std::max( 3, static_cast<int>( ( height() * 0.72 - 4 * line_h ) / line_h ) );
    const int visible = std::max( 0, std::min( nr_configurations, max_rows ) );
    if ( nr_configurations > 0 )
        menuScroll( m_configMenuCursor, m_configMenuTop, nr_configurations, visible );
    else
        m_configMenuCursor = m_configMenuTop = 0;

    const QString title = QString::fromUtf8( Strings::uiText( S_MENU_CONFIG_TITLE ) )
                          + ( m_configMenuFilter.isEmpty()
                                  ? QString()
                                  : QString( "   \"%1\"" ).arg( m_configMenuFilter ) );
    const QString hint = QString::fromUtf8( Strings::uiText( S_MENU_NAV_HINT ) );

    int max_text_w = std::max( fm.horizontalAdvance( title ), fm.horizontalAdvance( hint ) );
    for ( int i = 0; i < static_cast<int>( m_configurationList.size() ); ++i )
        max_text_w = std::max( max_text_w, fm.horizontalAdvance(
                                               m_configurationList[i]->getConfigurationName() ) );

    const int box_w = std::min( width() - 40, max_text_w + 96 );
    const int box_h = ( std::max( visible, 1 ) + 3 ) * line_h + 2 * pad_y;
    const int box_x = ( width() - box_w ) / 2;
    const int box_y = ( height() - box_h ) / 2;

    painter->setPen( QColor( 210, 210, 210, 170 ) );
    painter->setBrush( QColor( 18, 18, 22, 210 ) );
    painter->drawRect( QRect( box_x, box_y, box_w, box_h ) );

    int y = box_y + pad_y + line_h;
    painter->setPen( QColor( 150, 200, 245, 235 ) );
    painter->drawText( box_x + ( box_w - fm.horizontalAdvance( title ) ) / 2, y, title );
    const int first_row_y = y + line_h / 2;

    // Remember where the rows landed so a click can be mapped back to one
    // without repeating any of this arithmetic.
    m_configMenuHit.box = QRect( box_x, box_y, box_w, box_h );
    m_configMenuHit.rowY0 = first_row_y + line_h - fm.ascent() - 2;
    m_configMenuHit.rowH = line_h;
    m_configMenuHit.rows = visible;
    m_configMenuHit.top = m_configMenuTop;

    y = first_row_y;
    for ( int row = 0; row < visible; ++row )
    {
        const int i = m_configMenuTop + row;
        y += line_h;

        const bool is_cursor = ( i == m_configMenuCursor );
        const bool is_active = ( m_configurationList[hits[i]] == m_actConfiguration );

        if ( is_cursor )
        {
            painter->setPen( Qt::NoPen );
            painter->setBrush( QColor( 70, 120, 190, 190 ) );
            painter->drawRect( QRect( box_x + 6, y - fm.ascent() - 2, box_w - 12, line_h ) );
        }

        // The running preset gets a dot, the cursor gets the bar. No row
        // numbers: they only ever existed to announce the digit shortcuts,
        // which are gone.
        const QString mark = is_active ? QString::fromUtf8( "\xE2\x97\x8F " ) : QString( "   " );
        const QString text = mark + m_configurationList[hits[i]]->getConfigurationName();

        if ( is_cursor )
            painter->setPen( QColor( 255, 255, 255, 255 ) );
        else if ( is_active )
            painter->setPen( QColor( 150, 200, 245, 235 ) );
        else
            painter->setPen( QColor( 205, 205, 210, 210 ) );
        painter->drawText( box_x + 34, y, text );
    }

    if ( visible == 0 )
    {
        y = first_row_y + line_h;
        painter->setPen( QColor( 200, 150, 150, 220 ) );
        painter->drawText( box_x + 34, y, QString::fromUtf8( Strings::uiText( S_MENU_NO_MATCH ) ) );
    }

    // Only claim there is more when there actually is.
    painter->setPen( QColor( 150, 150, 155, 200 ) );
    painter->setBrush( Qt::NoBrush );
    if ( m_configMenuTop > 0 )
        painter->drawText( box_x + box_w - 30, first_row_y,
                           QString::fromUtf8( "\xE2\x96\xB2" ) );
    if ( m_configMenuTop + visible < nr_configurations )
        painter->drawText( box_x + box_w - 30, y + line_h / 2,
                           QString::fromUtf8( "\xE2\x96\xBC" ) );

    QFont hf = font;
    hf.setPointSize( std::max( 9, static_cast<int>( fontsize * 0.8 ) ) );
    painter->setFont( hf );
    QFontMetrics hfm( hf );
    painter->setPen( QColor( 165, 165, 172, 215 ) );
    painter->drawText( box_x + ( box_w - hfm.horizontalAdvance( hint ) ) / 2,
                       box_y + box_h - pad_y - hfm.descent(), hint );
}

void GLwidget::applyQualityProfile()
{
    // A weak GPU (an integrated one, or a software renderer) cannot hold the
    // chain labs at full size: with qualityProfile=auto (the default) it gets,
    // for this session, the chain on a half grid and the adaptive render scale.
    // "high" never, "low" always.  Nothing of it is written to the ini.
    QSettings     s( SettingsFile::path(), QSettings::IniFormat );
    const QString profile = s.value( "qualityProfile", "auto" ).toString().toLower();
    const QString vendor = QString::fromLatin1( reinterpret_cast<const char *>( glGetString( GL_VENDOR ) ) );
    const QString renderer = QString::fromLatin1( reinterpret_cast<const char *>( glGetString( GL_RENDERER ) ) );
    const bool    weak = renderer.contains( "Intel", Qt::CaseInsensitive )
                         || vendor.contains( "Intel", Qt::CaseInsensitive )
                         || renderer.contains(
                             QRegularExpression( "Radeon\\(TM\\) Graphics|Radeon Graphics|Vega \\d+ Graphics" ) )
                         || renderer.contains( "llvmpipe" ) || renderer.contains( "Basic Render" );
    const bool    low = profile == "low" || ( profile == "auto" && weak );
    fprintf( stderr, "Quality profile: %s (%s, %s)\n", low ? "low" : "high", qPrintable( profile ),
             qPrintable( renderer ) );
    if ( !low )
        return;
    if ( EffectShader::M_ChainScale > 0.5f )
        EffectShader::M_ChainScale = 0.5f; // RenderPipeline saves the ini's own value, not this
    if ( !m_autoScale )
    {
        m_autoScale = true;
        m_autoScaleByProfile = true;
    }
}

void GLwidget::loadUiSettings()
{
    QSettings s( SettingsFile::path(), QSettings::IniFormat );
    m_autoConfig = s.value( "autoConfig", m_autoConfig ).toBool();
    m_autoScale = s.value( "autoScale", m_autoScale ).toBool();
    m_showNowPlaying = s.value( "nowPlaying", m_showNowPlaying ).toBool();
    m_lyricsMode = qBound( 0, s.value( "lyricsMode", m_lyricsMode ).toInt(), 2 );
    m_artistShow = s.value( "artistImages", m_artistShow ).toBool();
    m_videoEnabled = s.value( "videoEnabled", m_videoEnabled ).toBool();
    m_lyricsKinetic = s.value( "lyricsKinetic", m_lyricsKinetic ).toBool();
    m_keyFeedback = s.value( "keyFeedback", m_keyFeedback ).toBool();
    m_updateCheck = s.value( "updateCheck", m_updateCheck ).toBool();
    m_idleMinutes = qBound( 0, s.value( "idleMinutes", 0 ).toInt(), 1440 );
    m_idleDisplayOff = s.value( "idleDisplayOff", false ).toBool();
    // Only a LEARNED map counts. The ini of older versions holds the old default CC 1-3 for the knobs, written back
    // on every exit -- they were never chosen, and a keyboard's modulation wheel (CC 1) turned the reactivity.
    m_midiLearned = s.value( "midiLearned", false ).toBool();
    for ( int i = 0; i < MIDI_TARGETS; ++i )
        m_midiMap[i] = m_midiLearned ? s.value( QString( "midiMap%1" ).arg( i ), -1 ).toInt() : -1;
    RenderPipeline::setLightShow( s.value( "lightShow", RenderPipeline::lightShow() ).toBool() );
    RenderPipeline::setStrictLight( s.value( "lightProtectionStrict", RenderPipeline::strictLight() ).toBool() );
    // A persisted active config is the default start config, unless -c overrode it.
    if ( M_StartConfig.isEmpty() )
        M_StartConfig = s.value( "activeConfig", QString() ).toString();
    // Same "CLI wins" precedence for the web-remote port.
    if ( !M_RemotePortFromCli )
        M_RemotePort = s.value( "remotePort", M_RemotePort ).toInt();
    // OSC analysis output (TouchDesigner/Resolume/...): off unless configured.
    m_osc.configure( s.value( "oscHost", "127.0.0.1" ).toString(),
                     s.value( "oscPort", 0 ).toInt() );
    // Score cues IN, from a generator that wrote the music (CueReceiver.h).  Off by default: a
    // program that opens a listening port because it was installed is a surprise nobody asked for.
    m_cuePort = s.value( "cuePort", 0 ).toInt();
    m_cueBind = s.value( "cueBind", m_cueBind ).toString();
    Strings::setLanguage( Strings::fromCode(
        s.value( "language", Strings::toCode( Strings::language() ) ).toString().toLocal8Bit().constData() ) );
}

QList<QPair<QString, QVariant>> GLwidget::uiSettings() const
{
    QList<QPair<QString, QVariant>> v;
    if ( m_actConfiguration )
        v.append( { "activeConfig", m_actConfiguration->getConfigurationName() } );
    v.append( { "autoConfig", m_autoConfig } );
    v.append( { "autoScale", m_autoScaleByProfile ? false : m_autoScale } ); // a profile's session value is not
                                                                             // the user's
    v.append( { "nowPlaying", m_showNowPlaying } );
    v.append( { "lyricsMode", m_lyricsMode } );
    v.append( { "artistImages", m_artistShow } );
    v.append( { "videoEnabled", m_videoEnabled } );
    v.append( { "lyricsKinetic", m_lyricsKinetic } );
    v.append( { "updateCheck", m_updateCheck } );
    v.append( { "idleMinutes", m_idleMinutes } );
    v.append( { "idleDisplayOff", m_idleDisplayOff } );
    v.append( { "midiLearned", m_midiLearned } );
    for ( int i = 0; i < MIDI_TARGETS; ++i )
        v.append( { QString( "midiMap%1" ).arg( i ), m_midiMap[i] } );
    v.append( { "lightShow", RenderPipeline::lightShow() } );
    v.append( { "lightProtectionStrict", RenderPipeline::strictLight() } );
    v.append( { "remotePort", M_RemotePort } );
    v.append( { "cuePort", m_cuePort } );
    v.append( { "cueBind", m_cueBind } );
    v.append( { "language", QString::fromLatin1( Strings::toCode( Strings::language() ) ) } );
    return v;
}

void GLwidget::rememberUiSettings()
{
    for ( const auto &kv : uiSettings() )
        SettingsFile::remember( kv.first, kv.second );
}

QString GLwidget::saveUiSettings( bool everything )
{
    QSettings s( SettingsFile::path(), QSettings::IniFormat );
    for ( const auto &kv : uiSettings() )
        SettingsFile::store( s, kv.first, kv.second, everything );
    s.sync();
    return SettingsFile::failure( s );
}

void GLwidget::saveAllSettings( bool everything )
{
    QString why = RenderPipeline::saveSettings( everything );
    if ( why.isEmpty() )
        why = saveUiSettings( everything );
    else
        saveUiSettings( everything );
    if ( !why.isEmpty() )
    {
        fprintf( stderr, "SETTINGS: %s is %s - nothing was saved\n",
                 qPrintable( QFileInfo( SettingsFile::path() ).absoluteFilePath() ), qPrintable( why ) );
        notify( QString::fromUtf8( Strings::uiText( S_NOTICE_SETTINGS_READONLY_FMT ) )
                    .arg( QDir::toNativeSeparators( QFileInfo( SettingsFile::path() ).absoluteFilePath() ) ) );
    }
}

void GLwidget::checkSettingsWritable()
{
    // QSettings writes through a temporary file beside the ini and renames it, so the folder must take a new file.
    const QFileInfo ini( SettingsFile::path() );
    QTemporaryFile  probe( ini.absolutePath() + "/.kaleidoscope_write_test_XXXXXX" );
    if ( probe.open() && ( !ini.exists() || ini.isWritable() ) )
        return;
    fprintf( stderr, "SETTINGS: %s cannot be written - settings, taste and scene memory will not be kept\n",
             qPrintable( ini.absoluteFilePath() ) );
    notify( QString::fromUtf8( Strings::uiText( S_NOTICE_SETTINGS_READONLY_FMT ) )
                .arg( QDir::toNativeSeparators( ini.absoluteFilePath() ) ),
            15000 );
}

void GLwidget::updateRest( const AudioFeatures &audio )
{
    const qint64 now = m_fpsTimer.elapsed();
    const qint64 dt = m_restLast > 0 ? std::min<qint64>( now - m_restLast, 1000 ) : 0;
    m_restLast = now;
    // Digital silence: every band at about -60 dB or below before the automatic gain -- not merely quiet, so a
    // drone or an ambient passage never counts, and neither does speech.
    const bool silent = audio.rawLevel < 0.02f;
    m_restSilentMs = silent ? m_restSilentMs + dt : 0;
    m_restSoundMs = silent ? 0 : m_restSoundMs + dt;

    // The sleep timer: its last two minutes dim the picture steadily, then it rests like after silence.
    if ( m_sleepAt > 0 && m_restState == RestE::AWAKE )
        RenderPipeline::setDim( static_cast<float>( m_sleepAt - now ) / 120000.f );

    if ( m_restState == RestE::AWAKE )
    {
        // KALEIDO_IDLE_SECS: the same in seconds, for a test run.
        static const int IdleSecs = qEnvironmentVariableIntValue( "KALEIDO_IDLE_SECS" );
        const qint64     idle_ms = IdleSecs > 0 ? IdleSecs * 1000LL : m_idleMinutes * 60000LL;
        const bool       idle = idle_ms > 0 && m_restSilentMs >= idle_ms;
        const bool       sleep = m_sleepAt > 0 && now >= m_sleepAt;
        if ( idle || sleep )
        {
            m_restState = RestE::FADING;
            m_restSince = now;
            m_restBySleep = sleep;
            RenderPipeline::setRestDim( true ); // the blackout's slew: ~0.35 s to black
            fprintf( stderr, "REST: %s - fading out\n", sleep ? "sleep timer ended" : "silence" );
            notify( sleep ? QString::fromUtf8( Strings::uiText( S_NOTICE_SLEEP ) )
                          : QString::fromUtf8( Strings::uiText( S_NOTICE_REST_FMT ) ).arg( m_idleMinutes ),
                    4000 );
        }
    }
    else if ( m_restState == RestE::FADING && now - m_restSince > 1500 )
    {
        m_restState = RestE::RESTING;
        m_restLastPaint = now;
#ifdef WIN32
        // Off by default: many projectors fall into standby without a signal and do not wake without their remote.
        // System standby stays blocked either way.
        if ( m_idleDisplayOff )
        {
            SetThreadExecutionState( ES_CONTINUOUS | ES_SYSTEM_REQUIRED );
            m_displayReleased = true;
        }
#endif
        fprintf( stderr, "REST: resting%s\n", m_displayReleased ? " (display may sleep)" : "" );
    }
    if ( m_restState != RestE::AWAKE && !m_restBySleep && m_restSoundMs >= 1000 )
        wakeFromRest( "music" );
}

bool GLwidget::wakeFromRest( const char *why )
{
    if ( m_restState == RestE::AWAKE )
        return false;
    m_sleepAt = 0; // the sleep timer, if it put the show to rest, is used up
    m_sleepMinutes = 0;
    RenderPipeline::setDim( 1.f );
#ifdef WIN32
    if ( m_displayReleased )
        SetThreadExecutionState( ES_CONTINUOUS | ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED );
#endif
    m_displayReleased = false;
    if ( m_restState == RestE::RESTING && m_actConfiguration && m_actConfiguration->renderPipeline() )
        m_actConfiguration->renderPipeline()->restartSceneClocks();
    m_restState = RestE::AWAKE;
    m_restSilentMs = 0;
    RenderPipeline::setRestDim( false ); // the blackout's slew fades the picture back in
    fprintf( stderr, "REST: woken (%s)\n", why );
    update();
    return true;
}

void GLwidget::updateSongBoundary( const AudioFeatures &audio )
{
    const qint64 now = m_fpsTimer.elapsed();
    bool         boundary = false;
    const char  *why = "";

    // The silence between tracks (the analyzer began the song itself).
    if ( audio.trackChange )
    {
        boundary = true;
        why = "silence";
    }

    // The media session's title: a title that has stood for 3 s, whether or not it is shown (until 16.10.2026 it
    // only steered the title overlay, and only with 'p' on).  Gapless playback and crossfades have no silence --
    // this is their boundary.  The first title of the session is no change.
    if ( m_nowPlaying )
    {
        const QString key = ( m_nowPlaying->artist().trimmed() + "|" + m_nowPlaying->title().trimmed() ).toLower();
        if ( key == "|" || key == m_songKey )
            m_songCandidate.clear();
        else if ( key != m_songCandidate )
        {
            m_songCandidate = key;
            m_songCandidateSince = now;
        }
        else if ( now - m_songCandidateSince >= 3000 )
        {
            const bool first = m_songKey.isEmpty();
            m_songKey = key;
            m_songCandidate.clear();
            if ( !first && audio.musicPresence > 0.5f )
            {
                boundary = true;
                why = "title";
                if ( m_audioAnalyzer )
                    m_audioAnalyzer->newSong();
            }
        }
    }

    // One boundary, whichever source saw it first: the other one within 5 s is the same song change.
    if ( !boundary || now - m_lastSongBoundary < 5000 )
        return;
    m_lastSongBoundary = now;
    fprintf( stderr, "SONG: new song (%s)\n", why );
    // Not under KALEIDO_SCENE_SWEEP, where the sweep decides what is on screen.  Not a skip either: the music
    // changed, nobody judged the scene -- so no taste malus, and a calm preset fades instead of cutting.
    if ( !sweepActive() && m_actConfiguration && m_actConfiguration->renderPipeline() )
        m_actConfiguration->renderPipeline()->newSong();
}

void GLwidget::notify( const QString &text, int ms )
{
    fprintf( stderr, "NOTICE: %s\n", qPrintable( text ) );
    m_notice = text;
    m_noticeAt = -1; // starts with the next frame (the frame timer may not run yet)
    m_noticeMs = ms;
    update();
}

void GLwidget::feedback( const QString &text, int ms )
{
    if ( m_keyFeedback )
        notify( text, ms );
    else
        fprintf( stderr, "FEEDBACK: %s\n", qPrintable( text ) );
}

float GLwidget::noticeAlpha()
{
    if ( m_notice.isEmpty() )
        return 0.f;
    const qint64 now = m_fpsTimer.elapsed();
    if ( m_noticeAt < 0 )
        m_noticeAt = now;
    const float t = static_cast<float>( now - m_noticeAt );
    if ( t >= static_cast<float>( m_noticeMs ) )
    {
        m_notice.clear();
        return 0.f;
    }
    return std::min( { 1.f, t / 250.f, ( static_cast<float>( m_noticeMs ) - t ) / 250.f } );
}

void GLwidget::drawNotice( QPainter *painter, float alpha )
{
    // Sized by the output's height, so it reads on a 720p projector and on a 4K wall alike.
    QFont        f( "Segoe UI", std::max( 11, height() / 60 ) );
    QFontMetrics fm( f );
    const int    pad = fm.height() / 2;
    const int    w = std::min( width() - 40, fm.horizontalAdvance( m_notice ) + 4 * pad );
    const int    h = fm.height() + 2 * pad;
    const QRect  box( ( width() - w ) / 2, height() - h - height() / 12, w, h );
    painter->fillRect( box, QColor( 0, 0, 0, static_cast<int>( 190.f * alpha ) ) );
    painter->fillRect( box.x(), box.y(), 5, h, QColor( 255, 190, 80, static_cast<int>( 255.f * alpha ) ) );
    painter->setFont( f );
    painter->setPen( QColor( 255, 255, 255, static_cast<int>( 255.f * alpha ) ) );
    painter->drawText( box.adjusted( 2 * pad, 0, -pad, 0 ), Qt::AlignVCenter | Qt::AlignLeft,
                       fm.elidedText( m_notice, Qt::ElideMiddle, w - 3 * pad ) );
}

// Capture the current frame so it can be cross-faded out over the new config.
void GLwidget::beginConfigFade()
{
    m_fadePixmap = QPixmap::fromImage( grabFramebuffer() );
    m_fadeStart = m_fpsTimer.elapsed();
}

void GLwidget::switchConfig( Configuration *cfg )
{
    // Only record the request here; it is applied in timerEvent (outside paintGL),
    // because the fade capture (grabFramebuffer) re-renders and must not re-enter
    // paintGL when this is reached via auto-config / track-change during draw().
    if ( cfg == 0 || cfg == m_actConfiguration )
        return;
    m_pendingConfig = cfg;
}

bool GLwidget::selectConfigByName( const QString &name )
{
    // Hidden presets are reachable by NAME on purpose (dev/CI door);
    // only the index-based selection paths never see them.
    for ( const auto *lst : { &m_configurationList, &m_hiddenConfigurations } )
        for ( Configuration *c : *lst )
            if ( c->getConfigurationName()
                     .compare( name, Qt::CaseInsensitive )
                 == 0 )
            {
                if ( c == m_actConfiguration )
                    return false; // already active
                switchConfig( c );
                return true;
            }
    return false;
}

void GLwidget::updateAutoConfig( const AudioFeatures &f )
{
    if ( !m_autoConfig )
        return;

    // Map the sustained mood to a configuration bucket (2026-07 preset set).
    //   0 ambient/drone -> Ambient, 1 calm -> Galerie,
    //   2 normal -> Allround,       3 energetic -> Club.
    int bucket;
    if ( f.ambientFactor > 0.6f )
        bucket = 0;
    else if ( f.arousal < 0.33f )
        bucket = 1;
    else if ( f.arousal > 0.66f )
        bucket = 3;
    else
        bucket = 2;
    static const char *names[4] = { "Ambient", "Galerie", "Allround", "Club" };

    const qint64 now = m_fpsTimer.elapsed();
    if ( bucket != m_moodBucket )
    {
        m_moodBucket = bucket;
        m_moodBucketSince = now;
    }

    // Only switch once the mood has held for ~8 s and at least ~30 s after the
    // previous switch, so the configuration doesn't flip back and forth.
    if ( now - m_moodBucketSince > 8000 && now - m_lastAutoSwitch > 30000 )
    {
        if ( selectConfigByName( QString::fromLatin1( names[bucket] ) ) )
        {
            m_lastAutoSwitch = now;
            fprintf( stderr, "Auto-config: switched to '%s'\n", names[bucket] );
        }
    }
}

void GLwidget::applyDisplayRate()
{
    int refresh_ms = 16;
    if ( QScreen *sc = screen() )
    {
        const qreal hz = sc->refreshRate();
        if ( hz > 20.0 )                                  // ignore bogus/unknown values
            refresh_ms = static_cast<int>( 1000.0 / hz ); // 60 Hz -> 16, 144 Hz -> 6, 240 Hz -> 4
    }
    if ( refresh_ms < 1 )
        refresh_ms = 1;
    // frameDivisor (ini): every n-th refresh -- the swap interval waits for it (main()), the timer asks for it.
    refresh_ms *= M_FrameDivisor;
    m_displayHz = ( refresh_ms > 0 ) ? 1000.0f / static_cast<float>( refresh_ms ) : 60.0f;
    // The cube detail budget weighs the frame rate against what the panel shows (RenderPipeline::stepCubeBudget()),
    // and with a divisor against what it is asked to show; the adaptive resolution budgets the GPU time by it.
    RenderPipeline::M_DisplayHz = ( screen() && screen()->refreshRate() > 20.0 )
                                      ? static_cast<float>( screen()->refreshRate() ) / M_FrameDivisor
                                      : m_displayHz;
    if ( RenderPipeline::M_DisplayHz > 20.f )
        m_displayHz = RenderPipeline::M_DisplayHz;
    fprintf( stderr, "Render timer: %d ms (%.1f Hz display%s)\n", refresh_ms, screen() ? screen()->refreshRate() : 0.0,
             M_FrameDivisor > 1 ? qPrintable( QString( ", every %1. refresh" ).arg( M_FrameDivisor ) ) : "" );
    if ( m_renderTimer )
        killTimer( m_renderTimer );
    m_renderTimer = startTimer( refresh_ms );
    m_gpuMsCount = 0; // a new rate, a new budget: measure afresh
}

void GLwidget::updateAdaptiveScale()
{
    if ( !m_autoScale )
        return;

    // A scene fade beginning: where a change of resolution goes unseen -- the picture changes anyway.
    RenderPipeline *rp = m_actConfiguration ? m_actConfiguration->renderPipeline() : nullptr;
    const bool      fading = rp && rp->sceneTransitioning();
    const bool      fade_began = fading && !m_scaleWasFading;
    // A fade draws two scenes: its frames say nothing about the one that stays, so the emergency below measures
    // from the fade's end.
    if ( !fading && m_scaleWasFading )
        m_gpuMsCount = 0;
    m_scaleWasFading = fading;

    const qint64 now = m_fpsTimer.elapsed();
    const float  min_scale = 0.35f;
    const float  scale = RenderPipeline::renderScale();
    float        next = scale;
    bool         emergency = false;

    // The budget is one frame of what the panel is asked to show: its full rate, or with frameDivisor exactly the
    // part asked for.  Until 16.10.2026 the fps decided, against a target capped at 72 and in the middle of a scene:
    // with vsync the fps stand at the panel's rate whatever the headroom, so on a 120-Hz panel every rate between
    // 54 and 119 left the scale where it was, at an uneven pace -- and each step rebuilt the labs' textures in view.
    const float hz = m_displayHz > 20.f ? m_displayHz : 60.f;
    const float budget = 1000.f / hz;
    if ( m_gpuQueries )
    {
        if ( fade_began && rp )
        {
            // The scale for the scene coming in, from its own GPU time when it last stood (m_sceneGpuAt1, per pixel
            // at scale 1): the largest scale whose predicted time stays under 80 % of the budget. A scene not seen
            // yet gets the full scale; were it too heavy, the step below catches it, and next time it is known.
            // (Judged by the recent frames instead, a heavy scene leaving made a light one coarse.)
            const QStringList nm = rp->sceneNames();
            const int         nx = rp->nextSceneIndex();
            next = m_autoScaleMax;
            if ( nx >= 0 && nx < nm.size() )
            {
                const auto it = m_sceneGpuAt1.constFind( nm[nx] );
                if ( it != m_sceneGpuAt1.constEnd() )
                {
                    next = min_scale;
                    for ( float sc = m_autoScaleMax; sc >= min_scale - 1e-4f; sc -= 0.05f )
                        if ( it.value() * sc * sc <= 0.8f * budget )
                        {
                            next = sc;
                            break;
                        }
                }
            }
        }
        else if ( !fading && m_gpuMsCount >= 60 && now - m_lastScaleAdjust >= 1500 )
        {
            // In the middle of a scene only an emergency: the 90th percentile of the recent frames' GPU time over
            // 1.5 times the budget, which is worse to watch than a change of resolution.
            const int          n = std::min( m_gpuMsCount, static_cast<int>( m_gpuMs.size() ) );
            std::vector<float> v( m_gpuMs.begin(), m_gpuMs.begin() + n );
            std::nth_element( v.begin(), v.begin() + n * 9 / 10, v.end() );
            if ( v[n * 9 / 10] > 1.5f * budget && scale > min_scale )
            {
                next = scale - 0.10f;
                emergency = true;
            }
        }
    }
    else if ( m_fpsValue > 0 && now - m_lastScaleAdjust >= 1500 )
    {
        // No GPU timer queries (an old driver): the frame rate against the panel's, as before, applied at a fade.
        if ( m_fpsValue < 0.75f * hz && scale > min_scale )
            next = scale - 0.10f;
        else if ( m_fpsValue > 0.95f * hz && scale < m_autoScaleMax )
            next = scale + ( scale >= 1.0f ? 0.10f : 0.05f );
        emergency = m_fpsValue < 0.5f * hz;
    }

    next = std::clamp( next, min_scale, m_autoScaleMax );
    if ( std::fabs( next - scale ) > 1e-3f && ( fade_began || emergency ) )
    {
        RenderPipeline::setRenderScale( next );
        if ( rp )
            rp->resize( m_width, m_height );
        m_lastScaleAdjust = now;
        m_gpuMsCount = 0; // the next decision measures the new scale
        fprintf( stderr, "Adaptive scale: %.2f (%d FPS, %s)\n", next, m_fpsValue,
                 emergency ? "over budget" : "for the scene coming in" );
    }
}

/**  Double-click toggles fullscreen.
 *
 * It used to call exit(0) instead, with this toggle sitting unreachable
 * underneath it -- a stray double-click on the window ended the show, which is
 * a brutal answer to a slip of the hand. Quitting already has two deliberate
 * keys ('Esc' and 'q'); a mouse gesture should not be a third.
 **/
void GLwidget::mouseDoubleClickEvent( QMouseEvent *e )
{
    QWidget::mouseDoubleClickEvent( e );

    if ( isFullScreen() )
        setWindowState( Qt::WindowMaximized );
    else
        setWindowState( Qt::WindowFullScreen );
}

void GLwidget::timerEvent( QTimerEvent * )
{
    M_Heartbeat.fetch_add( 1, std::memory_order_relaxed ); // the hang watch's sign of life (main.cpp)
    // Apply a requested configuration switch here, outside paintGL: capture the
    // current (old) frame for the cross-fade, then stop/start the configurations.
    if ( m_pendingConfig && m_pendingConfig != m_actConfiguration )
    {
        beginConfigFade();
        m_actConfiguration->stop();
        m_actConfiguration = m_pendingConfig;
        m_actConfiguration->start( m_width, m_height );
        m_sceneThumbs.clear(); // indices now name a different config's scene list
        m_pendingConfig = nullptr;
    }

    // At rest: five frames a second are plenty for a black window (the GPU is shared on many machines), the full
    // rate while the menu is open.
    if ( m_restState == RestE::RESTING && !m_osd.isOpen() )
    {
        if ( m_fpsTimer.elapsed() - m_restLastPaint < 200 )
            return;
        m_restLastPaint = m_fpsTimer.elapsed();
    }

    // Schedule a repaint; the actual rendering happens in paintGL() where the
    // GL context is guaranteed current (QOpenGLWidget requirement).
    update();
}


bool GLwidget::eventFilter( QObject *obj, QEvent *ev )
{
    if ( m_export && !m_exportEnded && ev->type() == QEvent::Close )
    {
        VideoExport::requestCancel();
        ev->ignore();
        return true;
    }
    return QOpenGLWidget::eventFilter( obj, ev );
}

void GLwidget::beginExport()
{
    // What the export renders is the show as the ini has it -- reactivity, trails,
    // mood, the light show -- minus what only means something live: the
    // latency lead compensates loopback and display delays the file does not
    // have, stereo packing would halve the picture, and the adaptive scale and
    // auto-config are for a live audience.  Nothing of it is saved.
    RenderPipeline::setLatency( 0.f );
    RenderPipeline::M_StereoMode = 0;
    m_autoScale = false;
    m_autoConfig = false;
    window()->installEventFilter( this ); // the close button stops the export properly

    if ( !m_export->beginGL() )
    {
        m_exportEnded = true;
        QTimer::singleShot( 0, qApp, []
        { QCoreApplication::exit( 2 ); } );
        return;
    }
    EngineClock::startVirtual(); // from here on, every engine timer runs on the frames
    VideoExport::watchStdin();   // the export tool's cancel button
#ifdef WIN32
    // A long export must not be cut off by standby; the display may sleep.
    SetThreadExecutionState( ES_CONTINUOUS | ES_SYSTEM_REQUIRED );
#endif
    QTimer::singleShot( 0, this, [this]
    { exportStep(); } );
}

void GLwidget::exportStep()
{
    if ( !m_export || m_exportEnded )
        return;
    makeCurrent();
    RenderPipeline *rp = m_actConfiguration->renderPipeline();
    QElapsedTimer   slice;
    slice.start();
    bool stop = false;
    // A slice of about 50 ms, then the event loop: the preview repaints and the
    // window stays responsive (Esc, the close button) however long the video is.
    for ( ;; )
    {
        stop = VideoExport::cancelRequested() || m_export->failed() || m_export->finished();
        if ( stop || slice.elapsed() >= 50 )
            break;
        const long long k = m_export->nextSubFrame();
        // A fade waiting for its model waits here, in render time -- live it is
        // held in show time instead (RenderPipeline::paint()).
        rp->awaitIncomingMesh( 15000 );
        EngineClock::setVirtualSeconds( m_export->engineSeconds( k ) );
        AudioFeatures audio = m_export->featuresFor( k );
        m_eventLatch.apply( audio ); // several analyzer blocks per frame: no beat or onset lost between them
        // A sweep in an export walks on the frame clock: a catalogue rendered as fast as the GPU allows, every scene
        // at a known time of the video (Tools/render_catalog_export.py).
        stepSweeps( std::llround( m_export->engineSeconds( k ) * 1000.0 ) );
        if ( audio.trackChange && !sweepActive() )
            rp->requestSceneChange( false );
        if ( m_export->titleDue( k ) )
            rp->showTitle( m_export->title(), m_export->artist() );
        rp->setDefaultFBO( m_export->renderFbo() );
        rp->paint( m_rotationMatrix, m_xTrans, m_yTrans, m_zTrans, audio );
        m_export->subFrameDone( k );
    }
    int code = -1;
    if ( stop )
    {
        code = m_export->endGL( VideoExport::cancelRequested() && !m_export->finished() );
        m_exportEnded = true;
    }
    doneCurrent();
    update();
    if ( code >= 0 )
        QTimer::singleShot( 300, qApp, [code]
        { QCoreApplication::exit( code ); } );
    else
        QTimer::singleShot( 0, this, [this]
        { exportStep(); } );
}

void GLwidget::paintExportPreview()
{
    m_export->drawPreview( defaultFramebufferObject(), m_width, m_height );
    QPainter painter( this );
    painter.setFont( QFont( "Segoe UI", 11 ) );
    const QString line = m_exportEnded ? QStringLiteral( "Video-Export" ) : m_export->statusLine();
    const int     tw = painter.fontMetrics().horizontalAdvance( line ) + 24;
    painter.fillRect( 12, height() - 44, tw, 32, QColor( 0, 0, 0, 170 ) );
    painter.setPen( QColor( 235, 235, 235 ) );
    painter.drawText( 24, height() - 22, line );
    painter.end();
}

void GLwidget::resizeGL( int /*wLogical*/, int /*hLogical*/ )
{
    // QOpenGLWidget calls resizeGL() with LOGICAL (device-independent) pixels,
    // but its default framebuffer is sized to size() * devicePixelRatio().
    // Size the viewport / FBOs to the physical framebuffer so the visualization
    // fills the whole widget (and stays sharp) on high-DPI / scaled displays.
    const qreal dpr = devicePixelRatioF();
    m_width = static_cast<int>( this->width() * dpr + 0.5 );
    m_height = static_cast<int>( this->height() * dpr + 0.5 );
    if ( m_export )
        return; // the pipeline renders at the video's size; the window is only the preview

    // Lightweight resize: keeps the loaded image textures + shader programs and
    // only re-sizes the off-screen buffers (no reload, no GL-object leak).
    // (The one-time full build happens in Configuration::start -> reinit.)
    m_actConfiguration->renderPipeline()->resize( m_width, m_height );
}

// set rotation Matrix for trackball to Identity
void GLwidget::resetRotation()
{
    /*for(int i = 1; i < 4; i++)
    {
        for(int j = 0; j < i; j++)
        {
            m_rotationMatrix[i*4+j] = m_rotationMatrix[j*4+i]= 0.0;
        }
    }
    m_rotationMatrix[0] = m_rotationMatrix[5] = m_rotationMatrix[10] = m_rotationMatrix[15] = 1.0;*/
}

/**  Click inside an open overlay menu picks a row; click outside closes it.
 *
 * The row geometry comes from MenuHit, filled while drawing, so this never has
 * to reproduce the layout arithmetic -- and cannot drift out of step with it.
 * The event's position is tested against the open menu's rows.
 **/
void GLwidget::mousePressEvent( QMouseEvent *e )
{
    const QPoint p = e->position().toPoint();

    if ( m_showSelectConfigurationMenu )
    {
        const int row = menuRowAt( m_configMenuHit, p );
        if ( row >= 0 )
        {
            const QVector<int> hits = configMenuMatches();
            m_showSelectConfigurationMenu = false;
            if ( row < hits.size() && m_configurationList[hits[row]] != m_actConfiguration )
                switchConfig( m_configurationList[hits[row]] );
            m_configMenuFilter.clear();
        }
        else if ( !m_configMenuHit.box.contains( p ) )
            m_showSelectConfigurationMenu = false;
        return;
    }
    if ( m_showAudioMenu )
    {
        const int row = menuRowAt( m_audioMenuHit, p );
        if ( row >= 0 )
        {
            const QVector<int> hits = audioMenuMatches();
            m_showAudioMenu = false;
            if ( row < hits.size() )
                selectAudioDevice( hits[row] );
            m_audioMenuFilter.clear();
        }
        else if ( !m_audioMenuHit.box.contains( p ) )
            m_showAudioMenu = false;
        return;
    }
}

/**  The wheel scrolls whichever overlay menu is open.
 *
 * Without a menu open it does nothing, rather than falling through to some
 * other meaning -- the wheel has no job in the visualiser itself.
 **/
void GLwidget::wheelEvent( QWheelEvent *e )
{
    const int steps = e->angleDelta().y() / 120;
    if ( steps == 0 )
        return;
    if ( m_osd.isOpen() )
    {
        for ( int i = 0; i < std::abs( steps ); ++i )
            m_osd.handleKey( steps > 0 ? Qt::Key_Up : Qt::Key_Down );
        e->accept();
        return;
    }

    int *cursor = nullptr;
    int  count = 0;
    if ( m_showSelectConfigurationMenu )
    {
        cursor = &m_configMenuCursor;
        count = configMenuMatches().size();
    }
    else if ( m_showAudioMenu )
    {
        cursor = &m_audioMenuCursor;
        count = audioMenuMatches().size();
    }
    if ( !cursor || count <= 0 )
        return;

    // Clamp rather than wrap: a wheel flick past the end should stop there, not
    // reappear at the top, which is disorienting when the list is long.
    *cursor = std::max( 0, std::min( *cursor - steps, count - 1 ) );
    e->accept();
}

void GLwidget::mouseMoveEvent( QMouseEvent *e /*the event*/ )
{
    /*int dx = e->x() - m_lastPos.x();
    int dy = e->y() - m_lastPos.y();

    bool ctrl_key = e->modifiers() & Qt::MetaModifier;		// only needed for Mac OS X, but doesn't hurt on other OSes

    if ( (e->buttons() & Qt::RightButton) || ctrl_key ) // translation along z-Axis
    {
        m_zTrans += 0.2 * dy;
    }
    else if ( e->buttons() & Qt::MidButton ) // translation in xy-Plane
    {
        m_xTrans += 0.01 * dx;
        m_yTrans -= 0.01 * dy;
    }
    else if (e->buttons() & Qt::LeftButton)	// rotation
    {
        // openGL multiplies new transformations on the right
        // we want to apply rotation on the left
        glPushMatrix(); // push current openGL transform matrix to stack
        glLoadIdentity();
        glRotatef(0.5*dx,0.0, 1.0, 0.0);
        glRotatef(0.5*dy,1.0, 0.0, 0.0);
        glMultMatrixf(m_rotationMatrix);
        glGetFloatv(GL_MODELVIEW_MATRIX,m_rotationMatrix);
        glPopMatrix();
    }
    m_lastPos = e->pos();
    e->accept();
    updateGL();*/
}


// Live audio-feature panel (toggled with the 'i' key) — handy for demos and for
// tuning the mapping.  Drawn with QPainter over the rendered frame.
void GLwidget::drawFeatureOverlay( QPainter *painter, const AudioFeatures &f )
{
    struct Row
    {
        const char *name;
        float       val;
    };
    const float bpm = 40.f + f.estimatedBPM * 160.f;
    Row         rows[] = {
        { "musicPresence", f.musicPresence },
        { "arousal", f.arousal },
        { "valence", f.valence },
        { "tempo", f.estimatedBPM },
        { "mode maj/min", f.musicalMode },
        { "keyClarity", f.keyClarity },
        { "rhythm", f.rhythmStrength },
        { "beat", f.beatDecay },
        { "onset", f.onsetStrength },
        { "downbeat", f.downbeat },
        { "beatPhase", f.beatPhase },
        { "flux", f.spectralFlux },
        { "centroid", f.spectralCentroid },
        { "roughness", f.roughness },
        { "sharpness", f.sharpness },
        { "stereoWidth", f.stereoWidth },
        { "level", f.overallLevel },
    };

    // What the PICTURE does, not what the music does.  The same two numbers
    // the offline screening sorts the whole catalogue by -- live here, so a
    // shader change can be watched instead of rendered, extracted and then
    // watched.
    float pic_std = 0.f, pic_mot = 0.f;
    if ( m_actConfiguration && m_actConfiguration->renderPipeline() )
    {
        pic_std = m_actConfiguration->renderPipeline()->liveStructure();
        pic_mot = m_actConfiguration->renderPipeline()->liveMotion();
    }
    const Row pic_rows[] = {
        { "BILD Struktur", pic_std },
        { "BILD Bewegung", pic_mot * 8.f }, // x8: otherwise the bar sticks to the edge
    };
    const int n = static_cast<int>( sizeof( rows ) / sizeof( rows[0] ) );
    const int x = 24, y0 = 66, lh = 22, bw = 130, bh = 12;

    // +3 lines: the blank line and the two BILD (picture) values below it.
    painter->fillRect( x - 14, 14, 360, ( n + 3 ) * lh + 68, QColor( 0, 0, 0, 160 ) );
    painter->setFont( QFont( "Consolas", 12, QFont::Bold ) );
    painter->setPen( QColor( 120, 200, 255 ) );
    painter->drawText( x, 34, QString::fromUtf8( Strings::uiText( S_FEATURE_TITLE_FMT ) ).arg( m_fpsValue ) );

    // Live-tunable look knobs (hotkeys).
    painter->setFont( QFont( "Consolas", 10 ) );
    painter->setPen( QColor( 170, 205, 170 ) );
    painter->drawText( x, 54,
                       QString::fromUtf8( Strings::uiText( S_FEATURE_STATUS_FMT ) )
                           .arg( RenderPipeline::reactivity(), 0, 'f', 1 )
                           .arg( RenderPipeline::trails(), 0, 'f', 2 )
                           .arg( RenderPipeline::mood(), 0, 'f', 1 )
                           .arg( m_autoConfig ? Strings::uiText( S_ON ) : Strings::uiText( S_OFF ) )
                           .arg( RenderPipeline::renderScale(), 0, 'f', 2 )
                           .arg( m_autoScale ? Strings::uiText( S_ON ) : Strings::uiText( S_OFF ) ) );

    painter->setFont( QFont( "Consolas", 11 ) );
    for ( int i = 0; i < n; ++i )
    {
        int   ry = y0 + i * lh;
        float v = rows[i].val;
        if ( v < 0.f )
            v = 0.f;
        if ( v > 1.f )
            v = 1.f;
        painter->setPen( QColor( 205, 214, 230 ) );
        painter->drawText( x, ry, QString( rows[i].name ) );
        int bx = x + 150;
        painter->fillRect( bx, ry - 11, bw, bh, QColor( 40, 45, 60 ) );
        // musicPresence bar turns amber when it drops (speech / non-music mode).
        QColor bar_col = ( i == 0 && f.musicPresence < 0.5f ) ? QColor( 255, 170, 60 )
                                                              : QColor( 90, 170, 255 );
        painter->fillRect( bx, ry - 11, static_cast<int>( bw * v ), bh, bar_col );
        painter->setPen( QColor( 255, 255, 255 ) );
        QString txt = ( i == 3 ) ? QString::number( bpm, 'f', 0 )
                                 : QString::number( rows[i].val, 'f', 2 );
        painter->drawText( bx + bw + 8, ry, txt );
    }

    // And below, set apart: what the PICTURE does.  Green as soon as the
    // scene lies above the catalogue's 10 % quantile (0.045) -- red below,
    // because that is the threshold at which a scene stands out in the
    // screening.
    const int pn = static_cast<int>( sizeof( pic_rows ) / sizeof( pic_rows[0] ) );
    for ( int i = 0; i < pn; ++i )
    {
        int   ry = y0 + ( n + 1 + i ) * lh;
        float v = pic_rows[i].val;
        if ( v < 0.f )
            v = 0.f;
        if ( v > 1.f )
            v = 1.f;
        painter->setPen( QColor( 205, 214, 230 ) );
        painter->drawText( x, ry, QString( pic_rows[i].name ) );
        int bx = x + 150;
        painter->fillRect( bx, ry - 11, bw, bh, QColor( 40, 45, 60 ) );
        const bool thin = ( i == 0 ) ? ( pic_std < 0.045f ) : ( pic_mot < 0.0025f );
        painter->fillRect( bx, ry - 11, static_cast<int>( bw * v ), bh,
                           thin ? QColor( 230, 90, 80 ) : QColor( 110, 210, 130 ) );
        painter->setPen( QColor( 255, 255, 255 ) );
        painter->drawText( bx + bw + 8, ry,
                           QString::number( i == 0 ? pic_std : pic_mot, 'f', 4 ) );
    }
}

void GLwidget::drawHelpOverlay( QPainter *painter )
{
    struct Line
    {
        const char *key;
        StrIdE      desc;
    };
    static const Line Lines[] = {
        { "h", S_HELP_H },
        { "Enter", S_HELP_MENU },
        { "⏭ ⏯ ⏹", S_HELP_MEDIA },
        { "0", S_HELP_0 },
        { "n", S_HELP_N },
        { "i", S_HELP_I },
        { "v", S_HELP_V },
        { "d", S_HELP_D },
        { "p", S_HELP_P },
        { "w", S_HELP_W },
        { "o", S_HELP_O },
        { "a", S_HELP_A },
        { "g", S_HELP_G },
        { "l", S_HELP_L },
        { "[  ]", S_HELP_REACTIVITY },
        { ",  .", S_HELP_TRAILS },
        { "-  =", S_HELP_MOOD },
        { ";  '", S_HELP_LATENCY },
        { "b", S_HELP_B },
        { "e", S_HELP_E },
        { "t", S_HELP_T },
        { "u", S_HELP_U },
        { "f", S_HELP_F },
        { "Space", S_HELP_SPACE },
        { "Shift+Space", S_HELP_SHIFT_SPACE },
        { "z", S_HELP_Z },
        { "c  m", S_HELP_CM },
        { "j", S_HELP_J },
        { "y  x", S_HELP_YX },
        { "k", S_HELP_K },
        { "r", S_HELP_R },
        { "s", S_HELP_S },
        { "Esc / q", S_HELP_ESC },
    };
    const int n = static_cast<int>( sizeof( Lines ) / sizeof( Lines[0] ) );
    // Three entries more (16.10.2026): Shift+W, the double-click and the menus' type-to-filter were in the README
    // only.  Their key column is a word, so it comes from the string table too.
    struct Extra
    {
        StrIdE key;
        StrIdE desc;
    };
    static const Extra Extras[] = { { S_HELP_KEY_DBLCLICK, S_HELP_DBLCLICK }, { S_HELP_KEY_TYPE, S_HELP_TYPE } };
    QStringList        keys, descs;
    for ( int i = 0; i < n; ++i )
    {
        keys << QString::fromUtf8( Lines[i].key );
        descs << QString::fromUtf8( Strings::uiText( Lines[i].desc ) );
        if ( Lines[i].desc == S_HELP_W )
        {
            keys << "Shift+W";
            descs << QString::fromUtf8( Strings::uiText( S_HELP_SHIFT_W ) );
        }
    }
    for ( const Extra &e : Extras )
    {
        keys << QString::fromUtf8( Strings::uiText( e.key ) );
        descs << QString::fromUtf8( Strings::uiText( e.desc ) );
    }
    const int rows = static_cast<int>( keys.size() );

    // Sized by the window like the on-screen menu: a fixed 480 x 908 px box ran off a 720-pixel-high window (a
    // 1080p laptop at 150 %) and was tiny on a large output.  When one column does not fit the height, two.
    const int lh = std::max( 16, height() / 40 );
    QFont     body( "Consolas" );
    body.setPixelSize( std::max( 11, lh * 62 / 100 ) );
    QFont title( body );
    title.setBold( true );
    title.setPixelSize( body.pixelSize() + 2 );
    const QFontMetrics fm( body );
    int                key_w = 0, desc_w = 0;
    for ( int i = 0; i < rows; ++i )
    {
        key_w = std::max( key_w, fm.horizontalAdvance( keys[i] ) );
        desc_w = std::max( desc_w, fm.horizontalAdvance( descs[i] ) );
    }
    const int pad = lh;
    const int cols = ( rows + 1 ) * lh + 2 * pad > height() * 92 / 100 ? 2 : 1;
    const int per_col = ( rows + cols - 1 ) / cols;
    const int col_w = key_w + lh + desc_w;
    const int box_w = std::min( width() - 2 * lh, cols * col_w + ( cols - 1 ) * 2 * lh + 2 * pad );
    const int box_h = std::min( height() - lh, ( per_col + 1 ) * lh + 2 * pad );
    const int x0 = ( width() - box_w ) / 2;
    const int y0 = ( height() - box_h ) / 2;
    // A column too wide for the window gives its descriptions what is left, elided.
    const int desc_room = ( box_w - 2 * pad - ( cols - 1 ) * 2 * lh ) / cols - key_w - lh;

    painter->fillRect( x0, y0, box_w, box_h, QColor( 0, 0, 0, 190 ) );
    painter->setPen( QColor( 120, 200, 255 ) );
    painter->setFont( title );
    painter->drawText( x0 + pad, y0 + pad + fm.ascent(), QString::fromUtf8( Strings::uiText( S_HELP_TITLE ) ) );
    painter->setFont( body );
    for ( int i = 0; i < rows; ++i )
    {
        const int col = i / per_col, row = i % per_col;
        const int cx = x0 + pad + col * ( col_w + 2 * lh );
        const int ry = y0 + pad + fm.ascent() + ( row + 1 ) * lh;
        painter->setPen( QColor( 150, 230, 150 ) );
        painter->drawText( cx, ry, keys[i] );
        painter->setPen( QColor( 210, 218, 232 ) );
        painter->drawText( cx + key_w + lh, ry, fm.elidedText( descs[i], Qt::ElideRight, std::max( 20, desc_room ) ) );
    }
}

/** Display names for the MIDI_* learn targets (GLwidget::MIDI_REACT etc.), used in the "MIDI learn" stderr prompts. */
static const char *kMidiTargetNames[] =
    { "Reactivity", "Trails", "Mood", "Latenz-Vorlauf", "Naechster Effekt",
      "Tap-Tempo", "Blackout" };

void GLwidget::applyMidi()
{
    if ( !m_midi )
        m_midi = M_MidiOpened.exchange( nullptr ); // opened meanwhile by the start thread
    if ( !m_midi )
        return;
    std::vector<MidiInput::Event> evs = m_midi->drain();
    for ( const MidiInput::Event &e : evs )
    {
        // MIDI clock: a quarter note, with when it arrived and the clock's tempo (MidiInput::clockTick()).
        if ( e.type == 0xF8 )
        {
            if ( m_audioAnalyzer )
                m_audioAnalyzer->externalBeat( "MIDI clock", e.refMs, e.bpm, e.data1 != 0 );
            continue;
        }
        // ---- MIDI LEARN: bind the incoming controller to the current target ----
        if ( m_midiLearn >= 0 )
        {
            bool wants_note = ( m_midiLearn == MIDI_NEXT || m_midiLearn == MIDI_TAP
                                || m_midiLearn == MIDI_BLACKOUT );
            if ( ( wants_note && e.type == 0x90 ) || ( !wants_note && e.type == 0xB0 ) )
            {
                m_midiMap[m_midiLearn] = e.data1;
                const QString learned = ui( S_FB_MIDI_LEARNED_FMT )
                                            .arg( kMidiTargetNames[m_midiLearn] )
                                            .arg( QString( "%1 %2" ).arg( wants_note ? "Note" : "CC" ).arg( e.data1 ) );
                ++m_midiLearn; // advance to next target
                if ( m_midiLearn >= MIDI_TARGETS )
                {
                    m_midiLearn = -1;
                    m_midiLearned = true;
                    saveUiSettings( false ); // persist the new mapping
                    feedback( learned + " -- " + ui( S_FB_MIDI_OFF ) );
                }
                else // the next target, on screen until it is learned too
                    feedback( learned + " -- " + ui( S_FB_MIDI_LEARN_FMT ).arg( kMidiTargetNames[m_midiLearn] ),
                              24 * 3600 * 1000 );
            }
            continue; // learn consumes the event
        }

        if ( e.type == 0xB0 ) // Control Change -> mapped knobs
        {
            float v = e.data2 / 127.f; // 0..1
            if ( e.data1 == m_midiMap[MIDI_REACT] )
                RenderPipeline::setReactivity( v * 3.0f );
            else if ( e.data1 == m_midiMap[MIDI_TRAILS] )
                RenderPipeline::setTrails( v * 0.95f );
            else if ( e.data1 == m_midiMap[MIDI_MOOD] )
                RenderPipeline::setMood( v * 2.5f );
            else if ( e.data1 == m_midiMap[MIDI_LATENCY] )
                RenderPipeline::setLatency( v * 0.25f );
        }
        else if ( e.type == 0x90 ) // Note On -> mapped pads
        {
            // Every pad fires only on its LEARNED note. "Next" used to take any
            // note while unbound -- every key played on an attached keyboard
            // cut the scene and taught it a dislike.
            if ( m_midiMap[MIDI_TAP] >= 0 && e.data1 == m_midiMap[MIDI_TAP] )
            {
                if ( m_audioAnalyzer )
                    m_audioAnalyzer->tapTempo();
            }
            else if ( m_midiMap[MIDI_BLACKOUT] >= 0 && e.data1 == m_midiMap[MIDI_BLACKOUT] )
            {
                RenderPipeline::toggleBlackout();
            }
            else if ( m_midiMap[MIDI_NEXT] >= 0 && e.data1 == m_midiMap[MIDI_NEXT] )
                if ( m_actConfiguration && m_actConfiguration->renderPipeline() )
                    m_actConfiguration->renderPipeline()->requestSceneChange();
        }
    }
}

/**  Extracts a two-color dominant palette from an artist/cover image.
 *
 * @param src   Source image (any format/size; downscaled internally to 24x24). (in)
 * @param palA  Output: dominant color as RGB in 0..1. (out)
 * @param palB  Output: secondary color as RGB in 0..1 (or a darkened shade of palA when no sufficiently distinct
 *              second hue bucket exists). (out)
 *
 * @return
 *   True if a usable (sufficiently colorful) palette was found; false for near-greyscale images, in which case
 *   palA/palB are unmodified.
 *
 * Cover palette: the two dominant colours of an artist image.  12 hue
 * buckets, weighted by saturation*brightness (grey/black does not count);
 * winner = weighted RGB mean of its bucket, second colour = best bucket at
 * a circular distance >= 2 (else a dark shade of the first).  Returns false
 * for practically colourless covers (b/w photos) - the grading then stays
 * neutral instead of inventing a random tint.
 **/
static bool extractPalette( const QImage &src, float *palA, float *palB )
{
    if ( src.isNull() )
        return false;
    QImage img = src.scaled( 24, 24, Qt::IgnoreAspectRatio, Qt::FastTransformation )
                     .convertToFormat( QImage::Format_RGB32 );
    double w_sum[12] = {}, r_sum[12] = {}, g_sum[12] = {}, b_sum[12] = {};
    for ( int y = 0; y < img.height(); ++y )
        for ( int x = 0; x < img.width(); ++x )
        {
            QColor c( img.pixel( x, y ) );
            float  h, s, v;
            c.getHsvF( &h, &s, &v );
            if ( h < 0.f || s < 0.22f || v < 0.14f )
                continue;
            int    bkt = static_cast<int>( h * 12.f ) % 12;
            double w = static_cast<double>( s ) * static_cast<double>( v );
            w_sum[bkt] += w;
            r_sum[bkt] += w * c.redF();
            g_sum[bkt] += w * c.greenF();
            b_sum[bkt] += w * c.blueF();
        }
    int best = 0;
    for ( int k = 1; k < 12; ++k )
        if ( w_sum[k] > w_sum[best] )
            best = k;
    // At least ~4% of the pixels must count, in colour, towards the winner.
    if ( w_sum[best] < 24.0 * 24.0 * 0.04 * 0.25 )
        return false;
    palA[0] = static_cast<float>( r_sum[best] / w_sum[best] );
    palA[1] = static_cast<float>( g_sum[best] / w_sum[best] );
    palA[2] = static_cast<float>( b_sum[best] / w_sum[best] );
    int second = -1;
    for ( int k = 0; k < 12; ++k )
    {
        int dc = abs( k - best );
        dc = ( dc > 6 ) ? 12 - dc : dc;
        if ( dc >= 2 && ( second < 0 || w_sum[k] > w_sum[second] ) && w_sum[k] > 1.0 )
            second = k;
    }
    if ( second >= 0 )
    {
        palB[0] = static_cast<float>( r_sum[second] / w_sum[second] );
        palB[1] = static_cast<float>( g_sum[second] / w_sum[second] );
        palB[2] = static_cast<float>( b_sum[second] / w_sum[second] );
    }
    else
        for ( int k = 0; k < 3; ++k )
            palB[k] = palA[k] * 0.30f; // dunkle Schattierung
    return true;
}

// Lyrics/artist-image overlay: compute the display state every frame.  The
// sync source is the SMTC playback position (extrapolated); without it (VLC
// fallback, test mode) a local clock runs from the track change.  All fades
// are slewed so that nothing pops up hard.
void GLwidget::updateTrackOverlays( RenderPipeline *fs )
{
    RenderPipeline::OverlayFrame o;
    if ( !m_trackMedia )
    {
        fs->setOverlayFrame( o );
        return;
    }

    // Real dt instead of a fixed 60 Hz assumption: when the frame time varies
    // (GPU load, adaptive render scale, compute sims), the scroll smoothing
    // stutters otherwise, because the slew step does not match the time that
    // really passed.  The first call / long dropouts are clamped.
    const qint64 now_ms = m_fpsTimer.elapsed();
    float        dt = ( m_overlayLastMs < 0 ) ? ( 1.f / 60.f )
                                              : static_cast<float>( now_ms - m_overlayLastMs ) * 0.001f;
    if ( dt < 0.f )
        dt = 0.f;
    if ( dt > 0.25f )
        dt = 0.25f;
    m_overlayLastMs = now_ms;

    auto slew = []( float cur, float target, float rate, float dt )
    {
        float step = rate * dt;
        if ( target > cur )
            return ( target - cur < step ) ? target : cur + step;
        return ( cur - target < step ) ? target : cur - step;
    };

    // Preset switch: the new configuration has its OWN PresentPass without
    // our textures - reset the upload markers so that lyrics and artist image
    // are uploaded again right below.
    if ( fs != m_overlayFs )
    {
        m_overlayFs = fs;
        m_lyricsRevUploaded = -1;
        m_artistIdxUploaded = -1;
        m_artistRevSeen = -1;
    }

    // Playback position: SMTC, else a local clock since the track change -
    // both only as the REFERENCE for the PLL below.
    double pos = m_nowPlaying ? m_nowPlaying->positionNowSec() : -1.0;
    double dur = 0.0;
    if ( m_nowPlaying )
        dur = m_nowPlaying->timeline().durationSec;
    if ( pos < 0.0 || m_lyricsTest )
        pos = static_cast<double>( m_fpsTimer.elapsed() - m_trackStartMs ) * 0.001;

    // Consumer PLL (the user's recording proved it: despite the monotonic
    // NowPlaying publication, backward steps still arrived - e.g. when a
    // player briefly flickers playing=false and a raw old value slips
    // through, or a title flicker resets the settle window to the local
    // clock).  Hence finally HERE, at the only consumer: a position of its
    // own, integrated with the frame dt, that only GLIDES towards the
    // reference (rate 0..1.15 - slows down to a standstill on pause, never
    // runs backwards).  Jumps in BOTH directions only after a short
    // confirmation: FORWARD 0.4s (a real fast-forward seek still feels
    // immediate), BACKWARD 2s (real rewinding).  Both windows used to be
    // asymmetric (forward without any confirmation, "harmless to the eye") -
    // but a PLL simulation with realistic reference noise showed: a single
    // outlier >1.5s ahead jumped AT ONCE, and when the reference fell back to
    // the true value one round trip later, the backward confirmation took
    // exactly THAT as "2s consistently wrong" and jumped back - a single
    // outlier thus became TWO visible jumps (forward, then back), exactly the
    // reported hopping.  Shorter flicker of any kind is now bridged
    // completely in BOTH directions; the display simply runs on.
    if ( m_posSmooth < 0.0 )
    {
        m_posSmooth = pos;
        m_backJumpSince = -1;
        m_fwdJumpSince = -1;
    }
    else if ( pos - m_posSmooth > 1.5 )
    {
        const qint64 pll_now = m_fpsTimer.elapsed();
        double       erwartet = m_fwdJumpRef
                                + ( m_fwdJumpSince >= 0
                                        ? static_cast<double>( pll_now - m_fwdJumpSince ) * 0.001
                                        : 0.0 );
        if ( m_fwdJumpSince < 0 || fabs( pos - erwartet ) > 1.0 )
        {
            m_fwdJumpSince = pll_now; // (new) forward candidate
            m_fwdJumpRef = pos;
        }
        else if ( pll_now - m_fwdJumpSince > 400 )
        {
            // Forensic trail for the NEXT reported "jump": earlier rounds only
            // logged a resulting BACKWARD line-index flip (see below), which
            // stays silent for a snap that lands inside the CURRENT line's own
            // span (no index change, but the scroll position inside it still
            // jumps) or a forward multi-line skip. Log every actual PLL snap
            // itself, unconditionally -- these are rare by construction (only
            // after 0.4/2s of confirmation), so this costs nothing in the
            // common case and finally makes every discontinuity source visible
            // in kaleidoscope.log instead of just this one already-fixed kind.
            fprintf( stderr, "[Lyrics] PLL-Sprung VORWAERTS: posSmooth %.3f -> %.3f "
                             "(nach %.0fms Bestaetigung)\n",
                     m_posSmooth, pos, static_cast<double>( pll_now - ( m_fwdJumpSince ) ) );
            m_posSmooth = pos; // 0.4s konsistent: echter Seek
            m_fwdJumpSince = -1;
        }
        m_backJumpSince = -1;
        if ( m_fwdJumpSince >= 0 )
            m_posSmooth += static_cast<double>( dt ); // solange pending: normal weiterlaufen
    }
    else if ( pos - m_posSmooth < -1.5 )
    {
        const qint64 pll_now = m_fpsTimer.elapsed();
        double       erwartet = m_backJumpRef
                                + ( m_backJumpSince >= 0
                                        ? static_cast<double>( pll_now - m_backJumpSince ) * 0.001
                                        : 0.0 );
        if ( m_backJumpSince < 0 || fabs( pos - erwartet ) > 1.0 )
        {
            m_backJumpSince = pll_now; // (new) backward candidate
            m_backJumpRef = pos;
        }
        else if ( pll_now - m_backJumpSince > 2000 )
        {
            // See the matching forward-snap log above for why this is
            // unconditional now (was previously silent, unlike the resulting
            // backward line-index flip below).
            fprintf( stderr, "[Lyrics] PLL-Sprung RUECKWAERTS: posSmooth %.3f -> %.3f "
                             "(nach %.0fms Bestaetigung)\n",
                     m_posSmooth, pos, static_cast<double>( pll_now - ( m_backJumpSince ) ) );
            m_posSmooth = pos; // 2s konsistent: echter Seek
            m_backJumpSince = -1;
        }
        m_fwdJumpSince = -1;
        if ( m_backJumpSince >= 0 )
            m_posSmooth += static_cast<double>( dt ); // solange pending: normal weiterlaufen
    }
    else
    {
        m_backJumpSince = -1;
        m_fwdJumpSince = -1;
        // Asymmetric gain: catch up gently when lagging behind (0.3), but
        // brake hard when running AHEAD (2.0) - otherwise a pause (frozen
        // reference) first pushes the position 3.3s past the target and over
        // the 1.5s threshold into the forward path.
        const double err = pos - m_posSmooth;
        double       r = 1.0 + err * ( err < 0.0 ? 2.0 : 0.3 );
        if ( r < 0.0 )
            r = 0.0;
        if ( r > 1.15 )
            r = 1.15;
        m_posSmooth += static_cast<double>( dt ) * r;
    }
    pos = m_posSmooth;

    // ---- Lyrics ----
    if ( m_trackMedia->lyricsRevision() != m_lyricsRevUploaded )
    {
        m_lyricsRevUploaded = m_trackMedia->lyricsRevision();
        m_karaokeLine = -1;
        m_scrollVSm = 0.f;
        const QImage &img = m_trackMedia->lyricsImage();
        if ( !img.isNull() )
        {
            QImage gl = img.convertToFormat( QImage::Format_RGBA8888 );
            fs->setLyricsTexture( gl.constBits(), gl.width(), gl.height() );
        }
    }

    bool lyrics_on = ( m_lyricsMode > 0 ) && m_trackMedia->hasLyrics();
    // Longer pauses without text (intro, solo, outro): fade the lyrics out
    // gently instead of leaving a dead/old line standing.  Uses the karaoke
    // line index of the LAST frame (continuous state, 16ms old - harmless for
    // this decision, avoids a second line search).
    // IMPORTANT: the hysteresis search below keeps i on the PREVIOUS (last
    // active) line during a gap, not on the coming one - a first version
    // wrongly took lines[i].t0 as the end of the gap and therefore never
    // found a gap (uncovered by a line simulation).
    if ( lyrics_on && m_trackMedia->syncedLyrics() )
    {
        const auto &lines = m_trackMedia->lines();
        int         n = static_cast<int>( lines.size() );
        if ( n > 0 )
        {
            int  i = ( m_karaokeLine >= 0 && m_karaokeLine < n ) ? m_karaokeLine : 0;
            bool in_long_gap = false;
            if ( pos < lines[i].t0 )
            {
                // Intro (only stable at i==0): before the very first line.
                in_long_gap = ( lines[i].t0 > 9.f ) && ( pos < lines[i].t0 - 2.f );
            }
            else if ( lines[i].text.isEmpty() && pos < lines[i].t1 )
            {
                // The active "line" is an instrumental marker (empty text,
                // see TrackMedia::parseSynced) -- a solo/break IN THE MIDDLE
                // of the song, not just intro/outro.  i already rests stably
                // on the marker here (the hysteresis search below keeps it
                // there), so the marker's own span suffices as the gap.
                in_long_gap = ( lines[i].t1 - lines[i].t0 > 9.f )
                              && ( pos > lines[i].t0 + 2.f )
                              && ( pos < lines[i].t1 - 2.f );
            }
            else if ( pos >= lines[i].t1 )
            {
                bool has_next = ( i + 1 < n );
                if ( has_next )
                {
                    float gap_end = lines[i + 1].t0;
                    in_long_gap = ( gap_end - lines[i].t1 > 9.f )
                                  && ( pos > lines[i].t1 + 2.f )
                                  && ( pos < gap_end - 2.f );
                }
                else
                    in_long_gap = pos > lines[i].t1 + 2.f; // Outro: unbegrenzt
            }
            if ( in_long_gap )
                lyrics_on = false;
        }
    }
    m_lyricsAlphaSm = slew( m_lyricsAlphaSm, lyrics_on ? 1.f : 0.f, 1.5f, dt );
    if ( lyrics_on || m_lyricsAlphaSm > 0.001f )
    {
        const auto   &lines = m_trackMedia->lines();
        const QImage &img = m_trackMedia->lyricsImage();
        o.lyricsAlpha = m_lyricsAlphaSm * 0.92f;
        // Aspect deliberately computed against the NOMINAL (not the actual)
        // width: a single overlong line can make the texture wider (see
        // TrackMedia::renderLyricsImage()) but should not visibly shrink all
        // the other lines.  lyricsUScale carries the difference into the
        // shader (Present.frag uses it to map the sample coordinate back to
        // the actual texture width).
        const int nom_w = TrackMedia::lyricsNominalTexWidth();
        o.lyricsAspect = img.isNull() ? 1.f
                                      : static_cast<float>( nom_w ) / static_cast<float>( img.height() );
        o.lyricsUScale = ( img.isNull() || img.width() <= 0 )
                             ? 1.f
                             : static_cast<float>( nom_w ) / static_cast<float>( img.width() );

        float target_v = m_scrollVSm;
        if ( m_trackMedia->syncedLyrics() )
        {
            // Find the active line (cache + forward/backward scan for seeks).
            // BACKWARD with 0.3s hysteresis: only real rewinding should change
            // the line - a tiny step back of the position (should one ever
            // slip through) must not flip the highlight to the previous line.
            int n = static_cast<int>( lines.size() );
            int i = ( m_karaokeLine >= 0 && m_karaokeLine < n ) ? m_karaokeLine : 0;
            while ( i + 1 < n && pos >= lines[i].t1 )
                ++i;
            while ( i > 0 && pos < lines[i].t0 - 0.3 )
                --i;
            // A line index going BACKWARD is exactly the "flip to the previous
            // line" symptom earlier rounds already tried to fix (monotone
            // NowPlaying publish, consumer PLL, this hysteresis). If it still
            // happens, this is the forensic trail: with -l, it lands in
            // kaleidoscope.log correlated with the exact pos/m_posSmooth that
            // caused it, instead of having to guess at another blind fix.
            // ALSO logged now: a forward skip of more than one line at once --
            // same visible "jump" symptom, just never instrumented before
            // because only the backward direction had been reported.
            if ( m_karaokeLine >= 0 && ( i < m_karaokeLine || i > m_karaokeLine + 1 ) )
                fprintf( stderr, "[Lyrics] Zeile-SPRUNG %s: %d -> %d  "
                                 "pos=%.3f posSmooth=%.3f  t0[alt]=%.3f t1[alt]=%.3f "
                                 "t0[neu]=%.3f t1[neu]=%.3f\n",
                         ( i < m_karaokeLine ) ? "RUECKWAERTS" : "VORWAERTS(>1)",
                         m_karaokeLine, i, pos, m_posSmooth,
                         lines[m_karaokeLine].t0, lines[m_karaokeLine].t1,
                         lines[i].t0, lines[i].t1 );
            m_karaokeLine = i;

            // Kinetics: line age for the fresh line's slam-in.
            if ( i != m_lastKaraokeLineSeen )
            {
                m_lastKaraokeLineSeen = i;
                m_lineChangeMs = m_fpsTimer.elapsed();
            }
            if ( m_lyricsKinetic && m_lineChangeMs >= 0 )
                o.lyricsLineAge = static_cast<float>( m_fpsTimer.elapsed() - m_lineChangeMs ) * 0.001f;

            const auto &l = lines[i];
            float       line_frac = 0.f;
            if ( l.t1 > l.t0 )
                line_frac = static_cast<float>( ( pos - l.t0 ) / ( l.t1 - l.t0 ) );
            line_frac = std::min( std::max( line_frac, 0.f ), 1.f );

            // Scroll target: the centre glides continuously to the next line.
            float c0 = 0.5f * ( l.v0 + l.v1 );
            float c1 = ( i + 1 < n ) ? 0.5f * ( lines[i + 1].v0 + lines[i + 1].v1 )
                                     : c0;
            target_v = c0 + ( c1 - c0 ) * line_frac;

            // Highlight ALWAYS on the (hysteresis-stable) active line - it
            // used to be tied to "pos >= t0", so a tiny backward step of the
            // position around the start of a line briefly hid the highlight:
            // all lines popped to full brightness and back ("hopping"),
            // although nothing scrolled at all.
            if ( m_lyricsMode == 2 )
            {
                o.lyricsHlV0 = l.v0;
                o.lyricsHlV1 = l.v1;
                o.lyricsHlProg = line_frac; // already clamped to 0..1
            }

            // Marquee: the line being read (both modes -- in plain scroll, L
            // is the hysteresis-stable "active" line too) is, if it did not
            // fit into the window when rendered (L.overflowU), scrolled
            // through horizontally instead of cut off -- tied to line_frac
            // (0..1 through the sung duration of THIS line, computed above)
            // instead of a fixed px/s speed: for the first 30% the text stands
            // still (reading time for the beginning), from 30% to 90% it
            // scrolls (with ease-in/out) all the way to the end, for the last
            // 10% it stands there.  No scrolling back is needed, since the
            // next line starts at 0 anyway -- and longer lines (which usually
            // sound longer) automatically get more time to scroll than short
            // ones, instead of one animation equally fast for all, regardless
            // of the line's duration.
            o.lyricsFocusV0 = l.v0;
            o.lyricsFocusV1 = l.v1;
            if ( l.overflowU > 0.f )
            {
                const float start_frac = 0.30f, end_frac = 0.90f;
                float       sp = ( line_frac - start_frac ) / ( end_frac - start_frac );
                sp = std::min( std::max( sp, 0.f ), 1.f );
                const float eased = sp * sp * ( 3.f - 2.f * sp ); // smoothstep
                o.lyricsScrollU = l.overflowU * eased;
            }
        }
        else
        {
            // Unsynchronised: scroll evenly over the song's duration; without
            // a duration, at a fixed, leisurely speed.
            if ( dur > 10.0 )
                target_v = static_cast<float>( pos / dur );
            else
                target_v = static_cast<float>( pos * 0.008 );
            target_v = std::min( std::max( target_v, 0.f ), 1.f );
        }

        // Always follow smoothly instead of teleporting - even on a big jump
        // (a seek, or a rare correction the settle window in NowPlaying did
        // not catch) with a clearly higher rate, so that it "catches up
        // fast" instead of cutting.  A jump across half the texture thus
        // takes ~0.2s instead of a single-frame cut.
        const bool big_gap = fabsf( target_v - m_scrollVSm ) > 0.08f;
        // Edge-triggered (once per episode, not every frame of a ~0.2-0.5s
        // catch-up): this is the "visible but not instant" jump candidate --
        // a real seek looks exactly like this by design, but so would any
        // OTHER cause that displaces target_v by more than a normal single-
        // line step (see the two PLL-snap logs above and the RUECKWAERTS/
        // VORWAERTS(>1) line-index log for the other candidates).
        static bool was_big_gap = false;
        if ( big_gap && !was_big_gap )
            fprintf( stderr, "[Lyrics] Scroll-Sprung: targetV=%.4f scrollV=%.4f "
                             "(delta=%.4f) karaokeLine=%d pos=%.3f\n",
                     target_v, m_scrollVSm, target_v - m_scrollVSm, m_karaokeLine, pos );
        was_big_gap = big_gap;

        float rate = big_gap ? 2.5f : 0.10f;
        m_scrollVSm = slew( m_scrollVSm, target_v, rate, dt );
        o.lyricsScrollV = m_scrollVSm;
    }

    // ---- Artist images: rotation, faded in every ~45 s for ~14 s ----
    // (gives way to the music-video PiP below if one is ready for the song —
    // same corner slot, see setArtistExternalTexture()).
    bool  artist_on = m_artistShow
                      && !( m_videoEnabled && m_trackMedia->videoReady() )
                      && m_trackMedia->imageCount() > 0;
    float artist_target = 0.f;
    if ( artist_on )
    {
        // With large collections (up to 50 images) it rotates faster, so
        // that over an evening really many images get their turn.
        const bool   viele = m_trackMedia->imageCount() >= 10;
        const qint64 cycle_ms = viele ? 26000 : 45000;
        const qint64 show_ms = viele ? 12000 : 14000;
        const qint64 fade_ms = 2200;
        qint64       t = m_fpsTimer.elapsed() - m_trackStartMs;
        if ( t < 0 )
            t = 0;
        qint64 ph = t % cycle_ms;
        int    cy = static_cast<int>( t / cycle_ms );
        if ( ph < show_ms )
        {
            int idx = cy % m_trackMedia->imageCount();
            if ( idx != m_artistIdxUploaded
                 || m_artistRevSeen != m_trackMedia->imagesRevision() )
            {
                m_artistIdxUploaded = idx;
                m_artistRevSeen = m_trackMedia->imagesRevision();
                const QImage &img = m_trackMedia->imageAt( idx );
                fs->setArtistTexture( img.constBits(), img.width(), img.height() );
                // Take the cover palette from the freshly chosen image - the
                // song organically gets its artist's colour world.
                m_palValid = extractPalette( img, m_palA, m_palB );
            }
            float in = std::min( 1.f, static_cast<float>( ph ) / static_cast<float>( fade_ms ) );
            float out = std::min( 1.f, static_cast<float>( show_ms - ph ) / static_cast<float>( fade_ms ) );
            artist_target = std::min( in, out );
        }
    }
    m_artistAlphaSm = slew( m_artistAlphaSm, artist_target, 1.2f, dt );
    // Cover palette: fade in very slowly (0.3/s) - a song's colour world
    // should establish itself, not pop up.  Independent of whether the image
    // itself is visible at the moment.
    m_palAmtSm = slew( m_palAmtSm, m_palValid ? 1.f : 0.f, 0.3f, dt );
    if ( m_palAmtSm > 0.001f )
    {
        o.paletteAmt = m_palAmtSm;
        for ( int k = 0; k < 3; ++k )
        {
            o.paletteA[k] = m_palA[k];
            o.paletteB[k] = m_palB[k];
        }
    }
    if ( m_artistAlphaSm > 0.001f && m_artistIdxUploaded >= 0
         && m_artistIdxUploaded < m_trackMedia->imageCount() )
    {
        const QImage &img = m_trackMedia->imageAt( m_artistIdxUploaded );
        o.artistAlpha = m_artistAlphaSm * 0.9f;
        o.artistAspect = static_cast<float>( img.width() ) / static_cast<float>( std::max( img.height(), 1 ) );
    }

    // ---- Music-video PiP: takes over the same corner as soon as TrackMedia
    // has a cached video ready for the current song (see the download chain
    // of TrackMedia::requestTrack()).  Kept in sync with the real song
    // position by seeking instead of running a clock of its own — a video
    // shorter than the song simply loops (see the infinite-loop setting in
    // VideoPiP::videoPipLoad()) and still stays at the right place.
    bool video_on = m_artistShow && m_videoEnabled && m_trackMedia->videoReady();
    if ( video_on )
    {
        if ( m_trackMedia->videoPath() != m_videoPathLoaded )
        {
            videoPipLoad( m_trackMedia->videoPath().toLocal8Bit().constData() );
            m_videoPathLoaded = m_trackMedia->videoPath();
        }
        // `pos` (computed above: SMTC position if available, PLL-smoothed,
        // else the local test-mode clock) is already the SAME authoritative
        // position the lyrics scroll/karaoke highlight are synced to -- reuse
        // it here too instead of re-querying NowPlaying directly, so the
        // video and the lyrics can never disagree about "where we are", and
        // KALEIDO_LYRICS_TEST's local clock fallback works for video sync too.
        // 400ms tolerance: don't hard-seek on every tiny position nudge (same
        // lesson as the lyrics scroll above) -- only a real jump snaps it.
        videoPipSeek( static_cast<long long>( pos * 1000.0 ), 400 );
        const bool song_is_playing = m_lyricsTest
                                     || ( m_nowPlaying && m_nowPlaying->timeline().playing );
        videoPipSetPlaying( song_is_playing );
    }
    else if ( !m_videoPathLoaded.isEmpty() )
    {
        videoPipRelease();
        m_videoPathLoaded.clear();
    }
    // Only the fade-in ramp is smoothed; the fade-out is deliberately hard
    // (no slew on the read below) — as soon as video_on turns false,
    // videoPipRelease() deletes its GL texture, so a soft fade-out would try
    // to bind an already deleted texture.
    m_videoAlphaSm = slew( m_videoAlphaSm, video_on ? 1.f : 0.f, 1.2f, dt );
    if ( video_on && m_videoAlphaSm > 0.001f )
    {
        unsigned int       vw = 0, vh = 0;
        const unsigned int vtex = videoPipFrame( &vw, &vh );
        if ( vtex != 0 )
        {
            fs->setArtistExternalTexture( vtex );
            o.artistAlpha = m_videoAlphaSm * 0.9f;
            o.artistAspect = ( vh > 0 ) ? static_cast<float>( vw ) / static_cast<float>( vh ) : 16.f / 9.f;
        }
        // vtex==0: decoder hasn't produced a frame yet (just loaded) -- leave
        // whatever the artist-image block above wrote (or nothing) in place
        // for this one frame rather than flashing an empty corner.
    }
    else
    {
        fs->setArtistExternalTexture( 0 ); // clears any stale override
    }

    fs->setOverlayFrame( o );
}

void GLwidget::requestCurrentTrackMedia()
{
    if ( !m_trackMedia || !m_nowPlaying || m_nowPlaying->title().isEmpty() )
        return;
    const double dur_sec = ( m_artistShow && m_videoEnabled )
                               ? m_nowPlaying->timeline().durationSec
                               : -1.0;
    m_trackMedia->requestTrack( m_nowPlaying->artist(), m_nowPlaying->title(), dur_sec );
}

void GLwidget::setArtistImagesEnabled( bool on )
{
    m_artistShow = on;
    if ( on )
        requestCurrentTrackMedia();
}

void GLwidget::setVideoPipEnabled( bool on )
{
    m_videoEnabled = on;
    if ( on )
        requestCurrentTrackMedia();
}

void GLwidget::setLyricsModeValue( int mode )
{
    m_lyricsMode = qBound( 0, mode, 2 );
    if ( m_lyricsMode > 0 )
        requestCurrentTrackMedia();
}

void GLwidget::selectAudioDevice( int index )
{
    if ( !m_audioAnalyzer )
        return;
    if ( index == 0 ) // 0 = default output (loopback)
    {
        m_audioAnalyzer->requestDevice( QString(), false );
        QSettings( SettingsFile::path(), QSettings::IniFormat ).remove( "audioDevice" );
        fprintf( stderr, "Audio source: default (loopback)\n" );
        return;
    }
    QList<AudioDevice> devs = m_audioAnalyzer->devices();
    int                di = index - 1;
    if ( di >= 0 && di < devs.size() )
    {
        m_audioAnalyzer->requestDevice( devs[di].id, devs[di].isCapture );
        // remembered: the next start captures the same source (or the default while it is missing)
        QSettings st( SettingsFile::path(), QSettings::IniFormat );
        st.setValue( "audioDevice", devs[di].id );
        st.setValue( "audioDeviceInput", devs[di].isCapture );
        fprintf( stderr, "Audio source: %s\n", devs[di].name.toLocal8Bit().constData() );
    }
}

QVector<int> GLwidget::configMenuMatches() const
{
    QVector<int> out;
    for ( int i = 0; i < static_cast<int>( m_configurationList.size() ); ++i )
        if ( m_configMenuFilter.isEmpty()
             || m_configurationList[i]->getConfigurationName().contains( m_configMenuFilter, Qt::CaseInsensitive ) )
            out.append( i );
    return out;
}

QVector<int> GLwidget::audioMenuMatches() const
{
    QVector<int>  out;
    const QString f = m_audioMenuFilter;
    // Row 0 is the default-output entry; it stays visible while nothing is
    // typed, and matches on its own label once something is.
    if ( f.isEmpty()
         || QString::fromUtf8( Strings::uiText( S_AUDIOMENU_DEFAULT_OUTPUT ) )
                .contains( f, Qt::CaseInsensitive ) )
        out.append( 0 );
    if ( m_audioAnalyzer )
    {
        const QList<AudioDevice> devs = m_audioAnalyzer->devices();
        for ( int i = 0; i < devs.size(); ++i )
            if ( f.isEmpty() || devs[i].name.contains( f, Qt::CaseInsensitive ) )
                out.append( i + 1 );
    }
    return out;
}

int GLwidget::audioMenuCount() const
{
    // Row 0 is "default output"; the enumerated devices follow it.
    return 1 + ( m_audioAnalyzer ? m_audioAnalyzer->devices().size() : 0 );
}

/**  Draw the audio-source picker (key 'd').
 *
 * Scrolls and filters, for the same reason the preset menu does: selection used
 * to be bound to the digit keys, so the list was truncated at nine entries
 * (`if( shown > 9 ) shown = 9`) and anything past the ninth device was not even
 * drawn. A machine with a few virtual cables has well over nine, which is also
 * why typing to narrow the list earns its keep here.
 *
 * The highlight bar is where Enter would take you; the arrow marks the source
 * that is actually feeding the analyzer.
 **/
void GLwidget::drawAudioMenu( QPainter *painter )
{
    QList<AudioDevice> devs;
    QString            current;
    if ( m_audioAnalyzer )
    {
        devs = m_audioAnalyzer->devices();
        current = m_audioAnalyzer->currentDeviceName();
    }

    const QVector<int> hits = audioMenuMatches();
    const int          total = hits.size();
    const int          lh = 26;

    // Leave room for the title and the key hint, and never fill the screen.
    const int max_rows = std::max( 3, static_cast<int>( ( height() * 0.72 - 4 * lh ) / lh ) );
    const int visible = std::max( 0, std::min( total, max_rows ) );
    if ( total > 0 )
        menuScroll( m_audioMenuCursor, m_audioMenuTop, total, visible );
    else
        m_audioMenuCursor = m_audioMenuTop = 0;

    const QString hint = QString::fromUtf8( Strings::uiText( S_MENU_NAV_HINT ) );

    painter->setFont( QFont( "Consolas", 12 ) );
    QFontMetrics fm( painter->font() );
    int          text_w = fm.horizontalAdvance( hint );
    for ( int i = 0; i < devs.size(); ++i )
    {
        const QString tag = QString::fromUtf8( devs[i].isCapture ? Strings::uiText( S_AUDIOMENU_INPUT_TAG )
                                                                 : Strings::uiText( S_AUDIOMENU_OUTPUT_TAG ) );
        text_w = std::max( text_w, fm.horizontalAdvance( devs[i].name + tag ) );
    }

    const int box_w = std::min( width() - 40, std::max( 580, text_w + 70 ) );
    const int box_h = lh * ( std::max( visible, 1 ) + 2 ) + 44;
    const int x0 = ( width() - box_w ) / 2;
    const int y0 = ( height() - box_h ) / 2;

    painter->fillRect( x0, y0, box_w, box_h, QColor( 0, 0, 0, 200 ) );
    painter->setPen( QColor( 120, 200, 255 ) );
    painter->setFont( QFont( "Consolas", 14, QFont::Bold ) );
    painter->drawText( x0 + 20, y0 + 32,
                       QString::fromUtf8( Strings::uiText( S_AUDIOMENU_TITLE ) )
                           + ( m_audioMenuFilter.isEmpty()
                                   ? QString()
                                   : QString( "   \"%1\"" ).arg( m_audioMenuFilter ) ) );

    painter->setFont( QFont( "Consolas", 12 ) );

    m_audioMenuHit.box = QRect( x0, y0, box_w, box_h );
    m_audioMenuHit.rowY0 = y0 + 32 + lh - fm.ascent() - 3;
    m_audioMenuHit.rowH = lh;
    m_audioMenuHit.rows = visible;
    m_audioMenuHit.top = m_audioMenuTop;

    // current.isEmpty() means "the default device" -- see the language-neutral
    // sentinel comment in AudioAnalyzer::run().
    for ( int row = 0; row < visible; ++row )
    {
        const int i = hits[m_audioMenuTop + row];
        const int ry = y0 + 32 + ( row + 1 ) * lh;

        QString label;
        bool    active = false;
        if ( i == 0 )
        {
            label = QString::fromUtf8( Strings::uiText( S_AUDIOMENU_DEFAULT_OUTPUT ) );
            active = current.isEmpty();
        }
        else
        {
            const AudioDevice &d = devs[i - 1];
            label = d.name
                    + QString::fromUtf8( d.isCapture ? Strings::uiText( S_AUDIOMENU_INPUT_TAG )
                                                     : Strings::uiText( S_AUDIOMENU_OUTPUT_TAG ) );
            active = !current.isEmpty() && current == d.name;
        }

        if ( m_audioMenuTop + row == m_audioMenuCursor )
        {
            painter->fillRect( QRect( x0 + 6, ry - fm.ascent() - 3, box_w - 12, lh ),
                               QColor( 70, 120, 190, 190 ) );
            painter->setPen( QColor( 255, 255, 255 ) );
        }
        else if ( active )
            painter->setPen( QColor( 150, 230, 150 ) );
        else
            painter->setPen( QColor( 210, 218, 232 ) );

        // No row numbers: they only announced the digit shortcuts, which are gone.
        painter->drawText( x0 + 24, ry,
                           label + ( active ? QString::fromUtf8( "   \xE2\x86\x90" ) : QString() ) );
    }

    if ( visible == 0 )
    {
        painter->setPen( QColor( 200, 150, 150, 220 ) );
        painter->drawText( x0 + 24, y0 + 32 + lh,
                           QString::fromUtf8( Strings::uiText( S_MENU_NO_MATCH ) ) );
    }

    painter->setPen( QColor( 150, 150, 155, 200 ) );
    if ( m_audioMenuTop > 0 )
        painter->drawText( x0 + box_w - 28, y0 + 32 + lh,
                           QString::fromUtf8( "\xE2\x96\xB2" ) );
    if ( m_audioMenuTop + visible < total )
        painter->drawText( x0 + box_w - 28, y0 + 32 + visible * lh,
                           QString::fromUtf8( "\xE2\x96\xBC" ) );

    painter->setFont( QFont( "Consolas", 10 ) );
    QFontMetrics hfm( painter->font() );
    painter->setPen( QColor( 165, 165, 172, 215 ) );
    painter->drawText( x0 + ( box_w - hfm.horizontalAdvance( hint ) ) / 2,
                       y0 + box_h - 12, hint );
}

void GLwidget::drawNowPlaying( QPainter *painter, const QString &title,
                               const QString &artist, float alpha )
{
    int a = static_cast<int>( alpha * 255.f + 0.5f );
    if ( a < 0 )
        a = 0;
    if ( a > 255 )
        a = 255;
    int bg_a = static_cast<int>( alpha * 150.f + 0.5f );

    QFont        tf( "Segoe UI", 20, QFont::Bold );
    QFont        af( "Segoe UI", 14 );
    QFontMetrics tm( tf ), am( af );
    int          w = qMax( tm.horizontalAdvance( title ), am.horizontalAdvance( artist ) ) + 70;
    const int    h = 72;
    const int    x = 40;
    const int    y = height() - h - 50;

    painter->fillRect( x, y, w, h, QColor( 0, 0, 0, bg_a ) );    // backdrop
    painter->fillRect( x, y, 5, h, QColor( 120, 200, 255, a ) ); // accent bar

    painter->setFont( tf );
    painter->setPen( QColor( 255, 255, 255, a ) );
    painter->drawText( x + 22, y + 34, title );
    painter->setFont( af );
    painter->setPen( QColor( 180, 210, 240, a ) );
    painter->drawText( x + 22, y + 58, artist );
}

// ---------------------------------------------------------------------------
// Remote-control menu (OsdMenu): the tree. Every row goes through the same
// setters/getters the keyboard shortcuts and the web remote use.
// ---------------------------------------------------------------------------
namespace
{

/**  A menu text in the current UI language.
 *
 * @param id  The string's id. (in)
 *
 * @return
 *   The text.
 **/
QString osdT( StrIdE id )
{
    return QString::fromUtf8( Strings::uiText( id ) );
}

/**  A row that opens a submenu.
 *
 * @param id    The row's label. (in)
 * @param kids  Builds the submenu's rows when it opens. (in)
 *
 * @return
 *   The row.
 **/
OsdItem osdSub( StrIdE id, std::function<std::vector<OsdItem>()> kids )
{
    OsdItem it;
    it.kind = OsdItem::SUBMENU;
    it.label = osdT( id );
    it.children = std::move( kids );
    return it;
}
/**  A row that runs an action.
 *
 * @param label       The row's text. (in)
 * @param fn          The action. (in)
 * @param closeAfter  Whether the menu closes after the action. (in)
 * @param confirm     Whether the hint line confirms the action afterwards ("done"). (in)
 *
 * @return
 *   The row.
 **/
OsdItem osdAct( const QString &label, std::function<void()> fn, bool closeAfter = false, bool confirm = false )
{
    OsdItem it;
    it.kind = OsdItem::ACTION;
    it.label = label;
    it.action = std::move( fn );
    it.closeAfter = closeAfter;
    if ( confirm )
        it.doneText = osdT( S_OSD_DONE );
    return it;
}
/**  A row that switches something on and off.
 *
 * @param id   The row's label. (in)
 * @param get  Reads the current state. (in)
 * @param set  Sets the new state. (in)
 *
 * @return
 *   The row.
 **/
OsdItem osdToggle( StrIdE id, std::function<bool()> get, std::function<void( bool )> set )
{
    OsdItem it;
    it.kind = OsdItem::TOGGLE;
    it.label = osdT( id );
    it.getB = std::move( get );
    it.setB = std::move( set );
    return it;
}
/**  A row that picks one of several options.
 *
 * @param id    The row's label. (in)
 * @param opts  The options' texts. (in)
 * @param get   Reads the index of the current option. (in)
 * @param set   Selects an option by index. (in)
 *
 * @return
 *   The row.
 **/
OsdItem osdChoice( StrIdE id, const QStringList &opts, std::function<int()> get, std::function<void( int )> set )
{
    OsdItem it;
    it.kind = OsdItem::CHOICE;
    it.label = osdT( id );
    it.options = opts;
    it.getI = std::move( get );
    it.setI = std::move( set );
    return it;
}
/**  A row that sets a value with left and right.
 *
 * @param id    The row's label. (in)
 * @param lo    Smallest value. (in)
 * @param hi    Largest value. (in)
 * @param step  Change per key press. (in)
 * @param get   Reads the current value. (in)
 * @param set   Sets the new value. (in)
 * @param fmt   Formats the value for display; empty for the default format. (in)
 *
 * @return
 *   The row.
 **/
OsdItem osdSlider( StrIdE id, float lo, float hi, float step, std::function<float()> get,
                   std::function<void( float )> set, std::function<QString( float )> fmt = {} )
{
    OsdItem it;
    it.kind = OsdItem::SLIDER;
    it.label = osdT( id );
    it.lo = lo;
    it.hi = hi;
    it.step = step;
    it.getF = std::move( get );
    it.setF = std::move( set );
    it.fmt = std::move( fmt );
    return it;
}

} // namespace

void GLwidget::openOsdMenu()
{
    m_osd.setRootTitle( []
    { return osdT( S_OSD_TITLE ); } );
    m_osd.open( osdT( S_OSD_TITLE ), [this]
    { return osdRootItems(); } );
}

void GLwidget::openQuitConfirm()
{
    m_osd.setRootTitle( []
    { return osdT( S_OSD_QUIT_TITLE ); } );
    m_osd.open( osdT( S_OSD_QUIT_TITLE ), [this]
    {
        return std::vector<OsdItem>{
            osdAct( osdT( S_OSD_QUIT_NO ), [] {}, true ), // first row: OK by reflex does no harm
            osdAct( osdT( S_OSD_QUIT_YES ), [this]
        { saveAllSettings( false ); exit( 0 ); } ),
        };
    } );
}

std::vector<OsdItem> GLwidget::osdPresetItems()
{
    std::vector<OsdItem> v;
    for ( int i = 0; i < static_cast<int>( m_configurationList.size() ); ++i )
    {
        Configuration *c = m_configurationList[i];
        OsdItem        it = osdAct( c->getConfigurationName(), [this, i]
        { remoteSelectConfig( i ); }, true );
        it.checked = [this, c]
        { return c == m_actConfiguration; };
        v.push_back( it );
    }
    return v;
}

std::vector<OsdItem> GLwidget::osdAudioSourceItems()
{
    std::vector<OsdItem> v;
    QList<AudioDevice>   devs;
    if ( m_audioAnalyzer )
        devs = m_audioAnalyzer->devices();
    auto current_row = [this]() -> int
    {
        if ( !m_audioAnalyzer )
            return 0;
        const QString            cur = m_audioAnalyzer->currentDeviceName();
        const QList<AudioDevice> d = m_audioAnalyzer->devices();
        for ( int i = 0; i < d.size(); ++i )
            if ( !cur.isEmpty() && d[i].name == cur )
                return i + 1;
        return 0;
    };
    OsdItem def = osdAct( osdT( S_AUDIOMENU_DEFAULT_OUTPUT ), [this]
    { selectAudioDevice( 0 ); }, false, true );
    def.checked = [current_row]
    { return current_row() == 0; };
    v.push_back( def );
    for ( int i = 0; i < devs.size(); ++i )
    {
        const QString tag = osdT( devs[i].isCapture ? S_AUDIOMENU_INPUT_TAG : S_AUDIOMENU_OUTPUT_TAG );
        OsdItem       it = osdAct( devs[i].name + tag, [this, i]
        { selectAudioDevice( i + 1 ); }, false, true );
        it.checked = [current_row, i]
        { return current_row() == i + 1; };
        v.push_back( it );
    }
    return v;
}

std::vector<OsdItem> GLwidget::osdRootItems()
{
    std::vector<OsdItem> root;

    root.push_back( osdSub( S_OSD_PRESETS, [this]
    { return osdPresetItems(); } ) );

    root.push_back( osdSub( S_OSD_SCENE, [this]
    {
        std::vector<OsdItem> v{
            osdAct( osdT( S_OSD_NEXT ), [this]
        { remoteNextEffect(); }, false, true ),
            osdToggle( S_OSD_PIN, []
        { return RenderPipeline::pinned(); },
                       []( bool b )
        { if( b != RenderPipeline::pinned() ) RenderPipeline::togglePin(); } ),
            osdAct( osdT( S_OSD_FAVORITE ), [this]
        { remoteFavorite(); }, false, true ),
            osdAct( osdT( S_OSD_MARK ), [this]
        { remoteToggleMark(); }, false, true ),
            osdAct( osdT( S_OSD_SAVEMARKED ), [this]
        { remoteSaveMarked(); }, false, true ),
        };
        // The taste, correctable: never again, the favourite taken back, this song's cues forgotten, and the
        // banned scenes, each one allowed again with a press.
        v.push_back( osdAct( osdT( S_OSD_BAN ), [this]
        { remoteBan(); }, true, true ) );
        v.push_back( osdAct( osdT( S_OSD_UNFAVORITE ), [this]
        { remoteUnfavorite(); }, false, true ) );
        RenderPipeline *rp = m_actConfiguration ? m_actConfiguration->renderPipeline() : nullptr;
        if ( rp && rp->songCueCount() > 0 )
            v.push_back( osdAct( osdT( S_OSD_FORGETCUES_FMT ).arg( rp->songCueCount() ), [this]
            { remoteForgetCues(); }, false, true ) );
        if ( rp && !rp->bannedScenes().isEmpty() )
            v.push_back( osdSub( S_OSD_BANNED, [this]
            {
                std::vector<OsdItem> b;
                RenderPipeline      *p = m_actConfiguration ? m_actConfiguration->renderPipeline() : nullptr;
                for ( const QString &base : p ? p->bannedScenes() : QStringList() )
                    b.push_back( osdAct( base, [this, base]
                    { remoteUnban( base ); m_osd.requestRebuild(); } ) );
                return b;
            } ) );
        return v;
    } ) );

    root.push_back( osdSub( S_OSD_PICTURE, [this]
    {
        return std::vector<OsdItem>{
            osdToggle( S_OSD_BLACKOUT, []
        { return RenderPipeline::blackout(); },
                       []( bool b )
        {
            if ( b != RenderPipeline::blackout() )
                RenderPipeline::toggleBlackout();
        } ),
            osdToggle( S_OSD_FREEZE, []
        { return RenderPipeline::frozen(); },
                       []( bool b )
        {
            if ( b != RenderPipeline::frozen() )
                RenderPipeline::toggleFreeze();
        } ),
            osdToggle( S_OSD_LIGHTSHOW, []
        { return RenderPipeline::lightShow(); },
                       []( bool b )
        { RenderPipeline::setLightShow( b ); } ),
            osdToggle( S_OSD_STRICTLIGHT, []
        { return RenderPipeline::strictLight(); },
                       []( bool b )
        { RenderPipeline::setStrictLight( b ); } ),
            osdToggle( S_OSD_NOWPLAYING, [this]
        { return nowPlayingEnabled(); },
                       [this]( bool b )
        { setNowPlayingEnabled( b ); } ),
            osdChoice( S_OSD_LYRICS,
                       { osdT( S_WR_LYRICS_OFF ), osdT( S_WR_LYRICS_SCROLL ), osdT( S_WR_LYRICS_KARAOKE ) },
                       [this]
        { return lyricsModeValue(); }, [this]( int m )
        { setLyricsModeValue( m ); } ),
            osdToggle( S_OSD_KINETIC, [this]
        { return m_lyricsKinetic; }, [this]( bool b )
        { m_lyricsKinetic = b; } ),
            osdToggle( S_OSD_ARTIST, [this]
        { return artistImagesEnabled(); },
                       [this]( bool b )
        { setArtistImagesEnabled( b ); } ),
            osdToggle( S_OSD_VIDEO, [this]
        { return videoPipEnabled(); },
                       [this]( bool b )
        { setVideoPipEnabled( b ); } ),
        };
    } ) );

    root.push_back( osdSub( S_OSD_TUNE, []
    {
        auto f1 = []( float v )
        { return QString::number( static_cast<double>( v ), 'f', 1 ); };
        auto f2 = []( float v )
        { return QString::number( static_cast<double>( v ), 'f', 2 ); };
        return std::vector<OsdItem>{
            osdSlider( S_OSD_REACTIVITY, 0.f, 3.f, 0.1f, []
        { return RenderPipeline::reactivity(); },
                       []( float v )
        { RenderPipeline::setReactivity( v ); }, f1 ),
            osdSlider( S_OSD_TRAILS, 0.f, 0.95f, 0.05f, []
        { return RenderPipeline::trails(); },
                       []( float v )
        { RenderPipeline::setTrails( v ); }, f2 ),
            osdSlider( S_OSD_MOOD, 0.f, 2.5f, 0.1f, []
        { return RenderPipeline::mood(); },
                       []( float v )
        { RenderPipeline::setMood( v ); }, f1 ),
            osdSlider( S_OSD_LATENCY, 0.f, 0.25f, 0.01f, []
        { return RenderPipeline::latency(); },
                       []( float v )
        { RenderPipeline::setLatency( v ); },
                       []( float v )
        { return QString( "%1 ms" ).arg( static_cast<int>( std::lround( v * 1000.f ) ) ); } ),
        };
    } ) );

    root.push_back( osdSub( S_OSD_AUDIO, [this]
    {
        return std::vector<OsdItem>{
            osdSub( S_OSD_SOURCE, [this]
        { return osdAudioSourceItems(); } ),
            osdAct( osdT( S_OSD_TAP ), [this]
        { remoteTapTempo(); } ),
        };
    } ) );

    root.push_back( osdSub( S_OSD_STEREO, []
    {
        return std::vector<OsdItem>{
            osdChoice( S_OSD_STEREOMODE,
                       { osdT( S_SETUP_STEREO_OFF ), osdT( S_SETUP_STEREO_SBS ), osdT( S_SETUP_STEREO_TB ),
                         osdT( S_SETUP_STEREO_ANA ) },
                       []
        { return RenderPipeline::stereoMode(); },
                       []( int m )
        { RenderPipeline::setStereoMode( m ); } ),
            osdSlider( S_OSD_STEREODEPTH, 0.f, 2.f, 0.2f, []
        { return RenderPipeline::stereoDepth(); },
                       []( float v )
        { RenderPipeline::setStereoDepth( v ); } ),
        };
    } ) );

    root.push_back( osdSub( S_OSD_AUTO, [this]
    {
        return std::vector<OsdItem>{
            osdToggle( S_OSD_AUTOPRESET, [this]
        { return autoConfigEnabled(); },
                       [this]( bool b )
        { setAutoConfigEnabled( b ); } ),
            osdToggle( S_OSD_AUTOSCALE, [this]
        { return autoScaleEnabled(); },
                       [this]( bool b )
        { setAutoScaleEnabled( b ); } ),
            osdChoice( S_OSD_IDLE, { osdT( S_OSD_OFF ), "5 min", "15 min", "30 min", "60 min" },
                       [this]
        {
            const int m[] = { 0, 5, 15, 30, 60 };
            for ( int i = 4; i > 0; --i )
                if ( m_idleMinutes >= m[i] )
                    return i;
            return 0;
        },
                       [this]( int i )
        {
            const int m[] = { 0, 5, 15, 30, 60 };
            m_idleMinutes = m[std::clamp( i, 0, 4 )];
        } ),
            osdChoice( S_OSD_SLEEPTIMER, { osdT( S_OSD_OFF ), "15 min", "30 min", "60 min", "90 min" },
                       [this]
        {
            const int m[] = { 0, 15, 30, 60, 90 };
            for ( int i = 4; i > 0; --i )
                if ( m_sleepMinutes == m[i] )
                    return i;
            return 0;
        },
                       [this]( int i )
        {
            const int m[] = { 0, 15, 30, 60, 90 };
            m_sleepMinutes = m[std::clamp( i, 0, 4 )];
            m_sleepAt = m_sleepMinutes > 0 ? m_fpsTimer.elapsed() + m_sleepMinutes * 60000LL : 0;
            RenderPipeline::setDim( 1.f );
        } ),
        };
    } ) );

    root.push_back( osdSub( S_OSD_CAPTURE, [this]
    {
        return std::vector<OsdItem>{
            osdToggle( S_OSD_RECORD, [this]
        { return remoteRecording(); },
                       [this]( bool b )
        { if( b != remoteRecording() ) remoteToggleRecord(); } ),
            osdToggle( S_OSD_REPLAYARM, [this]
        { return remoteReplayArmed(); },
                       [this]( bool b )
        { if( b != remoteReplayArmed() ) remoteToggleReplayArm(); } ),
            osdAct( osdT( S_OSD_REPLAYSAVE ), [this]
        { remoteSaveReplay(); }, false, true ),
            // The menu closes first and the grab follows a moment later, or the
            // screenshot would show the menu over the picture.
            // Taken at the next frame's clean point, before any overlay: the menu is never in it.
            osdAct( osdT( S_OSD_SCREENSHOT ), [this]
        { feedback( ui( S_FB_SCREENSHOT_FMT ).arg( remoteScreenshot() ) ); }, true ),
        };
    } ) );

    root.push_back( osdSub( S_OSD_INFO, [this]
    {
        std::vector<OsdItem> v{
            osdToggle( S_OSD_SHADERNAMES, [this]
        { return shaderInfoVisible(); },
                       [this]( bool b )
        { setShaderInfoVisible( b ); } ),
            osdToggle( S_OSD_FEATURES, [this]
        { return featureOverlayVisible(); },
                       [this]( bool b )
        { setFeatureOverlayVisible( b ); } ),
            osdToggle( S_OSD_KEYHELP, [this]
        { return m_showHelp; }, [this]( bool b )
        { m_showHelp = b; } ),
        };
        // Where a phone finds the remote (it was in the log only, and the port may have moved), each address
        // opening the card with its QR code; and how many scenes the missing model pack costs.
        const QStringList urls = remoteUrls();
        if ( urls.isEmpty() )
            v.push_back( osdAct( osdT( S_OSD_REMOTE_OFF ), [] {} ) );
        for ( const QString &u : urls )
            v.push_back( osdAct( osdT( S_OSD_REMOTE_FMT ).arg( u ), [this]
            { showRemoteCard( 60 ); }, true ) );
        if ( m_skippedMesh > 0 )
            v.push_back( osdAct( osdT( S_OSD_MESH_SKIPPED_FMT ).arg( m_skippedMesh ), [] {} ) );
        return v;
    } ) );

    root.push_back( osdSub( S_OSD_SYSTEM, [this]
    {
        std::vector<OsdItem> v;
        // Language names stay in their own language, so the switch can be
        // found whichever one is active.
        v.push_back( osdChoice( S_OSD_LANGUAGE, { QString::fromUtf8( "Deutsch" ), QString( "English" ) },
                                []
        { return Strings::language() == LangE::EN ? 1 : 0; },
                                [this]( int i )
        { Strings::setLanguage( i == 1 ? LangE::EN : LangE::DE ); m_osd.requestRebuild(); } ) );
        v.push_back( osdAct( osdT( S_OSD_SAVEDEFAULTS ), [this]
        { saveAllSettings( true ); }, false, true ) );
        if ( updateAvailable() )
            v.push_back( osdAct( osdT( S_OSD_UPDATE_FMT ).arg( updateVersion() ), [this]
            { remoteInstallUpdate(); }, true ) );
        v.push_back( osdSub( S_OSD_QUIT, [this]
        {
            return std::vector<OsdItem>{
                osdAct( osdT( S_OSD_QUIT_NO ), [] {}, true ),
                osdAct( osdT( S_OSD_QUIT_YES ), [this]
            { saveAllSettings( false ); exit( 0 ); } ),
            };
        } ) );
        return v;
    } ) );

    return root;
}

void GLwidget::keyPressEvent( QKeyEvent *event )
{
    m_cardUntil = 0; // any key closes the remote card, and still does what it does

    // Video export: Esc or q finish the file with the frames so far; the show's
    // keys have nothing to steer here.
    if ( m_export )
    {
        if ( event->key() == Qt::Key_Escape || event->key() == Qt::Key_Q )
            VideoExport::requestCancel();
        return;
    }

    // A resting show (silence, the sleep timer): the first key only wakes it.
    if ( wakeFromRest( "key" ) )
        return;

    // The remote-control menu is modal while it is open: every key belongs
    // to it (arrows, OK, Back, Esc), nothing reaches the shortcuts below.
    if ( m_osd.isOpen() )
    {
        m_osd.handleKey( event->key() );
        return;
    }

    // The configuration picker is modal while it is open: the arrow keys drive
    // its cursor rather than doing whatever they normally do, and Enter picks
    // the highlighted preset. The digit shortcuts still work and still mean the
    // same rows, they just cannot reach past the ninth.
    if ( m_showSelectConfigurationMenu )
    {
        const QVector<int> hits = configMenuMatches();
        switch ( menuNavKey( event->key(), m_configMenuCursor, hits.size() ) )
        {
            case MenuKeyE::MOVED:
                return;
            case MenuKeyE::ACCEPT:
                m_showSelectConfigurationMenu = false;
                if ( m_configMenuCursor >= 0 && m_configMenuCursor < hits.size()
                     && m_configurationList[hits[m_configMenuCursor]] != m_actConfiguration )
                    switchConfig( m_configurationList[hits[m_configMenuCursor]] );
                m_configMenuFilter.clear();
                return;
            case MenuKeyE::CANCEL:
                // Esc peels one layer at a time: clear the filter first, close
                // second. Closing straight away would throw away the typing
                // with no way to see what was matched.
                if ( !m_configMenuFilter.isEmpty() )
                {
                    m_configMenuFilter.clear();
                    m_configMenuCursor = 0;
                }
                else
                    m_showSelectConfigurationMenu = false;
                return;
            case MenuKeyE::NONE:
                break;
            default: // cannot happen: menuNavKey() returns one of the four
                fprintf( stderr, "menu: unknown navigation key\n" );
                break;
        }
        // '0' still closes -- but only while nothing is typed, after which it
        // is a character like any other. Checked BEFORE the filter, or it
        // would be typed instead of closing.
        // '0' still closes -- and so does Backspace with nothing typed, which
        // is what a remote's Back button sends on many models.
        if ( ( event->key() == Qt::Key_0 || event->key() == Qt::Key_Backspace )
             && m_configMenuFilter.isEmpty() )
        {
            m_showSelectConfigurationMenu = false;
            return;
        }
        menuFilterKey( event, m_configMenuFilter, m_configMenuCursor );
        return; // modal: nothing else leaks out of an open menu
    }

    // The audio-source picker is modal while it is open: arrows drive its
    // cursor, Enter picks.
    if ( m_showAudioMenu )
    {
        const QVector<int> hits = audioMenuMatches();
        switch ( menuNavKey( event->key(), m_audioMenuCursor, hits.size() ) )
        {
            case MenuKeyE::MOVED:
                return;
            case MenuKeyE::ACCEPT:
                m_showAudioMenu = false;
                if ( m_audioMenuCursor >= 0 && m_audioMenuCursor < hits.size() )
                    selectAudioDevice( hits[m_audioMenuCursor] );
                m_audioMenuFilter.clear();
                return;
            case MenuKeyE::CANCEL:
                if ( !m_audioMenuFilter.isEmpty() )
                {
                    m_audioMenuFilter.clear();
                    m_audioMenuCursor = 0;
                }
                else
                    m_showAudioMenu = false;
                return;
            case MenuKeyE::NONE:
                break;
            default: // cannot happen: menuNavKey() returns one of the four
                fprintf( stderr, "menu: unknown navigation key\n" );
                break;
        }
        // 'd' closes while nothing is typed; after that it is just a letter,
        // which matters here because most device names contain one.
        if ( ( event->key() == Qt::Key_D || event->key() == Qt::Key_Backspace )
             && m_audioMenuFilter.isEmpty() )
        {
            m_showAudioMenu = false;
            return;
        }
        menuFilterKey( event, m_audioMenuFilter, m_audioMenuCursor );
        return; // modal
    }

    switch ( event->key() )
    {
        // Esc no longer quits at once: on a remote it sits next to Back and
        // is pressed by reflex. It closes the help box if that is up, and
        // otherwise asks first. 'q' still quits immediately (keyboard).
        case Qt::Key_Escape:
            if ( m_showHelp )
                m_showHelp = false;
            else
                openQuitConfirm();
            break;
        case Qt::Key_Back: // remote "Back" outside any menu: only closes the help box
        case Qt::Key_Backspace:
            m_showHelp = false;
            break;

        // ---- Remote control: OK / Menu key open the on-screen menu ----
        case Qt::Key_Return:
        case Qt::Key_Enter:
        case Qt::Key_Menu:
        case Qt::Key_Select:
            openOsdMenu();
            break;

        // ---- Remote media keys ----
        case Qt::Key_MediaNext:
        case Qt::Key_MediaPrevious:
            remoteNextEffect();
            break;
        case Qt::Key_MediaPlay:
        case Qt::Key_MediaPause:
        case Qt::Key_MediaTogglePlayPause:
            RenderPipeline::toggleFreeze();
            break;
        case Qt::Key_MediaStop:
            RenderPipeline::toggleBlackout();
            break;
        case Qt::Key_Q:
            saveAllSettings( false );
            exit( 0 );
            break;
        case Qt::Key_0:
            m_showSelectConfigurationMenu = !m_showSelectConfigurationMenu;
            // Open on the preset that is running, so Enter straight away is a
            // no-op rather than a jump to whatever happened to be first.
            if ( m_showSelectConfigurationMenu )
            {
                const int act = remoteActiveConfig();
                m_configMenuCursor = ( act >= 0 ) ? act : 0;
            }
            break;
        case Qt::Key_I:
            m_showFeatureOverlay = !m_showFeatureOverlay;
            break;
        case Qt::Key_H:
            m_showHelp = !m_showHelp;
            break;
        case Qt::Key_V:
            m_showShaderInfo = !m_showShaderInfo; // debug: which shaders are active
            break;
        case Qt::Key_D:
            m_showAudioMenu = true; // closed again from the modal handler above
            // Open on the source that is feeding the analyzer, so Enter right
            // away changes nothing.
            m_audioMenuCursor = 0;
            if ( m_audioAnalyzer )
            {
                const QString cur = m_audioAnalyzer->currentDeviceName();
                if ( !cur.isEmpty() )
                {
                    const QList<AudioDevice> devs = m_audioAnalyzer->devices();
                    for ( int i = 0; i < devs.size(); ++i )
                        if ( devs[i].name == cur )
                        {
                            m_audioMenuCursor = i + 1;
                            break;
                        }
                }
            }
            break;
        case Qt::Key_P:
            setNowPlayingEnabled( !m_showNowPlaying );
            feedback( ui( S_FB_NOWPLAYING_FMT ).arg( onOff( m_showNowPlaying ) ) );
            break;

        // ---- Lyrics mode, cyclic: off -> scroll -> karaoke ----
        // Shift+W: kinetic line slam on/off (separate, since some find the
        // fly-in on a line change too restless).
        case Qt::Key_W:
        {
            if ( event->modifiers() & Qt::ShiftModifier )
            {
                m_lyricsKinetic = !m_lyricsKinetic;
                feedback( ui( S_FB_KINETIC_FMT ).arg( onOff( m_lyricsKinetic ) ) );
                break;
            }
            setLyricsModeValue( ( m_lyricsMode + 1 ) % 3 );
            const StrIdE lyrics_names[] = { S_FB_OFF, S_FB_LYRICS_SCROLL, S_FB_LYRICS_KARAOKE };
            feedback( ui( S_FB_LYRICS_FMT ).arg( ui( lyrics_names[m_lyricsMode % 3] ) ) );
            break;
        }

        // ---- Artist images on/off ----
        case Qt::Key_O:
            setArtistImagesEnabled( !m_artistShow );
            feedback( ui( S_FB_ARTIST_FMT ).arg( onOff( m_artistShow ) ) );
            break;
        case Qt::Key_R:
            m_recorder.toggle(); // record visuals + music to an mp4
            break;
        case Qt::Key_L:
            RenderPipeline::toggleLightShow(); // corner lamps / light-show on/off
            feedback( ui( S_FB_LAMPS_FMT ).arg( onOff( RenderPipeline::lightShow() ) ) );
            break;
        case Qt::Key_N:
            // Manually advance to the next effect (texture + combine), snappy cut.
            if ( m_actConfiguration && m_actConfiguration->renderPipeline() )
            {
                const int held = m_actConfiguration->renderPipeline()->requestSceneChange();
                if ( held )
                    feedback( ui( held == 1 ? S_FB_NEXT_PINNED : S_FB_NEXT_FROZEN ) );
                else
                    fprintf( stderr, "n: next effect requested\n" );
            }
            break;

        // ---- Live tuning (values shared across all configs) ----
        case Qt::Key_BracketLeft: RenderPipeline::adjustReactivity( -0.10f ); break;  // [  less reactive
        case Qt::Key_BracketRight: RenderPipeline::adjustReactivity( +0.10f ); break; // ]  more reactive
        case Qt::Key_Comma: RenderPipeline::adjustTrails( -0.05f ); break;            // ,  shorter trails
        case Qt::Key_Period: RenderPipeline::adjustTrails( +0.05f ); break;           // .  longer trails
        case Qt::Key_Minus: RenderPipeline::adjustMood( -0.10f ); break;              // -  less mood colour
        case Qt::Key_Equal: RenderPipeline::adjustMood( +0.10f ); break;              // =  more mood colour
        case Qt::Key_Semicolon:                                                       // ;  less latency lead
        case Qt::Key_Apostrophe:                                                      // '  more latency lead
            RenderPipeline::adjustLatency( event->key() == Qt::Key_Apostrophe ? +0.01f : -0.01f );
            feedback( ui( S_FB_LATENCY_FMT ).arg( qRound( RenderPipeline::latency() * 1000.f ) ) );
            break;

        // ---- Persist the current look + UI state as the startup default ----
        case Qt::Key_K:
            saveAllSettings( true );
            feedback( ui( S_FB_SAVED_DEFAULTS ) );
            break;

        // ---- Instant replay: 'y' arms the rolling buffer, 'x' saves it ----
        case Qt::Key_Y:
            m_recorder.toggleReplayArm();
            break;
        case Qt::Key_X:
            m_recorder.saveReplay();
            break;

        // ---- VJ handbrakes ----
        case Qt::Key_B:
            RenderPipeline::toggleBlackout();
            fprintf( stderr, "Blackout: %s\n", RenderPipeline::blackout() ? "AN" : "AUS" );
            break;
        case Qt::Key_E:
            RenderPipeline::toggleFreeze();
            fprintf( stderr, "Freeze: %s\n", RenderPipeline::frozen() ? "AN" : "AUS" );
            break;
        case Qt::Key_T:
            if ( m_audioAnalyzer )
            {
                const float bpm = m_audioAnalyzer->tapTempo();
                feedback( bpm > 0.f ? ui( S_FB_TAP_FMT ).arg( bpm, 0, 'f', 1 ) : ui( S_FB_TAP_MORE ) );
            }
            break;
        case Qt::Key_U:
            RenderPipeline::togglePin();
            feedback( ui( S_FB_PIN_FMT ).arg( onOff( RenderPipeline::pinned() ) ) );
            break;

        // ---- Taste learning: favourite the current effect ----
        case Qt::Key_F:
            remoteFavorite();
            break;

        // ---- Scene marking (build a shortlist while watching) ----
        // Space alone toggles the mark on whatever is on screen; Shift+Space
        // writes the shortlist out as Presets/Marked.xml. Deliberately
        // two gestures on one key: marking happens constantly during an
        // inspection pass, saving once at the end.
        case Qt::Key_Space:
            if ( m_actConfiguration && m_actConfiguration->renderPipeline() )
            {
                RenderPipeline *rp = m_actConfiguration->renderPipeline();
                if ( event->modifiers() & Qt::ShiftModifier )
                    rp->saveMarkedPreset();
                else
                    rp->toggleMarkCurrentScene();
                // The shader-info overlay ('v') carries the mark state, so an
                // inspection pass gets visible feedback without a console.
                m_showShaderInfo = true;
            }
            break;

        // ---- Stereoscopic output ----
        case Qt::Key_Z:
        {
            RenderPipeline::cycleStereo();
            const int mode = RenderPipeline::stereoMode() & 3;
            feedback( ui( S_FB_STEREO_FMT )
                          .arg( mode == 0 ? onOff( false )
                                          : QString( mode == 1 ? "Side-by-Side" : mode == 2 ? "Top-Bottom"
                                                                                            : "Anaglyph" ) ) );
            break;
        }
        case Qt::Key_C:
            RenderPipeline::adjustStereoDepth( -0.2f );
            feedback( ui( S_FB_STEREO_DEPTH_FMT ).arg( RenderPipeline::stereoDepth(), 0, 'f', 1 ) );
            break;
        case Qt::Key_M:
            RenderPipeline::adjustStereoDepth( +0.2f );
            feedback( ui( S_FB_STEREO_DEPTH_FMT ).arg( RenderPipeline::stereoDepth(), 0, 'f', 1 ) );
            break;

        // ---- MIDI learn: cycle through the assignable targets ----
        case Qt::Key_J:
            m_midiLearn = ( m_midiLearn < 0 ) ? 0
                                              : ( m_midiLearn + 1 >= MIDI_TARGETS ? -1 : m_midiLearn + 1 );
            // On screen for as long as it waits: the target used to be named on stderr only, which a windowed
            // build without -l has nowhere.
            if ( m_midiLearn >= 0 )
                feedback( ui( S_FB_MIDI_LEARN_FMT ).arg( kMidiTargetNames[m_midiLearn] ), 24 * 3600 * 1000 );
            else
                feedback( ui( S_FB_MIDI_OFF ) );
            break;

        // ---- Auto-config-by-mood toggle ----
        case Qt::Key_A:
            m_autoConfig = !m_autoConfig;
            m_moodBucket = -1; // re-evaluate from scratch
            feedback( ui( S_FB_AUTOPRESET_FMT ).arg( onOff( m_autoConfig ) ) );
            break;

        // ---- Adaptive render-scale toggle ----
        case Qt::Key_G:
            setAutoScaleEnabled( !m_autoScale );
            feedback( ui( S_FB_AUTOSCALE_FMT ).arg( onOff( m_autoScale ) ) );
            break;

        // ---- Screenshot (this window only) ----
        case Qt::Key_S:
            feedback( ui( S_FB_SCREENSHOT_FMT ).arg( QDir::toNativeSeparators( remoteScreenshot() ) ) );
            break;
            // '1'-'9' used to jump straight to a preset. The scrolling menu on '0'
            // reaches every preset, including the ones those keys never could, so
            // the digits are free again -- nine keys is a lot to spend on a
            // shortcut that only covered part of the list.

        default:
            event->ignore();
            break;
    }
}
