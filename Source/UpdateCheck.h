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
    /**  Creates the checker.
     *
     * @param parent  Owning QObject. (in)
     **/
    explicit UpdateCheck( QObject *parent = nullptr );
    ~UpdateCheck() override;

    /**  Compares two "major.minor.patch" strings numerically.
     *
     * @param a  First version, e.g. "1.17.0" or "v1.17.0". (in)
     * @param b  Second version. (in)
     *
     * @return
     *   >0 if @p a is newer than @p b, <0 if older, 0 if equal.
     *
     * Tolerates a leading "v" and missing components ("1.7" == "1.7.0").
     * Numeric rather than lexicographic on purpose: "1.10.0" is NEWER than
     * "1.9.0", which a string compare gets backwards.
     **/
    static int compareVersions( const QString &a, const QString &b );

    /**  Starts the (asynchronous) check.
     *
     * Does nothing if one is already in flight.
     **/
    void start();
    /**  Downloads the release installer and runs it; the app quits once it starts.
     *
     * Only meaningful after updateFound().
     **/
    void downloadAndInstall();

    /**  Whether a newer release than this build was found.
     *
     * @return
     *   True if a newer release than this build was found.
     **/
    bool updateAvailable() const { return m_available; }
    /**  Version string of the newest release, empty until found.
     *
     * @return
     *   Version string of the newest release, empty until found.
     **/
    QString latestVersion() const
    {
        return m_latest;
    }
    /**  Human-readable progress/error text for the UI.
     *
     * @return
     *   Human-readable progress/error text for the UI.
     **/
    QString status() const { return m_status; }
    /**  Whether a check or download is currently running.
     *
     * @return
     *   True if a check or download is currently running.
     **/
    bool busy() const { return m_busy; }

private:
    QNetworkAccessManager *m_nam = nullptr; ///< Shared by the check and the download; created in the constructor with
                                            ///< this object as parent (Qt owns it).
    bool    m_available = false;            ///< A newer release than this build exists.
    bool    m_busy = false;                 ///< A request is in flight.
    QString m_latest;                       ///< Version of the newest release.
    QString m_assetUrl;                     ///< Validated GitHub download URL of its installer.
    QString m_status;                       ///< Progress/error text for the UI.

    /**  Replaces the status text the UI polls via status().
     *
     * @param s  New progress/error text (German, user-facing); empty clears it. (in)
     **/
    void setStatus( const QString &s );

private:
    /** Not copyable (CGVR template: copy constructor and assignment are always declared). */
    UpdateCheck( const UpdateCheck & ) = delete;
    /**  Not assignable; see the copy constructor.
     *
     * @return
     *   Nothing: the operator is deleted, so no call compiles.
     **/
    UpdateCheck &operator=( const UpdateCheck & ) = delete;
};

#endif
