// CombinePulse.frag
// -----------------------------------------------------------------------
// The first BEAT-reactive combine pass.  Classic combines are static folds;
// this one breathes with the music (research: loudness/beat -> expansion,
// impulsive pulsation with envelope release):
//   audioBeat      -> a gentle centre zoom "breath" (slew-limited upstream);
//   audioBeatPhase -> a subtle radial shock-wave expanding outward each beat
//                     (CONTINUOUS phase - no snapping);
//   audioPhase     -> slow jump-free rotation;
//   audioDownbeat  -> a slightly deeper breath on the bar's "1".
// Kept deliberately subtle: it composes with any texture effect underneath.
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioBeat;
uniform float audioDownbeat;
uniform float audioBeatPhase;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

void main()
{
    vec2 p = gl_FragCoord.xy / resolution;

    // Centre the coordinate for the zoom/rotation, aspect-corrected.
    vec2 c = p - 0.5;
    c.x *= resolution.x / resolution.y;

    float r = length(c);

    // Beat breath: zoom in slightly on the beat (deeper on the downbeat).
    float breath = 0.030 * audioBeat + 0.015 * audioDownbeat;
    c /= (1.0 + breath);

    // Radial shock-wave riding the continuous beat phase: a faint expanding
    // ripple that displaces the sampling radius as it passes.
    float wR   = audioBeatPhase * 1.2;
    float wave = exp(-pow((r - wR) * 10.0, 2.0)) * audioBeat;
    c *= 1.0 + 0.012 * wave;

    // Slow continuous rotation.
    c = rot(audioPhase * 0.05) * c;

    c.x /= resolution.x / resolution.y;
    vec2 uv = c + 0.5;

    gl_FragColor = interpolation * texture2D(tex0, uv)
                 + (1.0 - interpolation) * texture2D(tex1, uv);
}
