/**
 * @file SetupWindow.cpp
 * @brief Implementation of SetupWindow: see SetupWindow.h.
 */
#include "SetupWindow.h"

#include <QtWidgets/QCheckBox>
#include <QtWidgets/QComboBox>
#include <QtWidgets/QDoubleSpinBox>
#include <QtWidgets/QSpinBox>
#include <QtWidgets/QLabel>
#include <QtWidgets/QPushButton>
#include <QtWidgets/QGroupBox>
#include <QtWidgets/QFormLayout>
#include <QtWidgets/QVBoxLayout>
#include <QtWidgets/QHBoxLayout>
#include <QtWidgets/QScrollArea>
#include <QtCore/QSettings>
#include <QtCore/QDir>
#include <QtCore/QCoreApplication>
#include <QtCore/QXmlStreamReader>
#include <QtCore/QFile>
#include <QtCore/QTimer>

static QString S( StrId id ) { return QString::fromUtf8( Strings::T( id ) ); }

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

	resize( 460, 640 );

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
	root->addWidget( gStart );

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
