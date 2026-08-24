/**
 * @file UpdateCheck.cpp
 * @brief Implementation of UpdateCheck -- see the header for the safety rules
 *        this file is written to keep.
 */
#include "UpdateCheck.h"
#include "Version.h"

#include <QtCore/QCoreApplication>
#include <QtCore/QDir>
#include <QtCore/QFile>
#include <QtCore/QFileInfo>
#include <QtCore/QJsonArray>
#include <QtCore/QJsonDocument>
#include <QtCore/QJsonObject>
#include <QtCore/QProcess>
#include <QtCore/QStandardPaths>
#include <QtCore/QStringList>
#include <QtCore/QUrl>
#include <QtNetwork/QNetworkAccessManager>
#include <QtNetwork/QNetworkReply>
#include <QtNetwork/QNetworkRequest>

/// The one repository this build ever asks about. Hard-coded rather than
/// configurable: a settable update source is an obvious way to turn a
/// convenience feature into a way to push arbitrary executables at someone.
static const char *kReleaseApi =
	"https://api.github.com/repos/reneweller-coding/KaleidoscopeEnhanced/releases/latest";

/// Hosts a release asset may be downloaded from. The API hands out a
/// github.com URL that REDIRECTS to a *.githubusercontent.com CDN host
/// (release-assets.githubusercontent.com as of 2026-08; it has been
/// objects./github-releases. before, hence matching the suffix rather than a
/// fixed name). Verified against the real v1.6.0 asset. Anything outside
/// GitHub is refused -- both for the URL the API returns and, again, for
/// wherever the redirect actually lands.
static bool isTrustedDownloadHost( const QUrl &url )
{
	if( url.scheme() != "https" )
		return false;
	const QString h = url.host().toLower();
	return h == "github.com"
	    || h == "api.github.com"
	    || h.endsWith( ".githubusercontent.com" );
}

UpdateCheck::UpdateCheck( QObject *parent )
	: QObject( parent )
{
	m_nam = new QNetworkAccessManager( this );
}

UpdateCheck::~UpdateCheck() = default;

void UpdateCheck::setStatus( const QString &s )
{
	m_status = s;
}

int UpdateCheck::compareVersions( const QString &a, const QString &b )
{
	auto parts = []( const QString &v )
	{
		QString t = v.trimmed();
		if( t.startsWith( 'v' ) || t.startsWith( 'V' ) )
			t.remove( 0, 1 );
		QList<int> out;
		const QStringList sp = t.split( '.' );
		for( const QString &p : sp )
		{
			// Stop at the first non-numeric chunk so a suffix like
			// "1.7.0-beta" still compares as 1.7.0 rather than parsing to 0.
			bool ok = false;
			const int n = p.section( '-', 0, 0 ).toInt( &ok );
			out << ( ok ? n : 0 );
			if( !ok ) break;
		}
		while( out.size() < 3 ) out << 0;
		return out;
	};

	const QList<int> x = parts( a ), y = parts( b );
	for( int i = 0; i < 3; ++i )
		if( x[i] != y[i] )
			return x[i] < y[i] ? -1 : 1;
	return 0;
}

void UpdateCheck::start()
{
	if( m_busy )
		return;
	m_busy = true;
	setStatus( "" );

	QNetworkRequest req( ( QUrl( QString::fromLatin1( kReleaseApi ) ) ) );
	req.setHeader( QNetworkRequest::UserAgentHeader,
	               "KaleidoscopeVisualizer/" KALEIDOSCOPE_VERSION
	               " (github.com/reneweller-coding)" );
	req.setRawHeader( "Accept", "application/vnd.github+json" );
	req.setTransferTimeout( 15000 );

	QNetworkReply *r = m_nam->get( req );
	QObject::connect( r, &QNetworkReply::finished, r, [this, r]()
	{
		r->deleteLater();
		m_busy = false;

		if( r->error() != QNetworkReply::NoError )
		{
			// Offline or rate-limited is the normal case, not a fault:
			// report it quietly and never retry on a timer.
			setStatus( QString( "Update-Pruefung fehlgeschlagen: %1" ).arg( r->errorString() ) );
			return;
		}

		const QJsonObject o = QJsonDocument::fromJson( r->readAll() ).object();
		const QString tag = o.value( "tag_name" ).toString();
		if( tag.isEmpty() )
		{
			setStatus( "Update-Pruefung: unerwartete Antwort von GitHub" );
			return;
		}

		if( compareVersions( tag, KALEIDOSCOPE_VERSION ) <= 0 )
		{
			setStatus( QString( "Aktuell (%1)" ).arg( KALEIDOSCOPE_VERSION ) );
			return;
		}

		// Newer release: find its Windows installer and make sure the URL
		// GitHub handed us really is a GitHub URL before we keep it.
		QString url;
		const QJsonArray assets = o.value( "assets" ).toArray();
		for( const QJsonValue &v : assets )
		{
			const QJsonObject a = v.toObject();
			const QString name = a.value( "name" ).toString();
			if( !name.endsWith( ".exe", Qt::CaseInsensitive ) )
				continue;
			const QUrl candidate( a.value( "browser_download_url" ).toString() );
			if( isTrustedDownloadHost( candidate ) )
			{
				url = candidate.toString();
				break;
			}
			fprintf( stderr, "UpdateCheck: ignoring asset '%s' -- download URL is not on GitHub\n",
			         name.toLocal8Bit().constData() );
		}

		m_latest    = tag;
		m_assetUrl  = url;
		m_available = true;
		setStatus( url.isEmpty()
		           ? QString( "Version %1 verfuegbar (kein Installer im Release)" ).arg( tag )
		           : QString( "Version %1 verfuegbar" ).arg( tag ) );
		fprintf( stderr, "UpdateCheck: %s available (installed: %s)\n",
		         tag.toLocal8Bit().constData(), KALEIDOSCOPE_VERSION );
	} );
}

void UpdateCheck::downloadAndInstall()
{
	if( m_busy || !m_available || m_assetUrl.isEmpty() )
		return;
	const QUrl url( m_assetUrl );
	if( !isTrustedDownloadHost( url ) )          // belt and braces: re-check at use time
		return;

	m_busy = true;
	setStatus( "Lade Update ..." );

	QNetworkRequest req( url );
	req.setHeader( QNetworkRequest::UserAgentHeader,
	               "KaleidoscopeVisualizer/" KALEIDOSCOPE_VERSION
	               " (github.com/reneweller-coding)" );
	req.setAttribute( QNetworkRequest::RedirectPolicyAttribute,
	                  QNetworkRequest::NoLessSafeRedirectPolicy );
	req.setTransferTimeout( 120000 );

	QNetworkReply *r = m_nam->get( req );
	QObject::connect( r, &QNetworkReply::downloadProgress, this,
	                  [this]( qint64 got, qint64 total )
	{
		if( total > 0 )
			setStatus( QString( "Lade Update ... %1 %" ).arg( got * 100 / total ) );
	} );
	QObject::connect( r, &QNetworkReply::finished, r, [this, r]()
	{
		r->deleteLater();
		m_busy = false;

		// A redirect must not be allowed to walk off GitHub either.
		if( !isTrustedDownloadHost( r->url() ) )
		{
			setStatus( "Update abgebrochen: Download wurde umgeleitet" );
			return;
		}
		if( r->error() != QNetworkReply::NoError )
		{
			setStatus( QString( "Download fehlgeschlagen: %1" ).arg( r->errorString() ) );
			return;
		}

		const QByteArray data = r->readAll();
		if( data.size() < 1024 || !data.startsWith( "MZ" ) )
		{
			// Every Windows executable starts "MZ"; anything else means we
			// were handed an error page rather than the installer.
			setStatus( "Download fehlgeschlagen: keine gueltige Programmdatei" );
			return;
		}

		const QString dir = QStandardPaths::writableLocation( QStandardPaths::TempLocation );
		const QString path = QDir( dir ).filePath(
			QString( "KaleidoscopeVisualizer-%1-Setup.exe" ).arg( m_latest ) );
		QFile f( path );
		if( !f.open( QIODevice::WriteOnly ) )
		{
			setStatus( "Download fehlgeschlagen: konnte nicht speichern" );
			return;
		}
		f.write( data );
		f.close();

		setStatus( "Installer wird gestartet ..." );
		fprintf( stderr, "UpdateCheck: launching %s\n", path.toLocal8Bit().constData() );
		// Hand over to the installer's own UI and step aside -- it cannot
		// replace files while this exe is still running.
		if( QProcess::startDetached( path, QStringList() ) )
			QCoreApplication::quit();
		else
			setStatus( QString( "Installer konnte nicht gestartet werden: %1" ).arg( path ) );
	} );
}
