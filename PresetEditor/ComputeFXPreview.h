//---------------------------------------------------------------------------
//                              ComputeFXPreview
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  Thin wrapper around Source/ComputeFX for PreviewWidget's 2D preview path.
 *
 *  DELIBERATELY here and not a plain `ComputeFX m_cfx;` member on
 *  PreviewWidget: ComputeFX.h pulls in glcore.h, which uses `#define` to remap
 *  every gl* call in the file that includes it onto a loaded function pointer.
 *  PreviewWidget.cpp calls GL through Qt's QOpenGLFunctions instead -- the
 *  same reasoning Scene3DPreview.h documents for Scene3DShader applies
 *  verbatim here. Kept in its own .cpp, with no GL types in this header
 *  (texture handles cross the boundary as plain unsigned int) so
 *  PreviewWidget.h can include it without ever seeing glcore's macros.
 *
 *  @author René Weller
 */

#pragma once

#include "../Source/AudioFeatures.h"

class ComputeFX;

/** @class ComputeFXPreview
 *
 * Pimpl-style facade over ComputeFX for PreviewWidget's 2D texture-shader preview path.
 *
 * Forwards every call straight through to an owned ComputeFX instance
 * (constructed in the .cpp, the only translation unit here that includes
 * Source/ComputeFX.h / glcore.h). Exists purely to keep glcore's gl*
 * macro-remapping out of PreviewWidget.cpp -- see the file-level comment
 * above for why that separation matters.
 **/
class ComputeFXPreview
{
public:
    /** Constructs the wrapped ComputeFX instance (no GL calls yet; see init()). */
    ComputeFXPreview();
    /** Destroys the wrapped ComputeFX instance. */
    ~ComputeFXPreview();

    /** Query GL limits + compute availability once (context must be current). */
    void init();

    /**  Advance sim @p k by one frame and return the texture to bind on CfxInfoTable[k].unit.
     *
     * @param k         A CfxKindE (see Source/CfxTypes.h) identifying which sim to step. (in)
     * @param a         Current audio feature snapshot driving the sim's reactive parameters. (in)
     * @param dt        Elapsed wall-clock time in seconds since the sim's last step. (in)
     * @param time      Current wall-clock time in seconds (absolute, for phase accumulation). (in)
     * @param srcImage  Source colour texture the sim may sample/seed from. (in)
     * @param outW      Output texture width in pixels. (in)
     * @param outH      Output texture height in pixels. (in)
     *
     * @return
     *   The result texture to bind, or 0 when the sim is unavailable or failed -- caller then binds nothing, same
     *   contract as ComputeFX::step().
     **/
    unsigned int step( int k, const AudioFeatures &a, float dt, float time,
                       unsigned int srcImage, int outW, int outH );

    /**  Free a sim's GPU memory when it has not been on screen for a while.
     *
     * @param now  Current wall-clock time in seconds, compared against each sim's last-used timestamp. (in)
     **/
    void retireIdle( float now );

private:
    ComputeFX *m_impl; ///< Owned ComputeFX instance; all calls above forward to it.
private:
    /** Not copyable (CGVR template: copy constructor and assignment are always declared). */
    ComputeFXPreview( const ComputeFXPreview & ) = delete;
    /**  Not assignable; see the copy constructor.
     *
     * @return
     *   Nothing: the operator is deleted, so no call compiles.
     **/
    ComputeFXPreview &operator=( const ComputeFXPreview & ) = delete;
};
