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
 * Windows way, "..\\Presets", "..\\cache\\lyrics". Qt on Windows accepts
 * that. Qt on Linux and macOS does not translate it -- there a backslash is an
 * ordinary character in a filename, so "..\\Presets" names one file with
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
#include <QtCore/QDir>

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

/**
 * @brief The folder holding the preset *.xml files, relative to @p root.
 *
 * The folder was called "Configurations" until 04.09.2026 and is called
 * "Presets" now -- the name the rest of the program, the editor and the
 * documentation already used for the same thing.  An installation that still
 * carries the old folder keeps working: a half-updated copy must not fail to
 * start over a rename.
 * @param root Directory the folder sits in (the project/install root).
 * @return Path to the presets folder, separators normalised for the host.
 */
inline QString presetsDir( const QString &root )
{
	const QString cur = assetPath( root + "/Presets" );
	if( QDir( cur ).exists() )
		return cur;
	const QString old = assetPath( root + "/Configurations" );
	return QDir( old ).exists() ? old : cur;
}

} // namespace Platform

#endif // KALEIDOSCOPE_PLATFORM_QT_H
