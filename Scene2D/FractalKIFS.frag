#version 330 core
out vec4 fragColor;
/**
 * @file FractalKIFS.frag
 * @brief Kaleidoscopic Iterated Function System (fold + rotate + scale): the source
 * image is sampled THROUGH the folded IFS coordinate, so the picture itself is
 * shattered into an endlessly self-similar fractal kaleidoscope, with the
 * orbit-trap structure glowing through it.  The *image* is the star (was a
 * dark procedural base with the picture only inside bright bits).
 *   audioMode     -> bends the c-vector's real part (minor = sharp/edgy, major = soft)
 *   audioPitch    -> zoom
 *   audioArousal  -> bends the c-vector's imaginary part (busier when energetic)
 *   audioPhase    -> smooth, jump-free overall rotation
 *   audioValence/Centroid -> palette & brightness; audioBeat -> lace bloom
 *   audioLevel/Flux -> overall exposure
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioBeat;
uniform float audioLevel;
uniform float audioCentroid;
uniform float audioFlux;
uniform float audioMode;     // 0 = minor/dark .. 1 = major/bright
uniform float audioPitch;    // 0..1
uniform float audioArousal;
uniform float audioValence;
uniform float audioPhase;
uniform float audioChromaHue;
uniform float audioAdvance;

const float PI = 3.14159265358979;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

// USER-FEEDBACK-REDESIGN: the old fold/rotate/scale parametrisation was
// degenerate (its attractor is space-filling, every orbit trap read ~0 and
// the frame came out as flat mush).  Core replaced by the battle-tested
// KALISET  p = abs(p)/dot(p,p) - c  — robust, endlessly detailed fractal
// lace for practically any c, with the photo sampled through the final
// folded coordinate.
void main()
{
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;

    float zoom = 2.4 - 0.7 * audioPitch;
    p *= zoom;
    // 0.25 rather than 0.4 on the rotation phase: at 0.4 the lace slid ~0.9 px
    // per frame, and a structure this fine turns that into visible boiling.
    p  = rot(audioPhase * 0.25 + time * 0.03) * p;

    // Per-mood fractal character: mode bends the c-vector, arousal tightens it.
    vec2 c = vec2(0.84 + 0.22 * audioMode + 0.03 * sin(time * 0.11),
                  0.60 + 0.14 * audioArousal);

    // ---- WHY THIS LOOP WAS REWRITTEN ------------------------------------
    // The old version SUMMED exp(-5.0*|fp.y|) + 0.7*exp(-5.0*|fp.x|) over 11
    // iterations. With a decay constant that soft, every single iteration
    // returns something in the 0.3-0.5 range no matter where the pixel is, and
    // summing eleven of them concentrates the result around its own mean: the
    // measured distribution of `acc` was p5 3.29 / p50 4.12 / p95 5.01, i.e.
    // `lines` was a near-CONSTANT 0.36-0.55 across the entire frame. `haze`
    // was the same story (p5 1.25 / p50 1.51, then min()-capped at 1.6 over
    // 18% of the frame) and contributed a term whose standard deviation was
    // 0.007. Add a flat pic*0.26 base and the whole image is one level: the
    // simulated frame reproduced the reported contrast of 0.045 exactly.
    //
    // The second, subtler defect: at 11 iterations the Kaliset lace is FINER
    // THAN THE PIXEL GRID. Measuring the distance to the nearest curve in
    // pixels gives a median of 0.17 px -- roughly six curves per pixel. That
    // is why a 4x supersampled render of the old shader measured occ 0.19
    // against 0.68 at 1x: the "detail" was aliasing noise that averages to
    // grey the moment the frame is downscaled.
    //
    // Fix: (1) MIN-distance orbit traps instead of a sum, so a pixel is either
    // on a curve or it is not; (2) carry the running Jacobian scale of the
    // inversion and divide the traps by it, which converts them into an
    // approximate SCREEN-SPACE distance -- the lace then has the same width
    // everywhere instead of collapsing to hairlines wherever the map expands;
    // (3) six generations, not eleven, so the curves stay about 8 px apart at
    // 1080p. 1x and 4x supersampled renders now measure the same contrast.
    vec2  fp   = p;
    float dsc  = 1.0;        // accumulated |Jacobian| of the folds so far
    float tn   = 1e9;        // axis trap, screen-space
    float trn  = 1e9;        // ring trap, screen-space
    for (int i = 0; i < 6; i++)
    {
        float dd = max(dot(fp, fp), 1e-6);
        fp  = abs(fp) / dd - c;
        dsc = min(dsc / dd, 1e10);
        tn  = min(tn,  abs(fp.y) / dsc);
        trn = min(trn, abs(length(fp) - 0.85) / dsc);
    }
    // Lace half-width as a fixed fraction of frame HEIGHT (1/150), so the
    // filigree is ~7 px at 1080p -- thick enough to survive the ~6x downscale
    // the scan measures at, and identical at any output resolution.
    float w = zoom / 150.0;
    tn /= w;
    trn /= w;

    float lace  = exp(-tn)       + 0.7 * exp(-trn);         // the curves
    float halo  = exp(-tn / 2.2) + 0.7 * exp(-trn / 2.2);   // their near field
    float spark = exp(-tn / 0.45);                          // white hot cores

    // The picture, shattered through the folded coordinate -- gated on `halo`
    // so the photo lives ON the lace and the field between the curves stays
    // dark. Written flat (the old pic*0.26) it was a full-frame pedestal that
    // became the modal luma bucket and swallowed everything else.
    vec3 pic = img(fract(fp * 0.22 + 0.5));
    vec3 lit = imgPalette(0.30 * audioValence + clamp(tn * 0.02, 0.0, 2.0)) * 1.5;

    vec3 col = pic * (0.03 + 0.16 * halo)
             + lit * lace * (0.60 + 0.20 * audioBeat)
             + vec3(0.9) * spark * 0.26;                    // white sparkle core
    // The old audio gain swung from 0.87 in silence to 1.49 at full level,
    // which dragged the quiet passages below the contrast floor. Narrower now.
    col *= 0.55 * (0.95 + 0.35 * audioLevel + 0.15 * audioCentroid);
    col *= (1.0 + 0.2 * audioFlux);

    col /= 1.0 + 0.30 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
