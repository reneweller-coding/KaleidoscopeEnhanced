/*****************************************************************************\
 *                              ExportWindow
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Implementation of ExportWindow: see ExportWindow.h.
 *
 *  @author René Weller
 */

#include "ExportWindow.h"

#include <algorithm>
#include <cmath>

#include <QtCore/QCoreApplication>
#include <QtCore/QDir>
#include <QtCore/QDirIterator>
#include <QtCore/QFile>
#include <QtCore/QFileInfo>
#include <QtCore/QLocale>
#include <QtCore/QMimeData>
#include <QtCore/QPointer>
#include <QtCore/QProcessEnvironment>
#include <QtCore/QRegularExpression>
#include <QtCore/QSet>
#include <QtCore/QSettings>
#include <QtCore/QTimer>
#include <QtCore/QUrl>
#include <QtCore/QVersionNumber>
#include <QtCore/QXmlStreamReader>
#include <QtGui/QCloseEvent>
#include <QtGui/QDesktopServices>
#include <QtGui/QDragEnterEvent>
#include <QtGui/QDragLeaveEvent>
#include <QtGui/QDragMoveEvent>
#include <QtGui/QDropEvent>
#include <QtGui/QIcon>
#include <QtWidgets/QCheckBox>
#include <QtWidgets/QComboBox>
#include <QtWidgets/QFileDialog>
#include <QtWidgets/QFormLayout>
#include <QtWidgets/QGroupBox>
#include <QtWidgets/QHBoxLayout>
#include <QtWidgets/QLabel>
#include <QtWidgets/QLineEdit>
#include <QtWidgets/QMessageBox>
#include <QtWidgets/QPlainTextEdit>
#include <QtWidgets/QProgressBar>
#include <QtWidgets/QPushButton>
#include <QtWidgets/QVBoxLayout>

/**  Translated UI string for the current language as a QString.
 *
 * @param id  String table entry. (in)
 *
 * @return
 *   The UTF-8 text of @p id in the current language.
 **/
static QString ui( StrIdE id )
{
    return QString::fromUtf8( Strings::uiText( id ) );
}

/**  A duration as a clock: "m:ss", from an hour on "h:mm:ss".
 *
 * @param secs  Seconds. (in)
 *
 * @return
 *   The text.
 **/
static QString clockText( double secs )
{
    const int s = std::max( 0, static_cast<int>( secs + 0.5 ) );
    if ( s >= 3600 )
        return QString( "%1:%2:%3" )
            .arg( s / 3600 )
            .arg( ( s / 60 ) % 60, 2, 10, QChar( '0' ) )
            .arg( s % 60, 2, 10, QChar( '0' ) );
    return QString( "%1:%2" ).arg( s / 60 ).arg( s % 60, 2, 10, QChar( '0' ) );
}

/**  A file size for people: "870 MB", "1,7 GB" (in the system's number format).
 *
 * @param bytes  The size. (in)
 *
 * @return
 *   The text.
 **/
static QString sizeText( double bytes )
{
    if ( bytes >= 1e9 )
        return QLocale().toString( bytes / 1e9, 'f', 1 ) + " GB";
    return QLocale().toString( bytes / 1e6, 'f', 0 ) + " MB";
}

/** File endings a drop is taken for: the audio formats, and the containers music often comes in (ffmpeg reads the
 * sound of all of them). Anything else is refused while it is still being dragged, so the cursor says so at once.
 **/
static const QStringList AudioSuffixes = { "wav", "wave", "mp3", "ogg", "oga", "opus", "flac", "m4a", "aac", "wma",
                                           "aif", "aiff", "aifc", "alac", "ape", "wv", "mka", "mp2", "ac3", "mp4",
                                           "mkv", "mov", "webm" };

/**  A path as typed or pasted, without the quotes Explorer's "Copy as path" puts around it.
 *
 * @param p  The text. (in)
 *
 * @return
 *   The path, trimmed and unquoted.
 **/
static QString cleanPath( QString p )
{
    p = p.trimmed();
    if ( p.size() >= 2 && p.startsWith( '"' ) && p.endsWith( '"' ) )
        p = p.mid( 1, p.size() - 2 ).trimmed();
    return p;
}

/**  Whether two paths name the same file or folder (Windows: regardless of case and separators).
 *
 * @param a  One path. (in)
 * @param b  The other. (in)
 *
 * @return
 *   true if they are the same.
 **/
static bool samePath( const QString &a, const QString &b )
{
    return QDir::cleanPath( QFileInfo( a ).absoluteFilePath() )
               .compare( QDir::cleanPath( QFileInfo( b ).absoluteFilePath() ), Qt::CaseInsensitive )
           == 0;
}

/**  The first local audio file a drag carries.
 *
 * @param md  What is being dragged. (in)
 *
 * @return
 *   Its absolute path, or empty if the drag holds none.
 **/
static QString droppedAudio( const QMimeData *md )
{
    if ( !md || !md->hasUrls() )
        return QString();
    for ( const QUrl &u : md->urls() )
    {
        const QFileInfo fi( u.toLocalFile() );
        if ( u.isLocalFile() && fi.isFile() && AudioSuffixes.contains( fi.suffix().toLower() ) )
            return fi.absoluteFilePath();
    }
    return QString();
}

/**  The encoder's bitrate ceiling the engine sets (VideoExport::pickEncoder()), for the size estimate.
 *
 * @param w    Video width. (in)
 * @param h    Video height. (in)
 * @param fps  Frame rate. (in)
 *
 * @return
 *   Megabits per second.
 **/
static double ceilingMbit( int w, int h, int fps )
{
    const double rate = static_cast<double>( w ) * h * fps;
    return std::max( 8.0, std::floor( 60.0 * std::pow( rate / ( 1920.0 * 1080.0 * 60.0 ), 0.75 ) ) );
}

QString ExportWindow::findRootDir()
{
    QDir dir( QCoreApplication::applicationDirPath() );
    // dev build: ExportTool\build\Release -> the repository root is three up; the package: bin -> one up
    for ( int i = 0; i < 6; ++i )
    {
        if ( dir.exists( "Presets" ) )
            return dir.absolutePath();
        if ( !dir.cdUp() )
            break;
    }
    return QCoreApplication::applicationDirPath();
}

QString ExportWindow::settingsPath()
{
    return findRootDir() + "/kaleidoscope_settings.ini";
}

QStringList ExportWindow::discoverPresets()
{
    QSettings     ini( settingsPath(), QSettings::IniFormat );
    const bool    with_hidden = ini.value( "showHiddenPresets", false ).toBool();
    QStringList   names;
    const QString dir = findRootDir() + "/Presets";
    for ( const QString &fn : QDir( dir ).entryList( { "*.xml" }, QDir::Files, QDir::Name ) )
    {
        QFile f( QDir( dir ).absoluteFilePath( fn ) );
        if ( !f.open( QIODevice::ReadOnly ) )
            continue;
        // Only the root element's attributes: some presets are megabytes long.
        QXmlStreamReader xml( &f );
        if ( xml.readNextStartElement() )
        {
            const QString name = xml.attributes().value( "ConfigurationName" ).toString();
            const bool    hidden = xml.attributes().value( "hidden" ).toString() == "true";
            if ( !name.isEmpty() && ( with_hidden || !hidden ) )
                names << name;
        }
    }
    names.sort( Qt::CaseInsensitive );
    return names;
}

QString ExportWindow::findEngine()
{
    const QString root = findRootDir();
    for ( const QString &c : { QCoreApplication::applicationDirPath() + "/Kaleidoscope.exe",
                               root + "/bin/Kaleidoscope.exe", root + "/Release/Kaleidoscope.exe" } )
        if ( QFileInfo( c ).isFile() )
            return QFileInfo( c ).absoluteFilePath();
    return QString();
}

QString ExportWindow::ffmpegVersion( const QString &exe )
{
    QProcess p;
    p.start( exe, { "-hide_banner", "-version" } );
    if ( !p.waitForFinished( 8000 ) )
    {
        p.kill();
        p.waitForFinished( 2000 );
        return QString();
    }
    const QRegularExpressionMatch m =
        QRegularExpression( "ffmpeg version (\\S+)" ).match( QString::fromLocal8Bit( p.readAllStandardOutput() ) );
    return m.hasMatch() ? m.captured( 1 ) : QString();
}

QList<ExportWindow::Ffmpeg> ExportWindow::findFfmpegs()
{
    // Every ffmpeg the PATH holds, not only the first, then the package managers' folders: a machine often has an
    // old one on the PATH and a newer one that winget installed beside it.
    QStringList cands;
    for ( const QString &d : qEnvironmentVariable( "PATH" ).split( QDir::listSeparator(), Qt::SkipEmptyParts ) )
        cands << QDir( d ).filePath( "ffmpeg.exe" );
    const QString local = qEnvironmentVariable( "LOCALAPPDATA" );
    const QDir    winget( local + "/Microsoft/WinGet/Packages" );
    for ( const QFileInfo &d : winget.entryInfoList( { "*ffmpeg*" }, QDir::Dirs | QDir::NoDotAndDotDot ) )
    {
        QDirIterator it( d.absoluteFilePath(), { "ffmpeg.exe" }, QDir::Files, QDirIterator::Subdirectories );
        while ( it.hasNext() )
            cands << it.next();
    }
    cands << local + "/Microsoft/WinGet/Links/ffmpeg.exe"
          << QDir::homePath() + "/scoop/apps/ffmpeg/current/bin/ffmpeg.exe"
          << "C:/ProgramData/chocolatey/bin/ffmpeg.exe" << "C:/ffmpeg/bin/ffmpeg.exe"
          << "C:/Program Files/ffmpeg/bin/ffmpeg.exe";

    QList<Ffmpeg> found;
    QSet<QString> seen;
    for ( const QString &c : cands )
    {
        const QFileInfo fi( c );
        if ( !fi.isFile() )
            continue;
        const QString key = fi.canonicalFilePath().toLower(); // a winget link and its target are one ffmpeg
        if ( seen.contains( key ) )
            continue;
        seen.insert( key );
        const QString v = ffmpegVersion( fi.absoluteFilePath() );
        if ( !v.isEmpty() )
            found << Ffmpeg{ fi.absoluteFilePath(), v };
    }
    std::stable_sort( found.begin(), found.end(), []( const Ffmpeg &a, const Ffmpeg &b )
    { return QVersionNumber::fromString( a.version ) > QVersionNumber::fromString( b.version ); } );
    return found;
}

ExportWindow::ExportWindow()
{
    m_root = findRootDir();
    m_engine = findEngine();
    {
        QSettings s( settingsPath(), QSettings::IniFormat );
        Strings::setLanguage( Strings::fromCode( s.value( "language", "de" ).toString().toLocal8Bit().constData() ) );
    }
    setWindowTitle( ui( S_EXPORT_WINDOW_TITLE ) );
    if ( QFileInfo( m_root + "/icon.ico" ).isFile() )
        setWindowIcon( QIcon( m_root + "/icon.ico" ) );
    resize( 640, 600 );

    QVBoxLayout *outer = new QVBoxLayout( this );
    QLabel      *hint = new QLabel( ui( S_EXPORT_HINT ) );
    hint->setWordWrap( true );
    hint->setStyleSheet( "color: #777;" );
    outer->addWidget( hint );

    // ---- source ----
    QGroupBox   *src = new QGroupBox( ui( S_EXPORT_GROUP_SOURCE ) );
    QFormLayout *sf = new QFormLayout( src );
    m_preset = new QComboBox;
    m_preset->addItems( discoverPresets() );
    sf->addRow( ui( S_EXPORT_PRESET ), m_preset );
    m_audio = new QLineEdit;
    m_audio->setPlaceholderText( ui( S_EXPORT_AUDIO_DROP ) );
    QPushButton *pick_audio = new QPushButton( ui( S_EXPORT_AUDIO_PICK ) );
    QHBoxLayout *ar = new QHBoxLayout;
    ar->addWidget( m_audio, 1 );
    ar->addWidget( pick_audio );
    sf->addRow( ui( S_EXPORT_AUDIO ), ar );
    m_audioInfo = new QLabel( " " );
    m_audioInfo->setStyleSheet( "color: #777;" );
    m_audioInfo->setWordWrap( true );
    sf->addRow( QString(), m_audioInfo );
    outer->addWidget( src );

    // ---- video ----
    QGroupBox   *vid = new QGroupBox( ui( S_EXPORT_GROUP_VIDEO ) );
    QFormLayout *vf = new QFormLayout( vid );
    m_res = new QComboBox;
    m_res->addItem( ui( S_EXPORT_RES_FHD ), "1920x1080" );
    m_res->addItem( ui( S_EXPORT_RES_4K ), "3840x2160" );
    vf->addRow( ui( S_EXPORT_RESOLUTION ), m_res );
    m_fps = new QComboBox;
    for ( int f : { 24, 30, 60, 120 } )
        m_fps->addItem( ui( S_EXPORT_FPS_FMT ).arg( f ), f );
    vf->addRow( ui( S_EXPORT_FPS ), m_fps );
    m_codec = new QComboBox;
    m_codec->addItem( ui( S_EXPORT_CODEC_AUTO ), "auto" );
    m_codec->addItem( ui( S_EXPORT_CODEC_H264 ), "h264" );
    m_codec->addItem( ui( S_EXPORT_CODEC_HEVC ), "hevc" );
    m_codec->addItem( ui( S_EXPORT_CODEC_AV1 ), "av1" );
    vf->addRow( ui( S_EXPORT_CODEC ), m_codec );
    m_quality = new QComboBox;
    m_quality->addItem( ui( S_EXPORT_Q_MAX ), "max" );
    m_quality->addItem( ui( S_EXPORT_Q_HIGH ), "high" );
    m_quality->addItem( ui( S_EXPORT_Q_COMPACT ), "compact" );
    vf->addRow( ui( S_EXPORT_QUALITY ), m_quality );
    m_fade = new QCheckBox( ui( S_EXPORT_FADE ) );
    m_title = new QCheckBox( ui( S_EXPORT_TITLE ) );
    m_blur = new QCheckBox( ui( S_EXPORT_BLUR ) );
    vf->addRow( QString(), m_fade );
    vf->addRow( QString(), m_title );
    vf->addRow( QString(), m_blur );
    m_output = new QLineEdit;
    QPushButton *pick_out = new QPushButton( ui( S_EXPORT_OUTPUT_PICK ) );
    QHBoxLayout *orow = new QHBoxLayout;
    orow->addWidget( m_output, 1 );
    orow->addWidget( pick_out );
    vf->addRow( ui( S_EXPORT_OUTPUT ), orow );
    m_ffmpegLabel = new QLabel( "…" );
    m_ffmpegLabel->setWordWrap( true );
    QPushButton *pick_ff = new QPushButton( ui( S_EXPORT_FFMPEG_PICK ) );
    QHBoxLayout *frow = new QHBoxLayout;
    frow->addWidget( m_ffmpegLabel, 1 );
    frow->addWidget( pick_ff );
    vf->addRow( ui( S_EXPORT_FFMPEG ), frow );
    outer->addWidget( vid );

    // ---- run ----
    m_progress = new QProgressBar;
    m_progress->setRange( 0, 1000 );
    m_progress->setValue( 0 );
    m_progress->setTextVisible( false );
    outer->addWidget( m_progress );
    m_status = new QLabel( " " );
    m_status->setWordWrap( true );
    outer->addWidget( m_status );
    QHBoxLayout *buttons = new QHBoxLayout;
    m_start = new QPushButton( ui( S_EXPORT_START ) );
    m_start->setDefault( true );
    m_play = new QPushButton( ui( S_EXPORT_PLAY ) );
    m_showDir = new QPushButton( ui( S_EXPORT_SHOW ) );
    QPushButton *log_btn = new QPushButton( ui( S_EXPORT_DETAILS ) );
    log_btn->setCheckable( true );
    QPushButton *close_btn = new QPushButton( ui( S_EXPORT_CLOSE ) );
    m_play->setEnabled( false );
    m_showDir->setEnabled( false );
    // wide enough for both of its labels, so switching between them never squeezes the text
    m_start->setMinimumWidth( std::max( m_start->fontMetrics().horizontalAdvance( ui( S_EXPORT_START ) ),
                                        m_start->fontMetrics().horizontalAdvance( ui( S_EXPORT_CANCEL ) ) )
                              + 40 );
    buttons->addWidget( m_start );
    buttons->addWidget( m_play );
    buttons->addWidget( m_showDir );
    buttons->addStretch( 1 );
    buttons->addWidget( log_btn );
    buttons->addWidget( close_btn );
    outer->addLayout( buttons );
    m_log = new QPlainTextEdit;
    m_log->setReadOnly( true );
    m_log->setMaximumBlockCount( 2000 );
    m_log->setVisible( false );
    outer->addWidget( m_log, 1 );
    outer->addStretch( 0 );

    m_inputs = { m_preset, m_audio, pick_audio, m_res, m_fps, m_codec, m_quality, m_fade, m_title, m_blur, m_output,
                 pick_out, pick_ff };

    // An audio file dropped anywhere on the window. The text fields would take it as text (a "file:///" line in the
    // field); with drops off they pass it on to the window.
    setAcceptDrops( true );
    m_audio->setAcceptDrops( false );
    m_output->setAcceptDrops( false );
    m_log->setAcceptDrops( false );

    connect( pick_audio, &QPushButton::clicked, this, [this]
    {
        QSettings     s( settingsPath(), QSettings::IniFormat );
        const QString start = m_audio->text().isEmpty() ? s.value( "videoExport/audioDir" ).toString()
                                                        : QFileInfo( m_audio->text() ).absolutePath();
        const QString f = QFileDialog::getOpenFileName( this, ui( S_EXPORT_AUDIO ), start,
                                                        ui( S_EXPORT_AUDIO_FILTER ) );
        if ( !f.isEmpty() )
            setAudio( f );
    } );
    connect( m_audio, &QLineEdit::editingFinished, this, [this]
    {
        // only a different file: leaving the field must not undo an output name typed meanwhile
        if ( cleanPath( m_audio->text() ) != cleanPath( m_audioSet ) )
            setAudio( m_audio->text() );
    } );
    connect( pick_out, &QPushButton::clicked, this, [this]
    {
        const QString f = QFileDialog::getSaveFileName( this, ui( S_EXPORT_OUTPUT ), m_output->text(),
                                                        ui( S_EXPORT_OUTPUT_FILTER ) );
        if ( f.isEmpty() )
            return;
        m_output->setText( QDir::toNativeSeparators( f ) );
        noteOutputDir();
    } );
    connect( m_output, &QLineEdit::editingFinished, this, [this]
    { noteOutputDir(); } );
    connect( pick_ff, &QPushButton::clicked, this, [this]
    {
        const QString f = QFileDialog::getOpenFileName(
            this, ui( S_EXPORT_FFMPEG ), QFileInfo( m_ffmpeg ).absolutePath(), ui( S_EXPORT_FFMPEG_FILTER ) );
        if ( f.isEmpty() || ffmpegVersion( f ).isEmpty() )
            return;
        m_ffmpeg = f;
        m_ffmpegPicked = true;
        showFfmpeg();
        probeAudio();
    } );
    // the frame count and the size limit depend on these
    for ( QComboBox *c : { m_res, m_fps } )
        connect( c, &QComboBox::currentIndexChanged, this, [this]( int )
        { probeAudio(); } );
    connect( m_start, &QPushButton::clicked, this, [this]
    {
        if ( m_proc )
            cancelExport();
        else
            startExport();
    } );
    connect( m_play, &QPushButton::clicked, this, [this]
    { QDesktopServices::openUrl( QUrl::fromLocalFile( m_outFile ) ); } );
    connect( m_showDir, &QPushButton::clicked, this, [this]
    { QProcess::startDetached( "explorer.exe", { "/select,", QDir::toNativeSeparators( m_outFile ) } ); } );
    connect( log_btn, &QPushButton::toggled, m_log, &QWidget::setVisible );
    connect( close_btn, &QPushButton::clicked, this, &QWidget::close );

    loadSettings();
    // Asking every ffmpeg for its version takes a moment: after the window is up.
    QTimer::singleShot( 0, this, [this]
    {
        if ( m_ffmpeg.isEmpty() || !QFileInfo( m_ffmpeg ).isFile() )
        {
            m_ffmpegPicked = false;
            const QList<Ffmpeg> all = findFfmpegs();
            m_ffmpeg = all.isEmpty() ? QString() : all.first().path;
        }
        showFfmpeg();
        probeAudio();
        if ( m_engine.isEmpty() )
            setStatus( ui( S_EXPORT_NOAPP ), true );
    } );
}

void ExportWindow::scripted( const QString &audio, const QString &out, const QString &shots, bool viaDrop )
{
    m_shots = shots;
    if ( viaDrop )
    {
        // What a drop from Explorer delivers: a URL list, first in a drag-enter, then -- if that was taken -- in the
        // drop. Sent to the window directly: nothing touches the real mouse.
        QMimeData md;
        md.setUrls( { QUrl::fromLocalFile( audio ) } );
        QDragEnterEvent enter( QPoint( 40, 40 ), Qt::CopyAction, &md, Qt::LeftButton, Qt::NoModifier );
        QCoreApplication::sendEvent( this, &enter );
        if ( enter.isAccepted() )
        {
            QDropEvent drop( QPointF( 40, 40 ), Qt::CopyAction, &md, Qt::LeftButton, Qt::NoModifier );
            QCoreApplication::sendEvent( this, &drop );
        }
    }
    else
        setAudio( audio );
    if ( !out.isEmpty() )
    {
        m_output->setText( QDir::toNativeSeparators( out ) );
        noteOutputDir();
    }
    // after the constructor's deferred ffmpeg search (queued first, so it runs first)
    QTimer::singleShot( 0, this, [this]
    {
        probeAudio();
        grab().save( m_shots + "_ready.png" );
        if ( cleanPath( m_audio->text() ).isEmpty() )
        {
            QCoreApplication::exit( 5 ); // the drop was refused
            return;
        }
        QFile::remove( cleanPath( m_output->text() ) ); // no overwrite question in a scripted run
        startExport();
        if ( !m_proc )
            QCoreApplication::exit( 3 );
    } );
}

void ExportWindow::dragEnterEvent( QDragEnterEvent *e )
{
    if ( m_proc || droppedAudio( e->mimeData() ).isEmpty() )
    {
        e->ignore();
        return;
    }
    e->acceptProposedAction();
    m_audio->setStyleSheet( "border: 2px solid palette(highlight); border-radius: 3px;" );
}

void ExportWindow::dragMoveEvent( QDragMoveEvent *e )
{
    if ( m_proc || droppedAudio( e->mimeData() ).isEmpty() )
        e->ignore();
    else
        e->acceptProposedAction();
}

void ExportWindow::dragLeaveEvent( QDragLeaveEvent *e )
{
    m_audio->setStyleSheet( QString() );
    e->accept();
}

void ExportWindow::dropEvent( QDropEvent *e )
{
    m_audio->setStyleSheet( QString() );
    const QString f = droppedAudio( e->mimeData() );
    if ( m_proc || f.isEmpty() )
    {
        e->ignore();
        return;
    }
    e->acceptProposedAction();
    setAudio( f );
}

void ExportWindow::setAudio( const QString &path )
{
    const QString p = cleanPath( path );
    m_audio->setText( p.isEmpty() ? QString() : QDir::toNativeSeparators( QFileInfo( p ).absoluteFilePath() ) );
    m_audioSet = m_audio->text();
    probeAudio();
    updateDefaultOutput();
}

void ExportWindow::noteOutputDir()
{
    const QString out = cleanPath( m_output->text() );
    if ( out.isEmpty() || QFileInfo( out ).isRelative() )
        return;
    const QString dir = QFileInfo( out ).absolutePath();
    const QString audio = cleanPath( m_audio->text() );
    // A folder chosen on purpose is kept for the next files; the audio's own folder is merely the default.
    m_outDir = ( !audio.isEmpty() && samePath( dir, QFileInfo( audio ).absolutePath() ) ) ? QString() : dir;
}

void ExportWindow::showFfmpeg()
{
    if ( m_ffmpeg.isEmpty() )
    {
        m_ffmpegLabel->setText( ui( S_EXPORT_FFMPEG_MISSING ) );
        m_ffmpegLabel->setStyleSheet( "color: #c33;" );
        return;
    }
    // The version and the last folders of the path; the whole path in the tooltip (winget's run to 150 characters).
    const QStringList parts = QDir::toNativeSeparators( m_ffmpeg ).split( '\\' );
    const QString     tail = parts.size() > 3 ? QString( "…\\" ) + parts.mid( parts.size() - 3 ).join( '\\' )
                                              : QDir::toNativeSeparators( m_ffmpeg );
    m_ffmpegLabel->setStyleSheet( QString() );
    m_ffmpegLabel->setText( QString( "%1  (%2)" ).arg( ffmpegVersion( m_ffmpeg ).section( '-', 0, 0 ), tail ) );
    m_ffmpegLabel->setToolTip( QDir::toNativeSeparators( m_ffmpeg ) );
}

void ExportWindow::videoSize( int &w, int &h ) const
{
    const QStringList p = m_res->currentData().toString().split( 'x' );
    w = p.value( 0 ).toInt();
    h = p.value( 1 ).toInt();
}

int ExportWindow::videoFps() const
{
    return m_fps->currentData().toInt();
}

void ExportWindow::probeAudio()
{
    m_audioSecs = 0.0;
    const QString f = cleanPath( m_audio->text() );
    if ( f.isEmpty() || !QFileInfo( f ).isFile() )
    {
        m_audioInfo->setText( " " );
        return;
    }
    QString probe = "ffprobe";
    if ( !m_ffmpeg.isEmpty() && QFileInfo( QFileInfo( m_ffmpeg ).absoluteDir().filePath( "ffprobe.exe" ) ).isFile() )
        probe = QFileInfo( m_ffmpeg ).absoluteDir().filePath( "ffprobe.exe" );
    QProcess p;
    p.start( probe,
             { "-v", "error", "-select_streams", "a:0", "-show_entries",
               "stream=codec_name,sample_rate,channels:format=duration", "-of", "default=noprint_wrappers=1", f } );
    QMap<QString, QString> kv;
    if ( p.waitForFinished( 10000 ) )
        for ( const QString &line : QString::fromUtf8( p.readAllStandardOutput() ).split( '\n', Qt::SkipEmptyParts ) )
            kv.insert( line.section( '=', 0, 0 ).trimmed(), line.section( '=', 1 ).trimmed() );
    m_audioSecs = kv.value( "duration" ).toDouble();
    if ( kv.value( "codec_name" ).isEmpty() || m_audioSecs <= 0.0 )
    {
        m_audioInfo->setText( ui( S_EXPORT_AUDIO_BAD ) );
        return;
    }
    int w = 0, h = 0;
    videoSize( w, h );
    const long long frames = static_cast<long long>( std::ceil( m_audioSecs * videoFps() - 1e-6 ) );
    const double    bytes = ( ceilingMbit( w, h, videoFps() ) * 1e6 + 320e3 ) * m_audioSecs / 8.0;
    m_audioInfo->setText( ui( S_EXPORT_AUDIO_INFO_FMT )
                              .arg( clockText( m_audioSecs ), kv.value( "codec_name" ).toUpper(),
                                    QLocale().toString( kv.value( "sample_rate" ).toInt() ), kv.value( "channels" ),
                                    QLocale().toString( frames ), sizeText( bytes ) ) );
}

void ExportWindow::updateDefaultOutput()
{
    const QString audio = cleanPath( m_audio->text() );
    if ( audio.isEmpty() )
        return;
    const QFileInfo a( audio );
    const QDir      dir( m_outDir.isEmpty() ? a.absolutePath() : m_outDir );
    QString         out = dir.filePath( a.completeBaseName() + ".mp4" );
    if ( samePath( out, audio ) ) // the sound of an mp4 (a music video): never propose writing over it
        out = dir.filePath( a.completeBaseName() + " (Kaleidoscope).mp4" );
    m_output->setText( QDir::toNativeSeparators( out ) );
}

void ExportWindow::setStatus( const QString &text, bool error )
{
    m_status->setStyleSheet( error ? "color: #c33;" : QString() );
    m_status->setText( text );
}

void ExportWindow::setRunning( bool on )
{
    for ( QWidget *w : m_inputs )
        w->setEnabled( !on );
    m_start->setText( ui( on ? S_EXPORT_CANCEL : S_EXPORT_START ) );
    m_start->setEnabled( true );
    if ( on )
    {
        m_play->setEnabled( false );
        m_showDir->setEnabled( false );
    }
}

void ExportWindow::startExport()
{
    if ( m_engine.isEmpty() )
        return setStatus( ui( S_EXPORT_NOAPP ), true );
    if ( m_ffmpeg.isEmpty() )
        return setStatus( ui( S_EXPORT_FFMPEG_MISSING ), true );
    const QString audio = cleanPath( m_audio->text() );
    if ( audio.isEmpty() || !QFileInfo( audio ).isFile() )
        return setStatus( ui( S_EXPORT_NEED_AUDIO ), true );
    if ( cleanPath( m_output->text() ).isEmpty() )
        updateDefaultOutput();
    QString out = cleanPath( m_output->text() );
    if ( !out.endsWith( ".mp4", Qt::CaseInsensitive ) )
        out += ".mp4";
    m_output->setText( out );
    if ( QFileInfo::exists( out )
         && QMessageBox::question( this, windowTitle(),
                                   ui( S_EXPORT_OVERWRITE_FMT ).arg( QDir::toNativeSeparators( out ) ) )
                != QMessageBox::Yes )
        return;
    saveSettings();

    int w = 0, h = 0;
    videoSize( w, h );
    QStringList opts;
    opts << m_codec->currentData().toString() << "q=" + m_quality->currentData().toString()
         << ( m_fade->isChecked() ? "fade" : "nofade" );
    if ( m_title->isChecked() )
        opts << "title";
    if ( m_blur->isChecked() )
        opts << "blur";
    const QStringList args = { "-c", m_preset->currentText(), "-e", QDir::toNativeSeparators( audio ), "-g",
                               QString( "%1x%2" ).arg( w ).arg( h ), "-p", QString::number( videoFps() ), "-d",
                               QDir::toNativeSeparators( out ), "-j", opts.join( ',' ) };

    QProcessEnvironment env = QProcessEnvironment::systemEnvironment();
    env.insert( "KALEIDO_FFMPEG", QDir::toNativeSeparators( m_ffmpeg ) );
    // The development tree's Release folder holds no Qt runtime (the package's bin folder does): lend it the kit's.
    const QString engine_dir = QFileInfo( m_engine ).absolutePath();
    if ( !QFileInfo( engine_dir + "/Qt6Core.dll" ).isFile() )
    {
        const QString qt = qEnvironmentVariable( "QTDIR", "C:/Qt/6.11.1/msvc2022_64" ) + "/bin";
        if ( QFileInfo( qt + "/Qt6Core.dll" ).isFile() )
            env.insert( "PATH", QDir::toNativeSeparators( qt ) + QDir::listSeparator() + env.value( "PATH" ) );
    }

    m_proc = new QProcess( this );
    m_proc->setProgram( m_engine );
    m_proc->setArguments( args );
    m_proc->setWorkingDirectory( engine_dir ); // the engine finds its assets as "..\" from here
    m_proc->setProcessEnvironment( env );
    m_proc->setProcessChannelMode( QProcess::SeparateChannels );
    connect( m_proc, &QProcess::readyReadStandardOutput, this, [this]
    { m_proc->readAllStandardOutput(); } ); // drained, or a full pipe would stall the engine
    connect( m_proc, &QProcess::readyReadStandardError, this, [this]
    {
        m_pending += m_proc->readAllStandardError();
        int nl;
        while ( ( nl = m_pending.indexOf( '\n' ) ) >= 0 )
        {
            handleLine( QString::fromUtf8( m_pending.left( nl ) ).trimmed() );
            m_pending.remove( 0, nl + 1 );
        }
    } );
    connect( m_proc, &QProcess::finished, this, [this]( int code, QProcess::ExitStatus st )
    { exportEnded( code, st ); } );
    connect( m_proc, &QProcess::errorOccurred, this, [this]( QProcess::ProcessError e )
    {
        if ( e == QProcess::FailedToStart )
        {
            setStatus( ui( S_EXPORT_NOAPP ), true );
            m_proc->deleteLater();
            m_proc = nullptr;
            setRunning( false );
        }
    } );

    m_log->clear();
    m_log->appendPlainText( QDir::toNativeSeparators( m_engine ) + " " + args.join( ' ' ) );
    m_tail.clear();
    m_pending.clear();
    m_error.clear();
    m_outFile = out;
    m_cancelling = false;
    m_progress->setRange( 0, 0 ); // busy until the first frame
    setStatus( ui( S_EXPORT_PH_DECODE ) );
    setRunning( true );
    m_runClock.start();
    m_proc->start();
}

void ExportWindow::cancelExport()
{
    if ( !m_proc || m_cancelling )
        return;
    m_cancelling = true;
    m_proc->write( "quit\n" ); // the engine finishes the file with the frames so far
    m_start->setEnabled( false );
    // Our own child: if it does not end, it is stuck, and nothing else will end it.
    QPointer<QProcess> p( m_proc );
    QTimer::singleShot( 20000, this, [p]
    {
        if ( p && p->state() != QProcess::NotRunning )
            p->kill();
    } );
}

void ExportWindow::handleLine( const QString &line )
{
    if ( line.isEmpty() )
        return;
    m_tail << line;
    if ( m_tail.size() > 300 )
        m_tail.removeFirst();
    if ( !line.startsWith( "[export] " ) )
    {
        if ( line.contains( "FATAL" ) )
            m_log->appendPlainText( line );
        return;
    }
    const QString rest = line.mid( 9 );
    const QString kind = rest.section( ' ', 0, 0 );
    const QString arg = rest.section( ' ', 1 );
    if ( kind == "progress" )
    {
        // "<frames done> <frames> <seconds> <speed>", twice a second: the bar and the status, not the log
        const QStringList p = arg.split( ' ', Qt::SkipEmptyParts );
        if ( p.size() < 4 )
            return;
        const long long done = p[0].toLongLong(), total = std::max( 1LL, p[1].toLongLong() );
        const double    speed = p[3].toDouble();
        m_progress->setRange( 0, 1000 );
        m_progress->setValue( static_cast<int>( 1000 * done / total ) );
        const double left = speed > 0.0 ? static_cast<double>( total - done ) / videoFps() / speed : 0.0;
        setStatus( ui( S_EXPORT_PROGRESS_FMT )
                       .arg( static_cast<int>( 100 * done / total ) )
                       .arg( QLocale().toString( speed, 'f', 1 ), clockText( left ) ) );
        if ( !m_shots.isEmpty() && !m_shotRunning && 100 * done / total >= 40 )
        {
            m_shotRunning = true;
            grab().save( m_shots + "_running.png" );
        }
        return;
    }
    m_log->appendPlainText( line );
    if ( kind == "phase" )
    {
        if ( arg == "decode" )
            setStatus( ui( S_EXPORT_PH_DECODE ) );
        else if ( arg == "encoder" )
            setStatus( ui( S_EXPORT_PH_ENCODER ) );
        else if ( arg == "finish" )
        {
            m_progress->setRange( 0, 0 );
            setStatus( ui( S_EXPORT_PH_FINISH ) );
        }
    }
    else if ( kind == "audio" )
        setStatus( ui( S_EXPORT_PH_START ) ); // the engine now loads its presets and builds the first scene
    else if ( kind == "error" )
        m_error = arg;
}

void ExportWindow::exportEnded( int code, QProcess::ExitStatus status )
{
    if ( !m_pending.isEmpty() )
        handleLine( QString::fromUtf8( m_pending ).trimmed() );
    m_pending.clear();
    const double secs = m_runClock.elapsed() / 1000.0;
    m_progress->setRange( 0, 1000 );
    setRunning( false );
    const bool have_file = QFileInfo( m_outFile ).isFile();
    if ( status == QProcess::NormalExit && code == 0 )
    {
        m_progress->setValue( 1000 );
        setStatus( ui( S_EXPORT_DONE_FMT )
                       .arg( QFileInfo( m_outFile ).fileName(), sizeText( QFileInfo( m_outFile ).size() ),
                             clockText( secs ),
                             QLocale().toString( secs > 0.0 ? m_audioSecs / secs : 0.0, 'f', 1 ) ) );
    }
    else if ( status == QProcess::NormalExit && code == 1 )
        setStatus( ui( S_EXPORT_CANCELLED_FMT ).arg( QDir::toNativeSeparators( m_outFile ) ) );
    else if ( status == QProcess::NormalExit && code == 2 )
        setStatus( ui( S_EXPORT_FAILED_FMT ).arg( m_error.isEmpty() ? QString( "?" ) : m_error ), true );
    else
    {
        // A crash: the engine's last words are the only clue -- into the log, and the log into view.
        setStatus( ui( S_EXPORT_CRASHED_FMT ).arg( code ), true );
        for ( const QString &l : m_tail )
            m_log->appendPlainText( l );
        m_log->setVisible( true );
    }
    m_play->setEnabled( have_file && ( code == 0 || code == 1 ) );
    m_showDir->setEnabled( have_file );
    m_proc->deleteLater();
    m_proc = nullptr;
    if ( !m_shots.isEmpty() )
    {
        grab().save( m_shots + "_done.png" );
        QCoreApplication::exit( status == QProcess::NormalExit ? code : 4 );
    }
}

void ExportWindow::closeEvent( QCloseEvent *e )
{
    if ( m_proc && m_proc->state() != QProcess::NotRunning )
    {
        if ( QMessageBox::question( this, windowTitle(), ui( S_EXPORT_QUIT_RUNNING ) ) != QMessageBox::Yes )
        {
            e->ignore();
            return;
        }
        cancelExport();
        if ( !m_proc->waitForFinished( 20000 ) )
            m_proc->kill();
    }
    saveSettings();
    e->accept();
}

void ExportWindow::loadSettings()
{
    QSettings s( settingsPath(), QSettings::IniFormat );
    s.beginGroup( "videoExport" );
    const QString preset = s.value( "preset",
                                    QSettings( settingsPath(), QSettings::IniFormat ).value( "activeConfig" ) )
                               .toString();
    const int     pi = m_preset->findText( preset, Qt::MatchFixedString );
    if ( pi >= 0 )
        m_preset->setCurrentIndex( pi );
    auto pick = []( QComboBox *c, const QVariant &v )
    {
        const int i = c->findData( v );
        if ( i >= 0 )
            c->setCurrentIndex( i );
    };
    pick( m_res, s.value( "resolution", "1920x1080" ).toString() );
    pick( m_fps, s.value( "fps", 60 ).toInt() );
    pick( m_codec, s.value( "codec", "auto" ).toString() );
    pick( m_quality, s.value( "quality", "high" ).toString() );
    m_fade->setChecked( s.value( "fade", true ).toBool() );
    m_title->setChecked( s.value( "title", false ).toBool() );
    m_blur->setChecked( s.value( "motionBlur", false ).toBool() );
    m_ffmpeg = s.value( "ffmpeg" ).toString();
    m_ffmpegPicked = !m_ffmpeg.isEmpty();
    s.endGroup();
}

void ExportWindow::saveSettings()
{
    QSettings s( settingsPath(), QSettings::IniFormat );
    s.beginGroup( "videoExport" );
    s.setValue( "preset", m_preset->currentText() );
    s.setValue( "resolution", m_res->currentData() );
    s.setValue( "fps", m_fps->currentData() );
    s.setValue( "codec", m_codec->currentData() );
    s.setValue( "quality", m_quality->currentData() );
    s.setValue( "fade", m_fade->isChecked() );
    s.setValue( "title", m_title->isChecked() );
    s.setValue( "motionBlur", m_blur->isChecked() );
    if ( !cleanPath( m_audio->text() ).isEmpty() )
        s.setValue( "audioDir", QFileInfo( cleanPath( m_audio->text() ) ).absolutePath() );
    // only a choice the user made is remembered; a found one is looked for again next time (it may be updated)
    if ( m_ffmpegPicked )
        s.setValue( "ffmpeg", m_ffmpeg );
    else
        s.remove( "ffmpeg" );
    s.endGroup();
}
