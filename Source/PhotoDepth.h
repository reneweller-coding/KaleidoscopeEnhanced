//---------------------------------------------------------------------------
//                              PhotoDepth
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  The photo's depth (26.11.2026, plan T1): a depth map beside the photo, carried in the ALPHA channel of the photo
 *  texture.
 *
 *  A map is an 8-bit grey PNG `<photo folder>\.depth\<photo name without extension>.png` (255 = near, 0 = far,
 *  stretched per photo between its 2nd and 98th percentile, long side 512; made by Tools/depth_maps.py), with a
 *  table `photo_info.tsv` next to it (tab-separated, header `file relief slope flat fx fy thr conf model mask`, read
 *  by the columns' names; file = the photo's file name with extension, fx/fy = subject centre in IMAGE coordinates,
 *  x right, y DOWN, 0..1, thr = depth threshold of the subject, conf 0..1 = confidence in the centre, mask 0..1 = how
 *  well depth >= thr outlines the subject, `-` or empty where not measured).  `KALEIDO_DEPTH_DIR=<folder>` holds
 *  the same files flat and takes precedence; `KALEIDO_NO_DEPTH=1` switches all of it off.
 *
 *  Why the alpha channel: everything that holds for the colour holds for the depth then -- the same coordinate, the
 *  same mirroring, the same mipmaps, the same cross-fade between two photos, the copy into the second photo
 *  (RenderPipeline::takePhotoB() blits all four channels).  Every scene that samples the photo for its colour takes
 *  `.rgb` (2,132 of 2,149 2D scenes through `img()`); the six scenes that passed the photo's alpha on to their
 *  output set it to 1 since this change, which is what an opaque JPG gave them (docs/engine-internals-69-depth.md).
 *
 *  The map goes through the same geometry as the colour: mirrored vertically (QImage row 0 is the top, GL's t = 0
 *  the bottom) and stretched with Qt::SmoothTransformation to the size of the prepared photo (prepareImage(): 1024 x
 *  1024 in the app; the editor keeps the photo's own size, PreviewWidget::makeTexture()).  Without a map, or for a
 *  photo the table marks flat, alpha stays 255 as before and Info::map is false -- the shaders' `photoDepthAmt`.
 *
 *  Header-only (like SettingsFile.h): the app (RenderPipeline.cpp), the editor (PresetEditor/PreviewWidget.cpp) and
 *  the self test (CueSelfTest.cpp) use the same code, so a probe render loads a map exactly as the app does.
 *
 *  @author René Weller
 */

#pragma once

#include <QtCore/QDir>
#include <QtCore/QFile>
#include <QtCore/QFileInfo>
#include <QtCore/QHash>
#include <QtCore/QMutex>
#include <QtCore/QMutexLocker>
#include <QtCore/QString>
#include <QtCore/QStringList>
#include <QtCore/QtGlobal>
#include <QtCore/qnumeric.h>
#include <QtGui/QImage>

#include <cstdio>

namespace PhotoDepth
{

/** What the host knows about one photo slot's depth; travels with the texture it was loaded into. */
struct Info
{
    bool  map = false;   ///< A depth map was written into the alpha channel (otherwise alpha is 255 as before).
    float focusU = 0.5f; ///< Subject centre, texture coordinates (u right; the picture's centre without a measure).
    float focusV = 0.5f; ///< Subject centre, texture coordinates (v UP: the upload mirrors the image vertically).
    float thr = 1.f;     ///< Depth threshold of the subject (subject = depth >= thr), 0..1; 1 without a measure.
    float conf = 0.f;    ///< Confidence of the subject centre (focusU, focusV), 0..1; 0 without one.
    float mask = 0.f;    ///< How well depth >= thr outlines the subject (IoU, 0..1; 0 without a measure).
};

/** One row of photo_info.tsv, as far as the host uses it. */
struct Row
{
    bool  flat = false;       ///< The photo has no relief worth showing (pattern, texture, sky): it gets no depth.
    bool  hasFocus = false;   ///< fx and fy were measured.
    float fx = 0.5f;          ///< Subject centre x, image coordinates (right), 0..1.
    float fy = 0.5f;          ///< Subject centre y, image coordinates (DOWN), 0..1.
    bool  hasSubject = false; ///< thr and conf were measured.
    float thr = 1.f;          ///< Depth threshold of the subject, 0..1.
    float conf = 0.f;         ///< Confidence of the subject centre, 0..1.
    float mask = 0.f;         ///< IoU of depth >= thr against the detected subject region, 0..1 (0: not measured).
};

/**  Whether the depth is switched off for comparisons (KALEIDO_NO_DEPTH=1).
 *
 * @return
 *   True while KALEIDO_NO_DEPTH is set to a number other than 0.  Read at every call (cheap: once per photo), so
 *   the self test can switch it.
 **/
inline bool disabled()
{
    return qEnvironmentVariableIntValue( "KALEIDO_NO_DEPTH" ) != 0;
}

/**  Whether a folder is the depth maps' folder beside the photos, which the photo walk must not enter.
 *
 * @param name  The folder's name (no path). (in)
 *
 * @return
 *   True for ".depth".  The maps are PNGs, and RenderPipeline::traverse() takes every PNG it finds as a photo.
 **/
inline bool isDepthFolder( const QString &name )
{
    return name == QLatin1String( ".depth" );
}

/**  Reads one cell of photo_info.tsv as a number.
 *
 * @param s    The cell. (in)
 * @param out  The number, if there is one. (out)
 *
 * @return
 *   False for an empty cell, `-` or text that is no number.
 **/
inline bool cellNumber( const QString &s, float &out )
{
    const QString t = s.trimmed();
    if ( t.isEmpty() || t == QLatin1String( "-" ) )
        return false;
    bool        ok = false;
    const float v = t.toFloat( &ok );
    if ( !ok || !qIsFinite( v ) )
        return false;
    out = v;
    return true;
}

/**  Parses a photo_info.tsv text (the columns found by the header's names, in any order).
 *
 * @param text  The file's content. (in)
 *
 * @return
 *   The rows by the file column (the photo's file name with extension, compared case-insensitively on Windows
 *   through the caller's lower-casing: keys are lower case).
 **/
inline QHash<QString, Row> parseTable( const QString &text )
{
    QHash<QString, Row> rows;
    const QStringList   lines = text.split( QLatin1Char( '\n' ) );
    if ( lines.isEmpty() )
        return rows;
    QStringList head = lines[0].trimmed().split( QLatin1Char( '\t' ) );
    for ( QString &h : head )
        h = h.trimmed().toLower();
    const int c_file = static_cast<int>( head.indexOf( QStringLiteral( "file" ) ) );
    const int c_flat = static_cast<int>( head.indexOf( QStringLiteral( "flat" ) ) );
    const int c_fx = static_cast<int>( head.indexOf( QStringLiteral( "fx" ) ) );
    const int c_fy = static_cast<int>( head.indexOf( QStringLiteral( "fy" ) ) );
    const int c_thr = static_cast<int>( head.indexOf( QStringLiteral( "thr" ) ) );
    const int c_conf = static_cast<int>( head.indexOf( QStringLiteral( "conf" ) ) );
    const int c_mask = static_cast<int>( head.indexOf( QStringLiteral( "mask" ) ) );
    if ( c_file < 0 )
        return rows;
    for ( int i = 1; i < lines.size(); ++i )
    {
        const QStringList c = lines[i].split( QLatin1Char( '\t' ) );
        if ( c.size() <= c_file || c[c_file].trimmed().isEmpty() )
            continue;
        auto cell = [&c]( int k )
        { return k >= 0 && k < c.size() ? c[k].trimmed() : QString(); };
        Row           r;
        const QString flat = cell( c_flat ).toLower();
        r.flat = flat == QLatin1String( "1" ) || flat == QLatin1String( "yes" ) || flat == QLatin1String( "true" )
                 || flat == QLatin1String( "flat" ) || flat == QLatin1String( "y" );
        float fx = 0.f, fy = 0.f, thr = 0.f, conf = 0.f;
        if ( cellNumber( cell( c_fx ), fx ) && cellNumber( cell( c_fy ), fy ) )
        {
            r.hasFocus = true;
            r.fx = qBound( 0.f, fx, 1.f );
            r.fy = qBound( 0.f, fy, 1.f );
        }
        if ( cellNumber( cell( c_thr ), thr ) && cellNumber( cell( c_conf ), conf ) )
        {
            r.hasSubject = true;
            r.thr = qBound( 0.f, thr, 1.f );
            r.conf = qBound( 0.f, conf, 1.f );
        }
        float mask = 0.f; // a later column (26.11.2026): the mask's quality, read by its name like the others
        if ( cellNumber( cell( c_mask ), mask ) )
            r.mask = qBound( 0.f, mask, 1.f );
        rows.insert( c[c_file].trimmed().toLower(), r );
    }
    return rows;
}

/**  The row of one photo in a folder's photo_info.tsv; the table is read once per folder and kept.
 *
 * @param dir   The folder that holds photo_info.tsv. (in)
 * @param file  The photo's file name with extension. (in)
 * @param out   The row, if there is one. (out)
 *
 * @return
 *   False if the folder has no table or the table no row for the photo.
 *
 * Thread-safe: the photo loader thread and the render thread (the start pair) both ask.  A table that changes
 * while the program runs is read again at the next start.
 **/
inline bool row( const QString &dir, const QString &file, Row &out )
{
    static QMutex                              Lock;
    static QHash<QString, QHash<QString, Row>> Tables;
    QMutexLocker                               lock( &Lock );
    const QString                              key = QDir::cleanPath( dir ).toLower();
    auto                                       it = Tables.find( key );
    if ( it == Tables.end() )
    {
        QHash<QString, Row> rows;
        QFile               f( QDir( dir ).filePath( QStringLiteral( "photo_info.tsv" ) ) );
        if ( f.open( QIODevice::ReadOnly ) )
            rows = parseTable( QString::fromUtf8( f.readAll() ).remove( QLatin1Char( '\r' ) ) );
        it = Tables.insert( key, rows );
    }
    auto r = it->find( file.toLower() );
    if ( r == it->end() )
        return false;
    out = r.value();
    return true;
}

/**  The depth map of a photo, if there is one.
 *
 * @param photo     The photo's path. (in)
 * @param tableDir  The folder the map was found in, which holds its photo_info.tsv. (out, may be null)
 *
 * @return
 *   KALEIDO_DEPTH_DIR\<name>.png if that exists, else \<photo folder\>\.depth\<name>.png if that exists, else an
 *   empty string (name = the photo's file name without its last extension).
 **/
inline QString mapPath( const QString &photo, QString *tableDir = nullptr )
{
    const QFileInfo fi( photo );
    const QString   name = fi.completeBaseName() + QStringLiteral( ".png" );
    const QString   env = qEnvironmentVariable( "KALEIDO_DEPTH_DIR" );
    QStringList     dirs;
    if ( !env.isEmpty() )
        dirs << env;
    dirs << fi.absolutePath() + QStringLiteral( "/.depth" );
    for ( const QString &d : dirs )
    {
        const QString p = QDir( d ).filePath( name );
        if ( QFileInfo::exists( p ) )
        {
            if ( tableDir )
                *tableDir = d;
            return p;
        }
    }
    return QString();
}

/**  Whether a photo has relief worth showing: a depth map that its table does not mark flat (plan 27.11.2026 P1).
 *
 * @param photo  The photo's path. (in)
 *
 * @return
 *   True if applyToAlpha() would give the photo a depth (Info::map); false without a map, for a flat photo and with
 *   KALEIDO_NO_DEPTH.  Reads no image: the map's existence and the table row only (both cheap, the table cached).
 **/
inline bool hasRelief( const QString &photo )
{
    if ( disabled() )
        return false;
    QString dir;
    if ( mapPath( photo, &dir ).isEmpty() )
        return false;
    Row r;
    return !( row( dir, QFileInfo( photo ).fileName(), r ) && r.flat );
}

/**  Writes a photo's depth map into the alpha channel of its prepared image.
 *
 * @param image  The photo as it goes to the GPU: already mirrored vertically, in Format_ARGB32(_Premultiplied),
 *               Format_RGB32 or Format_RGBA8888.  Its colour bytes are not touched. (in,out)
 * @param photo  The photo's path (finds the map and the table row). (in)
 *
 * @return
 *   What the slot that receives this image knows about its depth; Info::map is false (and the image unchanged)
 *   without a map, for a flat photo, with KALEIDO_NO_DEPTH, for an unreadable map or an image format not listed.
 *
 * The map is mirrored and stretched to the image's size exactly like the colour (Qt::IgnoreAspectRatio,
 * Qt::SmoothTransformation), so depth texel and colour texel are the same point of the picture.
 **/
inline Info applyToAlpha( QImage &image, const QString &photo )
{
    Info info;
    if ( disabled() || image.isNull() || photo.isEmpty() )
        return info;
    const QImage::Format fmt = image.format();
    const bool           rgb32 = fmt == QImage::Format_ARGB32 || fmt == QImage::Format_ARGB32_Premultiplied
                                 || fmt == QImage::Format_RGB32;
    if ( !rgb32 && fmt != QImage::Format_RGBA8888 )
        return info;
    QString       table_dir;
    const QString map_path = mapPath( photo, &table_dir );
    if ( map_path.isEmpty() )
        return info;
    Row        r;
    const bool has_row = row( table_dir, QFileInfo( photo ).fileName(), r );
    if ( has_row && r.flat )
        return info;
    QImage m( map_path );
    if ( m.isNull() )
    {
        fprintf( stderr, "WARNING: unreadable depth map '%s' -- the photo has no depth\n", qPrintable( map_path ) );
        return info;
    }
    m = m.convertToFormat( QImage::Format_RGB32 )
            .mirrored( false, true )
            .scaled( image.width(), image.height(), Qt::IgnoreAspectRatio, Qt::SmoothTransformation );
    if ( m.format() != QImage::Format_RGB32 )
        m = m.convertToFormat( QImage::Format_RGB32 );
    const int w = image.width(), h = image.height();
    for ( int y = 0; y < h; ++y )
    {
        const QRgb *src = reinterpret_cast<const QRgb *>( m.constScanLine( y ) );
        if ( rgb32 )
        {
            QRgb *dst = reinterpret_cast<QRgb *>( image.scanLine( y ) );
            for ( int x = 0; x < w; ++x )
                dst[x] = ( dst[x] & 0x00ffffffu ) | ( static_cast<QRgb>( qRed( src[x] ) ) << 24 );
        }
        else
        {
            uchar *dst = image.scanLine( y );
            for ( int x = 0; x < w; ++x )
                dst[4 * x + 3] = static_cast<uchar>( qRed( src[x] ) );
        }
    }
    info.map = true;
    if ( has_row && r.hasFocus )
    {
        info.focusU = r.fx;
        info.focusV = 1.f - r.fy; // image y runs down, the texture's v up (the upload mirrored the rows)
    }
    if ( has_row && r.hasSubject )
    {
        info.thr = r.thr;
        info.conf = r.conf;
    }
    if ( has_row )
        info.mask = r.mask;
    return info;
}

} // namespace PhotoDepth
