// FractalKIFS.frag
// -----------------------------------------------------------------------
// Kaleidoscopic Iterated Function System (fold + rotate + scale) with an
// orbit-trap colouring.  A trippy centrepiece that morphs with harmony.
//   audioMode     -> fold angle (minor = sharp/edgy, major = soft)
//   audioPitch    -> zoom
//   audioArousal  -> per-iteration scale (busier when energetic)
//   audioPhase    -> smooth, jump-free overall rotation
//   audioValence/Centroid -> palette & brightness
//   audioBeat     -> bloom on the structure (slew-limited host-side)
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

mat2 rot(float a) { float c = cos(a); float s = sin(a); return mat2(c, -s, s, c); }

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p  = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;

    // Zoom breathes with pitch; overall rotation from smooth audio phase.
    float zoom = 1.6 - 0.6 * audioPitch;
    p *= zoom;
    p  = rot(audioPhase * 0.4 + time * 0.03) * p;

    // Fold angle from musical mode.
    float foldA = mix(PI / 3.0, PI / 5.0, audioMode);
    mat2  R     = rot(foldA + 0.1 * sin(time * 0.2));

    float scale = 1.0;
    float trap  = 1e9;
    for (int i = 0; i < 6; i++)
    {
        p  = abs(p);
        p  = R * p;
        p -= vec2(0.30 + 0.12 * audioLevel, 0.18);
        float s = 1.30 + 0.10 * audioArousal;
        p     *= s;
        scale *= s;
        trap   = min(trap, length(p));
    }

    float d     = trap / scale;
    float shade = exp(-6.0 * d);

    // Palette: dark base -> mood-coloured highlight.
    vec3 dark = vec3(0.20, 0.10, 0.35);
    vec3 lit  = mix(vec3(0.95, 0.55, 0.20), vec3(0.40, 0.80, 1.05), audioValence);
    vec3 col  = mix(dark, lit, shade);
    col *= (0.5 + 0.8 * audioLevel + 0.6 * audioCentroid);

    // Image as texture inside the bright structure.
    vec4 img = interpolation * texture2D(tex0, uv) + (1.0 - interpolation) * texture2D(tex1, uv);
    col = mix(col, col * (0.5 + 1.5 * img.rgb), shade * 0.5);

    // Beat bloom + flux brightening.
    col += shade * audioBeat * vec3(0.5, 0.4, 0.6);
    col *= (1.0 + 0.2 * audioFlux);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
