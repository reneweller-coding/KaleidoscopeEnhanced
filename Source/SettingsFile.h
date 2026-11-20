//---------------------------------------------------------------------------
//                              SettingsFile
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  Where the settings file lives, and which of its keys this session changed.
 *
 *  The one place that knows the path of kaleidoscope_settings.ini (beside
 *  Presets\, one level above bin\ or Release\), or the file KALEIDO_SETTINGS
 *  names: a test tool runs its instance on a copy of its own instead of backing
 *  the user's file up and copying it back, which overwrote whatever a real show
 *  on the same file wrote in between and left a scratch preset behind when the
 *  tool was stopped.
 *
 *  The session part: the program used to write every key it knows on exit, from
 *  memory -- so a change made in the Setup tool while the show ran was lost
 *  without a word.  Now each key is remembered as the session found it
 *  (remember()), and an exit writes only the keys that differ (store()); the
 *  explicit "save as default" ('k') still writes them all.
 *
 *  The user's folders (20.11.2026, for the AppImage): everything the program
 *  writes -- settings, log, thumbnails, recordings -- has always gone into its
 *  own folder, which on Windows is the user's (the portable folder, or the
 *  per-user installation).  An AppImage is mounted read-only, and a folder the
 *  program cannot write to keeps nothing either; there, and only there (never
 *  on Windows), the same files go to the XDG folders (userFolders(),
 *  writablePath()), and the photos and 3D models a preset names in the
 *  program's folder are looked for in the user's data folder (userContent()).
 *
 *  @author René Weller
 */

#pragma once

#include <QtCore/QDir>
#include <QtCore/QFileInfo>
#include <QtCore/QHash>
#include <QtCore/QSettings>
#include <QtCore/QString>
#include <QtCore/QVariant>
#include <QtCore/QtGlobal>

#include "PlatformQt.h"

namespace SettingsFile
{

/**  The program's root folder -- Presets\, Images\, Engine\ -- one level above the working directory.
 *
 * @return
 *   Its absolute path.
 *
 * Where the settings file lives unless KALEIDO_SETTINGS moved it or userFolders() holds: whatever belongs to the
 * program, not to the user's settings, is found from here, never from path().
 **/
inline QString rootDir()
{
    return QDir( Platform::assetPath( QString( ".." ) ) ).absolutePath();
}

/**  Whether this process runs from an AppImage.
 *
 * @return
 *   True if the AppImage runtime set APPDIR (where the image is mounted, or extracted with
 *   --appimage-extract-and-run) and this executable lies inside it -- a program started from within some other
 *   AppImage inherits the variable, but not the folder.  Always false on Windows.
 **/
inline bool inAppImage()
{
#ifdef _WIN32
    return false;
#else
    static const bool In = []
    {
        const QString appdir = qEnvironmentVariable( "APPDIR" );
        if ( appdir.isEmpty() )
            return false;
        const QString exe = QFileInfo( QStringLiteral( "/proc/self/exe" ) ).canonicalFilePath();
        const QString dir = QDir( appdir ).canonicalPath();
        return !exe.isEmpty() && !dir.isEmpty() && exe.startsWith( dir + "/" );
    }();
    return In;
#endif
}

/**  Whether what the program writes goes to the user's XDG folders instead of its own folder.
 *
 * @return
 *   True when it runs from an AppImage (read-only when mounted, thrown away when extracted) or its root folder
 *   cannot be written to (an installation owned by another account).  Always false on Windows: the portable folder
 *   and the per-user installation are the user's own, and keep everything as they always did.
 *
 * Decided once, at the first call -- after main() has moved into the program's folder.
 **/
inline bool userFolders()
{
#ifdef _WIN32
    return false;
#else
    static const bool On = inAppImage() || !QFileInfo( rootDir() ).isWritable();
    return On;
#endif
}

/** The kinds of the user's folders (the XDG base directories), each with a KaleidoscopeVisualizer folder inside. */
enum class UserDir
{
    Config, ///< $XDG_CONFIG_HOME (~/.config): kaleidoscope_settings.ini, liked_rolls.tsv.
    Data,   ///< $XDG_DATA_HOME (~/.local/share): Images, Models, own presets (Presets), recordings without ~/Videos.
    Cache,  ///< $XDG_CACHE_HOME (~/.cache): the web remote's thumbnails, lyrics and artist images.
    State   ///< $XDG_STATE_HOME (~/.local/state): kaleidoscope.log (-l) and the measurement files.
};

/**  The user's folder of one kind, made if it is missing.
 *
 * @param kind  Which one. (in)
 *
 * @return
 *   Its absolute path, e.g. ~/.config/KaleidoscopeVisualizer.
 *
 * Meant for userFolders(); the program's own folder is the place otherwise.  A variable that is unset or holds a
 * relative path is ignored, as the XDG specification says, and the default below the home folder is taken.
 **/
inline QString userDir( UserDir kind )
{
    static const char *const Vars[] = { "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME" };
    static const char *const Defaults[] = { ".config", ".local/share", ".cache", ".local/state" };
    const int                k = static_cast<int>( kind );
    QString                  base = qEnvironmentVariable( Vars[k] );
    if ( base.isEmpty() || QDir::isRelativePath( base ) )
        base = QDir::homePath() + "/" + Defaults[k];
    const QString dir = base + "/KaleidoscopeVisualizer";
    QDir().mkpath( dir );
    return dir;
}

/**  Where a file or folder the program writes goes.
 *
 * @param p     The path as the program has always named it: below its root folder ("..\\ThumbCache\\x.jpg") or in
 *              the working folder ("recordings/rec_1", "kaleidoscope.log"). (in)
 * @param kind  Which of the user's folders it belongs in when userFolders() holds. (in)
 *
 * @return
 *   @p p with the host's separators, as always -- or, when userFolders() holds, the same name in the user's folder
 *   of @p kind, without the leading "..": ~/.cache/KaleidoscopeVisualizer/ThumbCache/x.jpg.
 **/
inline QString writablePath( const QString &p, UserDir kind )
{
    const QString host = Platform::assetPath( p );
    if ( !userFolders() )
        return host;
    QString rel = QDir::cleanPath( QDir::fromNativeSeparators( host ) );
    if ( rel.startsWith( QLatin1String( "../" ) ) )
        rel = rel.mid( 3 );
    return userDir( kind ) + "/" + rel;
}

/**  Where the photos and 3D models are that a preset names in the program's folder.
 *
 * @param p  A path as a preset writes it: "..\\Images" (ImageDirectory) or "..\\Models\\x.glb" (model), or any
 *           other. (in)
 *
 * @return
 *   @p p unchanged -- or, when userFolders() holds and @p p lies in the program's Images or Models folder, the same
 *   path in the user's data folder (~/.local/share/KaleidoscopeVisualizer/Images): nobody can unpack the photo or
 *   model pack into an AppImage.
 **/
inline QString userContent( const QString &p )
{
    if ( !userFolders() )
        return p;
    // cleanPath(): the presets write ImageDirectory="..\\Images" with a doubled backslash, "..//Images" here.
    const QString host = QDir::cleanPath( QDir::fromNativeSeparators( Platform::assetPath( p ) ) );
    for ( const QString dir : { QStringLiteral( "../Images" ), QStringLiteral( "../Models" ) } )
        if ( host == dir || host.startsWith( dir + "/" ) )
            return userDir( UserDir::Data ) + host.mid( 2 );
    return p;
}

/**  The settings file: KALEIDO_SETTINGS if set, else kaleidoscope_settings.ini one level above the working directory
 * (in the user's config folder when userFolders() holds).
 *
 * @return
 *   Its path; the file need not exist yet.
 **/
inline QString path()
{
    static const QString Path = []
    {
        const QString env = qEnvironmentVariable( "KALEIDO_SETTINGS" ).trimmed();
        return env.isEmpty() ? writablePath( QString( "..\\kaleidoscope_settings.ini" ), UserDir::Config ) : env;
    }();
    return Path;
}

/**  What each key held when this session read it or last wrote it.
 *
 * @return
 *   The map, key -> value.
 **/
inline QHash<QString, QVariant> &known()
{
    static QHash<QString, QVariant> Known;
    return Known;
}

/**  Notes the value a key has at the start of the session (after the command line has had its say).
 *
 * @param key    The ini key. (in)
 * @param value  Its value now. (in)
 **/
inline void remember( const QString &key, const QVariant &value )
{
    known()[key] = value;
}

/**  Writes a key -- unless this session never changed it.
 *
 * @param s           The open settings file. (in,out)
 * @param key         The ini key. (in)
 * @param value       Its value now. (in)
 * @param everything  Write it even unchanged (the explicit "save as default"). (in)
 *
 * @return
 *   Whether it was written.
 *
 * An unchanged key keeps whatever the file holds now, so the Setup tool's edit made during the session survives
 * the exit.  A key never remembered is written, as before.
 **/
inline bool store( QSettings &s, const QString &key, const QVariant &value, bool everything )
{
    const auto it = known().constFind( key );
    if ( !everything && it != known().constEnd() && it.value() == value )
        return false;
    s.setValue( key, value );
    known()[key] = value;
    return true;
}

/**  Why the last write to the file failed, in a few words, or an empty string if it did not.
 *
 * @param s  The settings file, after sync(). (in)
 *
 * @return
 *   "not writable" or "not readable as an ini file", or empty.
 **/
inline QString failure( const QSettings &s )
{
    switch ( s.status() )
    {
        case QSettings::AccessError: return QStringLiteral( "not writable" );
        case QSettings::FormatError: return QStringLiteral( "not readable as an ini file" );
        default: return QString();
    }
}

} // namespace SettingsFile
