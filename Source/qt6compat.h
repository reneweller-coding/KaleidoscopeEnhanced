//---------------------------------------------------------------------------
//                              qt6compat
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  Small Qt5 -> Qt6 API-shim: restores the qrand()/qsrand() free functions that Qt6 removed, so the many existing
 *  call sites across the codebase keep compiling and behaving the same without being rewritten one by one.
 *
 *  @author René Weller
 */

#ifndef QT6COMPAT_H
#define QT6COMPAT_H

// ---------------------------------------------------------------------------
// Qt6 compatibility shims.
// qrand()/qsrand() were removed in Qt6.  The codebase calls them in dozens of
// places (qrand() % n  and  (float)qrand()/RAND_MAX), so rather than rewrite
// every site we provide drop-in replacements backed by QRandomGenerator, which
// is automatically seeded (qsrand becomes a no-op).
// ---------------------------------------------------------------------------

#include <cstdlib> // RAND_MAX
#include <QtCore/QRandomGenerator>

/**  Drop-in replacement for the Qt5 qrand(), backed by QRandomGenerator.
 *
 * @return
 *   A pseudo-random integer in [0, RAND_MAX], matching the historical qrand() range.
 *
 * QRandomGenerator::bounded(hi) returns [0, hi); match the historical
 * qrand() range of [0, RAND_MAX].
 **/
inline int qrand()
{
    return static_cast<int>( QRandomGenerator::global()->bounded( static_cast<quint32>( RAND_MAX ) + 1 ) );
}

/**  Drop-in replacement for the Qt5 qsrand(); a no-op under Qt6.
 *
 * Its unnamed seed parameter is ignored: QRandomGenerator::global() is
 * auto-seeded by the engine, so there is nothing to seed here.
 **/
inline void qsrand( unsigned int /*seed*/ )
{
    // QRandomGenerator::global() is seeded by the engine; nothing to do.
}

#endif // QT6COMPAT_H
