/**
 * @file UpdateCheck.h
 * @brief Optional "is there a newer release?" check against this project's
 *        GitHub releases, plus the download-and-run-the-installer step.
 *
 * Deliberately conservative, because this feature downloads and starts an
 * executable:
 *  - It only ever talks to GitHub. The API host is hard-coded and the
 *    download URL taken from the API response is REJECTED unless it lives on
 *    a GitHub host, so a spoofed or tampered response cannot redirect the
 *    download somewhere else.
 *  - Nothing happens without the user asking for it. The check only reports;
 *    downloading and starting the installer needs a separate, explicit
 *    action, and the installer then shows its own UI.
 *  - The whole thing is off unless the "updateCheck" setting is on.
 */
#ifndef UPDATECHECK_H
#define UPDATECHECK_H

#include <QtCore/QObject>
#include <QtCore/QString>

class QNetworkAccessManager;

/**
 * @brief Queries the newest GitHub release and, on request, installs it.
 *
 * Lives on the GUI thread and uses Qt's asynchronous network stack, so no
 * call here ever blocks the render loop.
 */
class UpdateCheck : public QObject
{
	// Deliberately NO Q_OBJECT: this project only runs moc over three headers
	// (AudioAnalyzer/glwidget/QMyWindow), and WebRemote sets the precedent for
	// a plain QObject subclass that uses lambda connections instead of its own
	// signals. Both consumers (glwidget, the web remote's /api/state) poll the
	// getters below, so signals would buy nothing but build plumbing.
public:
	/** @brief Creates the checker. @param parent Owning QObject. */
	explicit UpdateCheck( QObject *parent = nullptr );
	~UpdateCheck() override;

	/**
	 * @brief Compares two "major.minor.patch" strings numerically.
	 *
	 * Tolerates a leading "v" and missing components ("1.7" == "1.7.0").
	 * Numeric rather than lexicographic on purpose: "1.10.0" is NEWER than
	 * "1.9.0", which a string compare gets backwards.
	 * @return >0 if @p a is newer than @p b, <0 if older, 0 if equal.
	 */
	static int compareVersions( const QString &a, const QString &b );

	/// @brief Starts the (asynchronous) check. Does nothing if one is already in flight.
	void start();
	/// @brief Downloads the release installer and runs it; the app quits once it starts. Only meaningful after updateFound().
	void downloadAndInstall();

	bool    updateAvailable() const { return m_available; }   ///< @brief Whether a newer release than this build was found.
	QString latestVersion()   const { return m_latest; }      ///< @brief Version string of the newest release, empty until found.
	QString status()          const { return m_status; }      ///< @brief Human-readable progress/error text for the UI.
	bool    busy()            const { return m_busy; }        ///< @brief Whether a check or download is currently running.

private:
	QNetworkAccessManager *m_nam = nullptr;
	bool    m_available = false;   ///< A newer release than this build exists.
	bool    m_busy      = false;   ///< A request is in flight.
	QString m_latest;              ///< Version of the newest release.
	QString m_assetUrl;            ///< Validated GitHub download URL of its installer.
	QString m_status;              ///< Progress/error text for the UI.

	void setStatus( const QString &s );
};

#endif
