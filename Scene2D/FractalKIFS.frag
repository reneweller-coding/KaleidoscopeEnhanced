#version 330 core
out vec4 fragColor;
// FractalKIFS.frag
// -----------------------------------------------------------------------
// Kaleidoscopic Iterated Function System (fold + rotate + scale): the source
// image is sampled THROUGH the folded IFS coordinate, so the picture itself is
// shattered into an endlessly self-similar fractal kaleidoscope, with the
// orbit-trap structure glowing through it.  The *image* is the star (was a
// dark procedural base with the picture only inside bright bits).
//   audioMode     -> fold angle (minor = sharp/edgy, major = soft)
//   audioPitch    -> zoom
//   audioArousal  -> per-iteration scale (busier when energetic)
//   audioPhase    -> smooth, jump-free overall rotation
//   audioValence/Centroid -> palette & brightness; audioBeat -> bloom
// -----------------------------------------------------------------------

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

    float zoom = 1.5 - 0.5 * audioPitch;
    p *= zoom;
    p  = rot(audioPhase * 0.4 + time * 0.03) * p;

    // Per-mood fractal character: mode bends the c-vector, arousal tightens it.
    vec2 c = vec2(0.84 + 0.22 * audioMode + 0.03 * sin(time * 0.11),
                  0.60 + 0.14 * audioArousal);

    vec2  fp   = p;
    float acc  = 0.0;
    float trap = 1e9;
    for (int i = 0; i < 11; i++)
    {
        fp   = abs(fp) / max(dot(fp, fp), 1e-6) - c;
        trap = min(trap, abs(fp.y));
        acc += exp(-8.0 * abs(fp.y));           // every layer adds filigree
    }
    float lines = clamp(acc * 0.16, 0.0, 1.4);

    // The picture, shattered through the folded coordinate.
    vec3 pic = img(fract(fp * 0.22 + 0.5));
    vec3 lit = imgPalette(0.30 * audioValence + trap * 0.8) * 1.5;

    vec3 col = pic * 0.15
             + lit * lines * (0.55 + 0.35 * audioBeat)
             + vec3(0.85) * pow(lines * 0.68, 3.0) * 0.30;   // white sparkle core
    col *= (0.75 + 0.6 * audioLevel + 0.25 * audioCentroid);
    col *= (1.0 + 0.2 * audioFlux);

    col /= 1.0 + 0.30 * max(col.r, max(col.g, col.b));
    fragColor = vec4(col, 1.0);
}
