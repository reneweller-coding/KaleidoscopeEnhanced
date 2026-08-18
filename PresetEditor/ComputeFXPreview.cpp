/**
 * @file ComputeFXPreview.cpp
 * @brief See ComputeFXPreview.h for why this indirection exists. DELIBERATELY
 *        its own translation unit: this is the only file in the 2D preview
 *        path that includes Source/ComputeFX.h (and, through it, glcore.h).
 */
#include "ComputeFXPreview.h"
#include "../Source/ComputeFX.h"

/// Allocates the wrapped ComputeFX; no GL calls happen until init().
ComputeFXPreview::ComputeFXPreview() : m_impl(new ComputeFX()) {}
/// Deletes the wrapped ComputeFX (frees its GPU resources).
ComputeFXPreview::~ComputeFXPreview() { delete m_impl; }

void ComputeFXPreview::init() { m_impl->init(); }

// GLuint here is Source/ComputeFX.h's glcore-remapped type; the plain
// `unsigned int` in the header signature is what lets PreviewWidget.h
// include this wrapper without ever seeing that macro.
unsigned int ComputeFXPreview::step(int k, const AudioFeatures &a, float dt, float time,
                                     unsigned int srcImage, int outW, int outH)
{
    return m_impl->step(k, a, dt, time, GLuint(srcImage), outW, outH);
}

void ComputeFXPreview::retireIdle(float now) { m_impl->retireIdle(now); }
