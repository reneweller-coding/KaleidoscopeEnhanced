#ifndef QT6COMPAT_H
#define QT6COMPAT_H

// ---------------------------------------------------------------------------
// Qt6 compatibility shims.
// qrand()/qsrand() were removed in Qt6.  The codebase calls them in dozens of
// places (qrand() % n  and  (float)qrand()/RAND_MAX), so rather than rewrite
// every site we provide drop-in replacements backed by QRandomGenerator, which
// is automatically seeded (qsrand becomes a no-op).
// ---------------------------------------------------------------------------

#include <cstdlib>                    // RAND_MAX
#include <QtCore/QRandomGenerator>

inline int qrand()
{
    // QRandomGenerator::bounded(hi) returns [0, hi); match the historical
    // qrand() range of [0, RAND_MAX].
    return int(QRandomGenerator::global()->bounded(quint32(RAND_MAX) + 1));
}

inline void qsrand(unsigned int /*seed*/)
{
    // QRandomGenerator::global() is seeded by the engine; nothing to do.
}

#endif // QT6COMPAT_H
