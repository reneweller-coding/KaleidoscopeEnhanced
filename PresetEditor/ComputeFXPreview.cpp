// ComputeFXPreview.cpp — see ComputeFXPreview.h for why this indirection
// exists. DELIBERATELY its own translation unit: this is the only file in
// the 2D preview path that includes Source/ComputeFX.h (and, through it,
// glcore.h).
#include "ComputeFXPreview.h"
#include "../Source/ComputeFX.h"

ComputeFXPreview::ComputeFXPreview() : m_impl(new ComputeFX()) {}
ComputeFXPreview::~ComputeFXPreview() { delete m_impl; }

void ComputeFXPreview::init() { m_impl->init(); }

unsigned int ComputeFXPreview::step(int k, const AudioFeatures &a, float dt, float time,
                                     unsigned int srcImage, int outW, int outH)
{
    return m_impl->step(k, a, dt, time, GLuint(srcImage), outW, outH);
}

void ComputeFXPreview::retireIdle(float now) { m_impl->retireIdle(now); }
