/**
 * @file PlatformQt.h
 * @brief The Qt-side half of the platform seam: path normalisation for QString.
 *
 * Platform.h deliberately knows nothing about Qt -- it is included from the
 * Qt-free core (glcore, textfile), and that separation is worth keeping. This
 * header carries the same assetPath() service for the Qt half of the codebase,
 * where paths travel as QString into QFile, QDir and QSettings.
 *
 * Why it is needed at all: the asset paths in this program are written the
 * Windows way, "..\\Configurations", "..\\cache\\lyrics". Qt on Windows accepts
 * that. Qt on Linux and macOS does not translate it -- there a backslash is an
 * ordinary character in a filename, so "..\\Configurations" names one file with
 * a backslash in it, in the current directory, which does not exist. The
 * failure is quiet and confusing: the program reports an empty folder rather
 * than a bad path.
 *
 * Under _WIN32 this is `return p;` and compiles away, so the call sites keep
 * doing exactly what they did.
 */
#ifndef KALEIDOSCOPE_PLATFORM_QT_H
#define KALEIDOSCOPE_PLATFORM_QT_H

#include <QtCore/QString>

namespace Platform {

/**
 * @brief Normalises a QString path's separators for the host filesystem.
 * @param p Path as written in the source or in a preset.
 * @return The same path, with separators the host understands.
 */
inline QString assetPath( const QString &p )
{
#ifdef _WIN32
	return p;
#else
	QString s = p;
	s.replace( QLatin1Char( '\\' ), QLatin1Char( '/' ) );
	return s;
#endif
}

} // namespace Platform

#endif // KALEIDOSCOPE_PLATFORM_QT_H
