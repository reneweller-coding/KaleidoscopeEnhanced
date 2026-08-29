/**
 * @file SetupWindow.cpp
 * @brief Implementation of SetupWindow: see SetupWindow.h.
 */
#include "SetupWindow.h"

#include <QtWidgets/QCheckBox>
#include <QtWidgets/QComboBox>
#include <QtWidgets/QDoubleSpinBox>
#include <QtWidgets/QSpinBox>
#include <QtWidgets/QLineEdit>
#include <QtWidgets/QLabel>
#include <QtWidgets/QPushButton>
#include <QtWidgets/QGroupBox>
#include <QtWidgets/QFormLayout>
#include <QtWidgets/QVBoxLayout>
#include <QtWidgets/QHBoxLayout>
#include <QtWidgets/QFileDialog>
#include <QtWidgets/QScrollArea>
#include <QtWidgets/QProgressBar>
#include <QtCore/QSettings>
#include <QtCore/QEventLoop>
#include <QtCore/QProcess>
#include <QtCore/QStandardPaths>
#include <QtCore/QStorageInfo>
#include <QtNetwork/QNetworkAccessManager>
#include <QtNetwork/QNetworkReply>
#include <QtNetwork/QNetworkRequest>
#include <QtNetwork/QNetworkProxy>
#include <QtCore/QDir>
#include <QtCore/QCoreApplication>
#include <QtCore/QXmlStreamReader>
#include <QtCore/QFile>
#include <QtCore/QTimer>

static QString S( StrId id ) { return QString::fromUtf8( Strings::T( id ) ); }

// ---- extra-content packs ---------------------------------------------------
// The download URL of a GitHub release asset is deterministic
// (…/releases/download/<tag>/<file>), so this needs no API call, no JSON and no
// rate limit -- just a tag and a filename kept in one place. When a pack is
// re-published under a new tag, change it HERE and nowhere else.
namespace {

struct PackDef
{
	StrId       label;
	const char *tag;         ///< release tag the asset hangs off
	const char *file;        ///< asset filename
	const char *dir;         ///< target folder, relative to the install root
	const char *ext;         ///< what an installed pack leaves behind, for the "installed?" check
	qint64      bytes;       ///< published size, for the up-front total and the space check
};

const PackDef kPacks[4] = {
	{ S_SETUP_PACK_IMAGES,   "images-v2", "KaleidoscopeImages.zip",         "Images", ".jpg", 593LL * 1024 * 1024 },
	{ S_SETUP_PACK_SHIPS,    "models-v2", "KaleidoscopeModels-ships.zip",   "Models", ".glb", 715LL * 1024 * 1024 },
	{ S_SETUP_PACK_STATIONS, "models-v2", "KaleidoscopeModels-stations.zip","Models", ".glb", 259LL * 1024 * 1024 },
	{ S_SETUP_PACK_OBJECTS,  "models-v2", "KaleidoscopeModels-objects.zip", "Models", ".glb", 384LL * 1024 * 1024 },
};

QString packUrl( const PackDef &p )
{
	return QString( "https://github.com/reneweller-coding/KaleidoscopeEnhanced"
	                "/releases/download/%1/%2" ).arg( p.tag, p.file );
}

QString humanSize( qint64 b )
{
	if( b >= 1024LL * 1024 * 1024 )
		return QString::number( b / (1024.0 * 1024 * 1024), 'f', 1 ) + " GB";
	return QString::number( qint64( b / (1024 * 1024) ) ) + " MB";
}

// How many of the pack's files are already sitting in the target folder. The
// packs share a folder (all three model packs land in Models\), so this cannot
// distinguish WHICH pack is installed -- it answers "is there content of this
// kind", which is what the checkbox default actually needs.
int installedCount( const QString &root, const PackDef &p )
{
	QDir d( root + "/" + p.dir );
	if( !d.exists() ) return 0;
	return d.entryList( QStringList() << ( "*" + QString( p.ext ) ), QDir::Files ).size();
}

// Unpack with the bsdtar that has shipped in System32 since Windows 10 1803;
// it reads zip and is a single fast process. PowerShell's Expand-Archive is
// the fallback for an older machine -- correct but markedly slower, and it is
// not worth making it the primary path for that.
bool extractZip( const QString &zip, const QString &destDir, QString *err )
{
	QDir().mkpath( destDir );
	const QString tar = QDir::rootPath() + "Windows/System32/tar.exe";
	if( QFile::exists( tar ) )
	{
		QProcess proc;
		proc.start( tar, QStringList() << "-xf" << QDir::toNativeSeparators( zip )
		                               << "-C" << QDir::toNativeSeparators( destDir ) );
		if( proc.waitForStarted( 10000 ) && proc.waitForFinished( -1 )
		    && proc.exitStatus() == QProcess::NormalExit && proc.exitCode() == 0 )
			return true;
		if( err ) *err = QString::fromLocal8Bit( proc.readAllStandardError() ).trimmed();
		if( err && err->isEmpty() ) *err = "tar exit " + QString::number( proc.exitCode() );
		return false;
	}
	QProcess ps;
	ps.start( "powershell", QStringList() << "-NoProfile" << "-NonInteractive" << "-Command"
	          << QString( "Expand-Archive -LiteralPath '%1' -DestinationPath '%2' -Force" )
	             .arg( QDir::toNativeSeparators( zip ), QDir::toNativeSeparators( destDir ) ) );
	if( ps.waitForStarted( 10000 ) && ps.waitForFinished( -1 ) && ps.exitCode() == 0 )
		return true;
	if( err ) *err = QString::fromLocal8Bit( ps.readAllStandardError() ).trimmed();
	return false;
}

} // namespace

QString SetupWindow::findRootDir()
{
	QDir dir( QCoreApplication::applicationDirPath() );
	// Walk up at most a handful of levels (dev build: SetupTool\build\Release\
	// -> repo root is 3 up; a deployed layout might nest differently) looking
	// for the "Configurations" folder every layout is guaranteed to have
	// alongside kaleidoscope_settings.ini.
	for( int i = 0; i < 6; ++i )
	{
		if( dir.exists( "Configurations" ) )
			return dir.absolutePath();
		if( !dir.cdUp() )
			break;
	}
	return QCoreApplication::applicationDirPath();   // landmark not found - fall back, if unusable the load/save just no-ops
}

QString SetupWindow::settingsPath()
{
	return findRootDir() + "/kaleidoscope_settings.ini";
}

QStringList SetupWindow::discoverConfigNames()
{
	QStringList names;
	QDir cfgDir( findRootDir() + "/Configurations" );
	for( const QString &fn : cfgDir.entryList( QStringList() << "*.xml", QDir::Files, QDir::Name ) )
	{
		QFile f( cfgDir.absoluteFilePath( fn ) );
		if( !f.open( QIODevice::ReadOnly ) )
			continue;
		QXmlStreamReader xml( &f );
		// Only the ROOT element's attributes are needed (ConfigurationName,
		// hidden) -- stop right after it instead of parsing the whole file
		// (some of these are several MB, one entry per scene).
		if( xml.readNextStartElement() )
		{
			const QString name = xml.attributes().value( "ConfigurationName" ).toString();
			const bool hidden   = xml.attributes().value( "hidden" ).toString() == "true";
			if( !name.isEmpty() && !hidden )
				names << name;
		}
	}
	names.sort( Qt::CaseInsensitive );
	return names;
}

SetupWindow::SetupWindow()
{
	// Peek at the persisted language BEFORE any widget exists, so the very
	// first buildContent() below already uses it (not always German first,
	// then a flash to the real language once loadFromIni() runs later).
	{
		QSettings s( settingsPath(), QSettings::IniFormat );
		Strings::setLanguage( Strings::fromCode(
		    s.value( "language", "de" ).toString().toLocal8Bit().constData() ) );
	}

	// Wider than it used to be: the download panel's rows ("3D: Raumschiffe
	// (79)  —  715 MB" plus its state label) set a minimum width the old 460
	// could not meet, so the form was wider than its own viewport and the
	// explanatory line was clipped rather than wrapped.
	resize( 580, 700 );

	m_outerLayout = new QVBoxLayout( this );

	m_scrollArea = new QScrollArea( this );
	m_scrollArea->setWidgetResizable( true );
	m_scrollArea->setFrameShape( QFrame::NoFrame );
	m_outerLayout->addWidget( m_scrollArea, 1 );

	m_status = new QLabel( " " );
	m_status->setStyleSheet( "color: #4a4;" );
	m_outerLayout->addWidget( m_status );

	auto *btnRow = new QHBoxLayout();
	m_saveBtn  = new QPushButton();
	m_closeBtn = new QPushButton();
	btnRow->addStretch( 1 );
	btnRow->addWidget( m_saveBtn );
	btnRow->addWidget( m_closeBtn );
	m_outerLayout->addLayout( btnRow );

	QObject::connect( m_saveBtn, &QPushButton::clicked, this, [this]() { saveToIni(); } );
	QObject::connect( m_closeBtn, &QPushButton::clicked, this, [this]() { close(); } );

	buildContent();
	retranslateChrome();
	loadFromIni();
}

void SetupWindow::retranslateChrome()
{
	setWindowTitle( S( S_SETUP_WINDOW_TITLE ) );
	m_saveBtn->setText( S( S_SETUP_SAVE ) );
	m_closeBtn->setText( S( S_SETUP_CLOSE ) );
}

void SetupWindow::buildContent()
{
	if( m_content )
	{
		m_scrollArea->takeWidget();
		delete m_content;
	}
	m_content = new QWidget();
	auto *root = new QVBoxLayout( m_content );

	// ---- Sprache / Language ----
	auto *gLang = new QGroupBox( S( S_SETUP_GROUP_LANGUAGE ) );
	auto *fLang = new QFormLayout( gLang );
	m_language = new QComboBox();
	m_language->addItem( S( S_SETUP_LANG_DE ), Strings::toCode( Lang::DE ) );
	m_language->addItem( S( S_SETUP_LANG_EN ), Strings::toCode( Lang::EN ) );
	// Connected AFTER population (so adding the first two items doesn't fire
	// this): flipping the language re-saves (so the new choice itself and
	// anything else already edited isn't lost), rebuilds this whole form in
	// the new language, and reloads every field from the ini it just wrote
	// -- a full round-trip through the same load/save machinery every other
	// field already uses, rather than a separate value-preservation path.
	// Deferred via singleShot(0, ...) rather than called directly: buildContent()
	// deletes m_content, which owns THIS combo box -- doing that synchronously
	// from inside the combo's own currentIndexChanged emission would destroy
	// the sender while Qt's signal machinery is still unwinding through it
	// (use-after-free). Queuing it lets the emission finish first.
	QObject::connect( m_language, QOverload<int>::of( &QComboBox::currentIndexChanged ),
	                  this, [this]( int )
	{
		QTimer::singleShot( 0, this, [this]()
		{
			saveToIni();
			buildContent();
			retranslateChrome();
			loadFromIni();
		} );
	} );
	fLang->addRow( S( S_SETUP_LANGUAGE_LABEL ), m_language );
	root->addWidget( gLang );

	// ---- Start ----
	auto *gStart = new QGroupBox( S( S_SETUP_GROUP_START ) );
	auto *fStart = new QFormLayout( gStart );
	m_startConfig = new QComboBox();
	m_startConfig->addItem( S( S_SETUP_LASTUSED ), QString() );
	for( const QString &n : discoverConfigNames() )
		m_startConfig->addItem( n, n );
	fStart->addRow( S( S_SETUP_STARTCONFIG ), m_startConfig );
	m_remotePort = new QSpinBox();
	m_remotePort->setRange( 0, 65535 );
	m_remotePort->setSpecialValueText( S( S_SETUP_REMOTEPORT_OFF ) );
	fStart->addRow( S( S_SETUP_REMOTEPORT ), m_remotePort );

	// Photo source. Empty means "whatever the preset says", which is the
	// bundled Images folder -- deliberately NOT a path written into the presets,
	// because Tools/make_genre_configs.py regenerates those and would wipe it.
	m_imageDir = new QLineEdit();
	m_imageDir->setPlaceholderText( S( S_SETUP_IMAGEDIR_DEFAULT ) );
	m_imageDir->setToolTip( S( S_SETUP_IMAGEDIR_HINT ) );
	auto *imgRow = new QWidget();
	auto *imgLay = new QHBoxLayout( imgRow );
	imgLay->setContentsMargins( 0, 0, 0, 0 );
	imgLay->addWidget( m_imageDir, 1 );
	auto *imgPick = new QPushButton( S( S_SETUP_IMAGEDIR_PICK ) );
	imgLay->addWidget( imgPick );
	connect( imgPick, &QPushButton::clicked, this, [this]() {
		const QString d = QFileDialog::getExistingDirectory(
			this, S( S_SETUP_IMAGEDIR ), m_imageDir->text().trimmed() );
		if( !d.isEmpty() )
			m_imageDir->setText( QDir::toNativeSeparators( d ) );
	} );
	fStart->addRow( S( S_SETUP_IMAGEDIR ), imgRow );
	root->addWidget( gStart );

	// ---- Zusatzinhalte / extra content ----
	// Sits directly under the photo-folder row on purpose: the row above says
	// WHERE the pictures come from, this one puts pictures there.
	auto *gPacks = new QGroupBox( S( S_SETUP_GROUP_PACKS ) );
	auto *vPacks = new QVBoxLayout( gPacks );
	auto *packHint = new QLabel( S( S_SETUP_PACKS_HINT ) );
	packHint->setWordWrap( true );
	vPacks->addWidget( packHint );
	for( int i = 0; i < 4; ++i )
	{
		auto *row = new QWidget();
		auto *rl = new QHBoxLayout( row );
		rl->setContentsMargins( 0, 0, 0, 0 );
		m_packBox[i] = new QCheckBox( S( kPacks[i].label ) + "  —  "
		                              + humanSize( kPacks[i].bytes ) );
		m_packState[i] = new QLabel();
		rl->addWidget( m_packBox[i] );
		rl->addWidget( m_packState[i], 1 );
		vPacks->addWidget( row );
		QObject::connect( m_packBox[i], &QCheckBox::toggled, this,
		                  [this]( bool ) { updatePackButton(); } );
	}
	auto *packBtnRow = new QWidget();
	auto *pbl = new QHBoxLayout( packBtnRow );
	pbl->setContentsMargins( 0, 0, 0, 0 );
	m_packGet = new QPushButton( S( S_SETUP_PACK_GET ) );
	pbl->addWidget( m_packGet );
	pbl->addStretch( 1 );
	vPacks->addWidget( packBtnRow );
	m_packProgress = new QProgressBar();
	m_packProgress->setRange( 0, 100 );
	m_packProgress->setVisible( false );
	vPacks->addWidget( m_packProgress );
	m_packStatus = new QLabel();
	m_packStatus->setWordWrap( true );
	vPacks->addWidget( m_packStatus );
	QObject::connect( m_packGet, &QPushButton::clicked, this, [this]() {
		// One button, two jobs: while a download runs it is the only way out,
		// and a separate always-disabled Cancel button beside it would be worse.
		if( m_packBusy ) { m_packCancel = true; return; }
		startPackDownloads();
	} );
	refreshPackStates();
	root->addWidget( gPacks );

	// ---- Optionale Online-Extras ----
	auto *gOnline = new QGroupBox( S( S_SETUP_GROUP_ONLINE ) );
	auto *fOnline = new QFormLayout( gOnline );
	m_lyricsMode = new QComboBox();
	m_lyricsMode->addItem( S( S_WR_LYRICS_OFF ) );
	m_lyricsMode->addItem( S( S_WR_LYRICS_SCROLL ) );
	m_lyricsMode->addItem( S( S_WR_LYRICS_KARAOKE ) );
	fOnline->addRow( S( S_SETUP_LYRICSMODE_LABEL ), m_lyricsMode );
	m_lyricsKinetic = new QCheckBox( S( S_SETUP_LYRICS_KINETIC ) );
	fOnline->addRow( QString(), m_lyricsKinetic );
	m_artistImages = new QCheckBox( S( S_SETUP_ARTISTIMAGES ) );
	fOnline->addRow( QString(), m_artistImages );
	m_videoEnabled = new QCheckBox( S( S_SETUP_VIDEO ) );
	fOnline->addRow( QString(), m_videoEnabled );
	auto *videoHint = new QLabel( S( S_SETUP_VIDEO_HINT ) );
	videoHint->setWordWrap( true );
	videoHint->setStyleSheet( "color: #888; font-size: 11px;" );
	fOnline->addRow( QString(), videoHint );
	// Update check: belongs with the other opt-in internet features rather
	// than with the picture/sound tuning below.
	m_updateCheck = new QCheckBox( S( S_SETUP_UPDATECHECK ) );
	fOnline->addRow( QString(), m_updateCheck );
	auto *updHint = new QLabel( S( S_SETUP_UPDATECHECK_HINT ) );
	updHint->setWordWrap( true );
	updHint->setStyleSheet( "color: #888; font-size: 11px;" );
	fOnline->addRow( QString(), updHint );
	root->addWidget( gOnline );

	// ---- Verhalten ----
	auto *gBehav = new QGroupBox( S( S_SETUP_GROUP_BEHAVIOR ) );
	auto *fBehav = new QFormLayout( gBehav );
	m_autoConfig = new QCheckBox( S( S_SETUP_AUTOCONFIG ) );
	fBehav->addRow( QString(), m_autoConfig );
	m_autoScale = new QCheckBox( S( S_SETUP_AUTOSCALE ) );
	fBehav->addRow( QString(), m_autoScale );
	m_nowPlaying = new QCheckBox( S( S_SETUP_NOWPLAYING ) );
	fBehav->addRow( QString(), m_nowPlaying );
	m_lightShow = new QCheckBox( S( S_SETUP_LIGHTSHOW ) );
	fBehav->addRow( QString(), m_lightShow );
	root->addWidget( gBehav );

	// ---- Bild/Ton-Feintuning ----
	auto *gTune = new QGroupBox( S( S_SETUP_GROUP_TUNE ) );
	auto *fTune = new QFormLayout( gTune );
	m_reactivity = new QDoubleSpinBox();
	m_reactivity->setRange( 0.0, 3.0 );
	m_reactivity->setSingleStep( 0.05 );
	m_reactivity->setDecimals( 2 );
	fTune->addRow( S( S_SETUP_REACTIVITY ), m_reactivity );
	m_trails = new QDoubleSpinBox();
	m_trails->setRange( 0.0, 0.95 );
	m_trails->setSingleStep( 0.05 );
	m_trails->setDecimals( 2 );
	fTune->addRow( S( S_SETUP_TRAILS ), m_trails );
	m_mood = new QDoubleSpinBox();
	m_mood->setRange( 0.0, 2.5 );
	m_mood->setSingleStep( 0.05 );
	m_mood->setDecimals( 2 );
	fTune->addRow( S( S_SETUP_MOOD ), m_mood );
	m_latencyMs = new QSpinBox();
	m_latencyMs->setRange( 0, 250 );
	m_latencyMs->setSuffix( S( S_SETUP_MS_SUFFIX ) );
	fTune->addRow( S( S_SETUP_LATENCY ), m_latencyMs );
	m_renderScale = new QDoubleSpinBox();
	m_renderScale->setRange( 0.25, 2.0 );
	m_renderScale->setSingleStep( 0.05 );
	m_renderScale->setDecimals( 2 );
	fTune->addRow( S( S_SETUP_RENDERSCALE ), m_renderScale );
	m_stereoMode = new QComboBox();
	m_stereoMode->addItem( S( S_SETUP_STEREO_OFF ) );
	m_stereoMode->addItem( S( S_SETUP_STEREO_SBS ) );
	m_stereoMode->addItem( S( S_SETUP_STEREO_TB ) );
	m_stereoMode->addItem( S( S_SETUP_STEREO_ANA ) );
	fTune->addRow( S( S_SETUP_STEREOMODE ), m_stereoMode );
	m_stereoDepth = new QDoubleSpinBox();
	m_stereoDepth->setRange( 0.0, 2.0 );
	m_stereoDepth->setSingleStep( 0.05 );
	m_stereoDepth->setDecimals( 2 );
	fTune->addRow( S( S_SETUP_STEREODEPTH ), m_stereoDepth );

	// Recording codec. Stored as a NAME, not an index, so the ini stays
	// readable and the Recorder can read it without knowing this order.
	m_videoCodec = new QComboBox();
	m_videoCodec->addItem( "H.264", "h264" );
	m_videoCodec->addItem( "HEVC (H.265)", "hevc" );
	m_videoCodec->addItem( "AV1", "av1" );
	fTune->addRow( S( S_SETUP_VIDEOCODEC ), m_videoCodec );
	// Each hint goes directly under the control it explains. They used to be
	// appended in a block at the end, which put the codec explanation four rows
	// below the codec combo with the frame-rate and anti-aliasing rows in
	// between -- unreadable, and it read as if the hint belonged to whatever
	// happened to sit above it.
	auto *codecHint = new QLabel( S( S_SETUP_CODEC_HINT ) );
	codecHint->setWordWrap( true );
	fTune->addRow( QString(), codecHint );

	m_ssaa = new QComboBox();
	m_ssaa->addItem( "1x", 1.0 );
	m_ssaa->addItem( "1.5x", 1.5 );
	m_ssaa->addItem( "2x", 2.0 );
	fTune->addRow( S( S_SETUP_SSAA ), m_ssaa );
	auto *ssaaHint = new QLabel( S( S_SETUP_SSAA_HINT ) );
	ssaaHint->setWordWrap( true );
	fTune->addRow( QString(), ssaaHint );

	m_recFps = new QComboBox();
	m_recFps->addItem( "30 fps", 30 );
	m_recFps->addItem( "60 fps", 60 );
	fTune->addRow( S( S_SETUP_RECFPS ), m_recFps );

	m_motionBlur = new QCheckBox( S( S_SETUP_MOTIONBLUR ) );
	fTune->addRow( QString(), m_motionBlur );
	auto *mbHint = new QLabel( S( S_SETUP_MOTIONBLUR_HINT ) );
	mbHint->setWordWrap( true );
	fTune->addRow( QString(), mbHint );

	// Debug switch last: it is not a picture/sound setting like the rest of
	// this group, and nobody should trip over it while adjusting recordings.
	m_showHidden = new QCheckBox( S( S_SETUP_SHOWHIDDEN ) );
	fTune->addRow( QString(), m_showHidden );
	auto *shHint = new QLabel( S( S_SETUP_SHOWHIDDEN_HINT ) );
	shHint->setWordWrap( true );
	fTune->addRow( QString(), shHint );

	m_oscPort = new QSpinBox();
	m_oscPort->setRange( 0, 65535 );
	m_oscPort->setSpecialValueText( "0" );
	fTune->addRow( S( S_SETUP_OSCPORT ), m_oscPort );
	m_oscHost = new QLineEdit();
	m_oscHost->setPlaceholderText( "127.0.0.1" );
	fTune->addRow( S( S_SETUP_OSCHOST ), m_oscHost );
	auto *oscHint = new QLabel( S( S_SETUP_OSC_HINT ) );
	oscHint->setWordWrap( true );
	fTune->addRow( QString(), oscHint );
	root->addWidget( gTune );

	root->addStretch( 1 );
	m_scrollArea->setWidget( m_content );
}

void SetupWindow::loadFromIni()
{
	const QString path = settingsPath();
	QSettings s( path, QSettings::IniFormat );

	// m_language already reflects Strings::language() (set before the first
	// buildContent(), or by the language-change handler itself) -- just
	// sync the combo's selection to it WITHOUT re-firing that handler.
	m_language->blockSignals( true );
	m_language->setCurrentIndex( Strings::language() == Lang::EN ? 1 : 0 );
	m_language->blockSignals( false );

	const QString startCfg = s.value( "activeConfig", QString() ).toString();
	int idx = startCfg.isEmpty() ? 0 : m_startConfig->findData( startCfg );
	m_startConfig->setCurrentIndex( idx >= 0 ? idx : 0 );
	m_remotePort->setValue( s.value( "remotePort", 8080 ).toInt() );
	m_imageDir->setText( s.value( "imageDirectory", QString() ).toString() );

	m_lyricsMode->setCurrentIndex( qBound( 0, s.value( "lyricsMode", 2 ).toInt(), 2 ) );
	m_lyricsKinetic->setChecked( s.value( "lyricsKinetic", false ).toBool() );
	m_artistImages->setChecked( s.value( "artistImages", true ).toBool() );
	m_videoEnabled->setChecked( s.value( "videoEnabled", true ).toBool() );

	m_autoConfig->setChecked( s.value( "autoConfig", false ).toBool() );
	m_autoScale->setChecked( s.value( "autoScale", true ).toBool() );
	m_nowPlaying->setChecked( s.value( "nowPlaying", true ).toBool() );
	m_lightShow->setChecked( s.value( "lightShow", false ).toBool() );

	m_reactivity->setValue( s.value( "reactivity", 1.0 ).toDouble() );
	m_trails->setValue( s.value( "trails", 0.6 ).toDouble() );
	m_mood->setValue( s.value( "mood", 1.0 ).toDouble() );
	m_latencyMs->setValue( int( s.value( "latencyLead", 0.0 ).toDouble() * 1000.0 + 0.5 ) );
	m_renderScale->setValue( s.value( "renderScale", 1.0 ).toDouble() );
	m_stereoMode->setCurrentIndex( s.value( "stereoMode", 0 ).toInt() & 3 );
	m_stereoDepth->setValue( s.value( "stereoDepth", 1.0 ).toDouble() );
	{
		const int ci = m_videoCodec->findData( s.value( "videoCodec", "h264" ).toString().toLower() );
		m_videoCodec->setCurrentIndex( ci >= 0 ? ci : 0 );   // unknown value -> H.264
	}
	{
		m_recFps->setCurrentIndex( s.value( "recordFps", 30 ).toInt() >= 45 ? 1 : 0 );
		m_motionBlur->setChecked( s.value( "motionBlur", false ).toBool() );
		m_showHidden->setChecked( s.value( "showHiddenPresets", false ).toBool() );
		m_updateCheck->setChecked( s.value( "updateCheck", false ).toBool() );
		m_oscPort->setValue( s.value( "oscPort", 0 ).toInt() );
		m_oscHost->setText( s.value( "oscHost", "127.0.0.1" ).toString() );
	}
	{
		const double sv = s.value( "renderScaleMax", 1.0 ).toDouble();
		int si = 0;   // nearest listed step, so a hand-edited value still shows sensibly
		for( int i = 1; i < m_ssaa->count(); ++i )
			if( qAbs( m_ssaa->itemData( i ).toDouble() - sv )
			    < qAbs( m_ssaa->itemData( si ).toDouble() - sv ) ) si = i;
		m_ssaa->setCurrentIndex( si );
	}

	if( !QFile::exists( path ) )
		m_status->setText( S( S_SETUP_NO_SETTINGS_YET ) );
}

void SetupWindow::saveToIni()
{
	QSettings s( settingsPath(), QSettings::IniFormat );

	s.setValue( "language", m_language->currentData().toString() );

	const QString cfg = m_startConfig->currentData().toString();
	if( !cfg.isEmpty() )
		s.setValue( "activeConfig", cfg );
	else
		s.remove( "activeConfig" );   // "(zuletzt verwendet)" - don't pin a specific one
	s.setValue( "remotePort", m_remotePort->value() );
	s.setValue( "imageDirectory", m_imageDir->text().trimmed() );

	s.setValue( "lyricsMode",    m_lyricsMode->currentIndex() );
	s.setValue( "lyricsKinetic", m_lyricsKinetic->isChecked() );
	s.setValue( "artistImages",  m_artistImages->isChecked() );
	s.setValue( "videoEnabled",  m_videoEnabled->isChecked() );

	s.setValue( "autoConfig", m_autoConfig->isChecked() );
	s.setValue( "autoScale",  m_autoScale->isChecked() );
	s.setValue( "nowPlaying", m_nowPlaying->isChecked() );
	s.setValue( "lightShow",  m_lightShow->isChecked() );

	s.setValue( "reactivity",  m_reactivity->value() );
	s.setValue( "trails",      m_trails->value() );
	s.setValue( "mood",        m_mood->value() );
	s.setValue( "latencyLead", m_latencyMs->value() / 1000.0 );
	s.setValue( "renderScale", m_renderScale->value() );
	s.setValue( "stereoMode",  m_stereoMode->currentIndex() );
	s.setValue( "stereoDepth", m_stereoDepth->value() );
	s.setValue( "videoCodec",  m_videoCodec->currentData().toString() );
	s.setValue( "renderScaleMax", m_ssaa->currentData().toDouble() );
	s.setValue( "recordFps",      m_recFps->currentData().toInt() );
	s.setValue( "motionBlur",     m_motionBlur->isChecked() );
	s.setValue( "showHiddenPresets", m_showHidden->isChecked() );
	s.setValue( "updateCheck", m_updateCheck->isChecked() );
	s.setValue( "oscPort", m_oscPort->value() );
	s.setValue( "oscHost", m_oscHost->text().trimmed().isEmpty() ? "127.0.0.1" : m_oscHost->text().trimmed() );

	s.sync();
	if( s.status() == QSettings::NoError )
	{
		m_status->setStyleSheet( "color: #4a4;" );
		m_status->setText( S( S_SETUP_SAVED_OK ) );
	}
	else
	{
		m_status->setStyleSheet( "color: #d55;" );
		m_status->setText( S( S_SETUP_SAVE_FAILED ) + settingsPath() );
	}
	QTimer::singleShot( 4000, this, [this]() { if( m_status ) m_status->setText( " " ); } );
}


// ---- extra-content downloader ----------------------------------------------

void SetupWindow::refreshPackStates()
{
	const QString root = findRootDir();
	for( int i = 0; i < 4; ++i )
	{
		if( !m_packBox[i] ) continue;
		const int n = installedCount( root, kPacks[i] );
		// Tick what is MISSING. Running the tool a second time should not
		// propose re-downloading two gigabytes the machine already has, which
		// is the whole reason the default is derived from disk rather than
		// stored: a stored answer would go stale the moment someone deleted
		// or unpacked a folder by hand.
		m_packBox[i]->setChecked( n == 0 );
		m_packState[i]->setText( n > 0
			? QString( "(%1 %2, %3)" ).arg( n ).arg( QString( kPacks[i].ext ).mid( 1 ).toUpper(),
			                                          S( S_SETUP_PACK_INSTALLED ) )
			: QString() );
		m_packState[i]->setStyleSheet( n > 0 ? "color: #4a4;" : QString() );
	}
	updatePackButton();
}

void SetupWindow::updatePackButton()
{
	if( !m_packGet || m_packBusy ) return;
	qint64 total = 0;
	for( int i = 0; i < 4; ++i )
		if( m_packBox[i] && m_packBox[i]->isChecked() ) total += kPacks[i].bytes;
	// The size belongs ON the button. Two gigabytes is a real commitment on a
	// metered line, and a button that only says "Download and install" hides
	// exactly the fact the user needs before pressing it.
	m_packGet->setText( total > 0
		? S( S_SETUP_PACK_GET ) + "  (" + humanSize( total ) + ")"
		: S( S_SETUP_PACK_GET ) );
	m_packGet->setEnabled( total > 0 );
}

void SetupWindow::startPackDownloads()
{
	const QString root = findRootDir();

	QList<int> todo;
	qint64 need = 0;
	for( int i = 0; i < 4; ++i )
		if( m_packBox[i] && m_packBox[i]->isChecked() ) { todo << i; need += kPacks[i].bytes; }
	if( todo.isEmpty() ) return;

	// Space for the archive AND what comes out of it: the zip is deleted only
	// after its own extraction, so the peak is roughly twice one pack on top
	// of everything already unpacked. Checked up front, because running out
	// halfway through a 700 MB download wastes the whole download.
	const QStorageInfo si( root );
	if( si.isValid() && si.bytesAvailable() > 0
	    && si.bytesAvailable() < need + kPacks[todo.first()].bytes )
	{
		m_packStatus->setStyleSheet( "color: #d55;" );
		m_packStatus->setText( S( S_SETUP_PACK_NOSPACE ) );
		return;
	}

	m_packBusy = true;
	m_packCancel = false;
	m_packGet->setText( S( S_SETUP_PACK_CANCEL ) );
	m_packProgress->setVisible( true );
	m_packProgress->setValue( 0 );
	m_packStatus->setStyleSheet( QString() );
	for( int i = 0; i < 4; ++i ) if( m_packBox[i] ) m_packBox[i]->setEnabled( false );

	QNetworkAccessManager nam;
	// Same trap the main app hit (see main.cpp): Qt's system proxy
	// auto-detection can block for many seconds on WPAD before the first
	// request even leaves. Nothing here needs a proxy.
	nam.setProxy( QNetworkProxy( QNetworkProxy::NoProxy ) );

	QString failure;
	int done = 0;
	for( int idx : todo )
	{
		if( m_packCancel ) break;
		const PackDef &p = kPacks[idx];
		const QString dest = root + "/" + p.dir;
		const QString tmp  = QDir( QStandardPaths::writableLocation( QStandardPaths::TempLocation ) )
		                     .filePath( QString( "kaleido_%1" ).arg( p.file ) );

		QFile out( tmp );
		if( !out.open( QIODevice::WriteOnly | QIODevice::Truncate ) )
		{
			failure = tmp;
			break;
		}

		QNetworkRequest req{ QUrl( packUrl( p ) ) };
		req.setAttribute( QNetworkRequest::RedirectPolicyAttribute,
		                  QNetworkRequest::NoLessSafeRedirectPolicy );   // GitHub redirects to its CDN
		req.setHeader( QNetworkRequest::UserAgentHeader, "KaleidoscopeSetup" );
		QNetworkReply *reply = nam.get( req );

		// Stream to disk instead of letting the reply buffer it: these are
		// hundreds of megabytes and QNetworkReply would otherwise hold the
		// whole asset in memory before anyone reads a byte of it.
		QEventLoop loop;
		QObject::connect( reply, &QNetworkReply::readyRead, &loop,
		                  [&out, reply]() { out.write( reply->readAll() ); } );
		QObject::connect( reply, &QNetworkReply::downloadProgress, &loop,
		                  [this, &p, done, &todo]( qint64 got, qint64 total ) {
			const int pct = total > 0 ? int( got * 100 / total ) : 0;
			m_packProgress->setValue( pct );
			m_packStatus->setText( QString( "%1 %2 (%3/%4) — %5 / %6" )
				.arg( S( S_SETUP_PACK_DOWNLOADING ), S( p.label ) )
				.arg( done + 1 ).arg( todo.size() )
				.arg( humanSize( got ), humanSize( total > 0 ? total : p.bytes ) ) );
			QCoreApplication::processEvents();
		} );
		QObject::connect( reply, &QNetworkReply::finished, &loop, &QEventLoop::quit );

		// A cancel arrives through processEvents() above; poll it here so the
		// abort happens on this stack rather than inside a signal handler.
		QTimer poll;
		QObject::connect( &poll, &QTimer::timeout, &loop, [this, reply]() {
			if( m_packCancel && reply->isRunning() ) reply->abort();
		} );
		poll.start( 200 );

		loop.exec();
		poll.stop();
		out.write( reply->readAll() );
		out.close();

		const bool netOk = ( reply->error() == QNetworkReply::NoError );
		const QString netErr = reply->errorString();
		reply->deleteLater();

		if( m_packCancel ) { QFile::remove( tmp ); break; }
		if( !netOk )
		{
			failure = netErr;
			QFile::remove( tmp );
			break;
		}

		m_packStatus->setText( S( S_SETUP_PACK_EXTRACTING ) + " " + S( p.label ) + " ..." );
		m_packProgress->setRange( 0, 0 );          // busy: tar reports no progress
		QCoreApplication::processEvents();

		QString exErr;
		const bool ok = extractZip( tmp, dest, &exErr );
		QFile::remove( tmp );
		m_packProgress->setRange( 0, 100 );
		if( !ok ) { failure = exErr; break; }
		++done;
	}

	m_packBusy = false;
	m_packProgress->setVisible( false );
	for( int i = 0; i < 4; ++i ) if( m_packBox[i] ) m_packBox[i]->setEnabled( true );

	if( !failure.isEmpty() )
	{
		m_packStatus->setStyleSheet( "color: #d55;" );
		m_packStatus->setText( S( S_SETUP_PACK_FAILED ) + " " + failure );
	}
	else if( m_packCancel )
	{
		m_packStatus->setStyleSheet( QString() );
		m_packStatus->setText( S( S_SETUP_PACK_CANCELLED ) );
	}
	else
	{
		m_packStatus->setStyleSheet( "color: #4a4;" );
		m_packStatus->setText( S( S_SETUP_PACK_DONE ) );
	}
	// Re-derive from disk rather than assuming: a partial run must show what
	// actually landed, not what was asked for.
	refreshPackStates();
}
