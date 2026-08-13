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

const float PI = 3.14159265358979;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }

void main()
{
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;

    // Zoom breathes with pitch; overall rotation from smooth audio phase.
    float zoom = 1.6 - 0.6 * audioPitch;
    p *= zoom;
    p  = rot(audioPhase * 0.4 + time * 0.03) * p;

    float foldA = mix(PI / 3.0, PI / 5.0, audioMode);
    mat2  R     = rot(foldA + 0.1 * sin(time * 0.2));

    float scale = 1.0;
    float trap  = 1e9;
    vec2  fp    = p;
    for (int i = 0; i < 6; i++)
    {
        fp  = abs(fp);
        fp  = R * fp;
        fp -= vec2(0.30 + 0.12 * audioLevel, 0.18);
        float s = 1.30 + 0.10 * audioArousal;
        fp    *= s;
        scale *= s;
        trap   = min(trap, length(fp));
    }

    float d     = trap / scale;
    float shade = exp(-6.0 * d);

    // The picture, sampled through the final folded coordinate = fractal
    // kaleidoscope of the image.
    vec2 iuv = fp * 0.15 + 0.5;
    vec3 pic = img(fract(iuv));

    vec3 lit = mix(vec3(0.95, 0.55, 0.20), vec3(0.40, 0.80, 1.05), audioValence);

    // Dark where there is no structure, lit picture where the fractal traps.
    vec3 col = pic * mix(vec3(0.30), lit * 1.5, shade);
    col *= (0.6 + 0.9 * audioLevel + 0.5 * audioCentroid);
    col += shade * audioBeat * vec3(0.5, 0.4, 0.6);
    col *= (1.0 + 0.2 * audioFlux);

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
