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
#include <mutex>
#include <QtCore/QRandomGenerator>

/**  Drop-in replacement for the Qt5 qrand(), backed by QRandomGenerator.
 *
 * @return
 *   A pseudo-random integer in [0, RAND_MAX], matching the historical qrand() range.
 *
 * QRandomGenerator::bounded(hi) returns [0, hi); match the historical
 * qrand() range of [0, RAND_MAX].
 *
 * With KALEIDO_SEED set (a measurement run) the numbers come from a generator of their own seeded with it, not from
 * the engine-seeded global one: the photos (and the title style) were rolled anew on every start, so two screening
 * runs with one seed differed by up to a factor of ten in a photo scene's brightness (17.10.2026).  A generator of
 * its own, not rand(): that keeps the scenes' parameter rolls (rand()) exactly as they were.
 **/
inline int qrand()
{
    static QRandomGenerator *Seeded = qEnvironmentVariableIsSet( "KALEIDO_SEED" )
                                          ? new QRandomGenerator( static_cast<quint32>(
                                                qEnvironmentVariableIntValue( "KALEIDO_SEED" ) ) )
                                          : nullptr;
    static std::mutex        SeededLock; // a QRandomGenerator of one's own is not thread-safe, global() is
    const quint32            Range = static_cast<quint32>( RAND_MAX ) + 1;
    if ( !Seeded )
        return static_cast<int>( QRandomGenerator::global()->bounded( Range ) );
    std::lock_guard<std::mutex> lock( SeededLock );
    return static_cast<int>( Seeded->bounded( Range ) );
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
