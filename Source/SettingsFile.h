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
 *  @author René Weller
 */

#pragma once

#include <QtCore/QDir>
#include <QtCore/QHash>
#include <QtCore/QSettings>
#include <QtCore/QString>
#include <QtCore/QVariant>
#include <QtCore/QtGlobal>

#include "PlatformQt.h"

namespace SettingsFile
{

/**  The settings file: KALEIDO_SETTINGS if set, else kaleidoscope_settings.ini one level above the working directory.
 *
 * @return
 *   Its path; the file need not exist yet.
 **/
inline QString path()
{
    static const QString Path = []
    {
        const QString env = qEnvironmentVariable( "KALEIDO_SETTINGS" ).trimmed();
        return env.isEmpty() ? Platform::assetPath( QString( "..\\kaleidoscope_settings.ini" ) ) : env;
    }();
    return Path;
}

/**  The program's root folder -- Presets\, Images\, Engine\ -- one level above the working directory.
 *
 * @return
 *   Its absolute path.
 *
 * Where the settings file lives unless KALEIDO_SETTINGS moved it: whatever belongs to the program, not to the
 * user's settings, is found from here, never from path().
 **/
inline QString rootDir()
{
    return QDir( Platform::assetPath( QString( ".." ) ) ).absolutePath();
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
