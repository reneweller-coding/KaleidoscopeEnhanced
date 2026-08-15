// ComputeFXPreview.h — thin wrapper around Source/ComputeFX for PreviewWidget's
// 2D path.  DELIBERATELY here and not a plain `ComputeFX m_cfx;` member on
// PreviewWidget: ComputeFX.h pulls in glcore.h, which #define-remaps every
// gl* call in the file that includes it onto a loaded function pointer.
// PreviewWidget.cpp calls GL through Qt's QOpenGLFunctions instead -- the
// same reasoning Scene3DPreview.h documents for Scene3DShader applies
// verbatim here. Kept in its own .cpp, with no GL types in this header
// (texture handles cross the boundary as plain unsigned int) so
// PreviewWidget.h can include it without ever seeing glcore's macros.
#pragma once

#include "../Source/AudioFeatures.h"

class ComputeFX;

class ComputeFXPreview
{
public:
    ComputeFXPreview();
    ~ComputeFXPreview();

    // Query GL limits + compute availability once (context must be current).
    void init();

    // Advance sim `k` (a CfxKind, see Source/CfxTypes.h) by one frame and
    // return the texture to bind on kCfxInfo[k].unit. Returns 0 when the sim
    // is unavailable or failed -- caller then binds nothing, same contract
    // as ComputeFX::step().
    unsigned int step(int k, const AudioFeatures &a, float dt, float time,
                       unsigned int srcImage, int outW, int outH);

    // Free a sim's GPU memory when it has not been on screen for a while.
    void retireIdle(float now);

private:
    ComputeFX *m_impl;
};
