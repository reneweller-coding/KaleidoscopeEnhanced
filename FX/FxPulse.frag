#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file FxPulse.frag
 * @brief The first BEAT-reactive combine pass.  Classic combines are static folds;
 * this one breathes with the music (research: loudness/beat -> expansion,
 * impulsive pulsation with envelope release):
 *   audioBeat      -> a gentle centre zoom "breath" (slew-limited upstream);
 *   audioBeatPhase -> a subtle radial shock-wave expanding outward each beat
 *                     (CONTINUOUS phase - no snapping);
 *   audioPhase     -> slow jump-free rotation;
 *   audioDownbeat  -> a slightly deeper breath on the bar's "1".
 * Kept deliberately subtle: it composes with any texture effect underneath.
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioBeat;   ///< Beat envelope, 0..1.
uniform float audioDownbeat;
uniform float audioBeatPhase;   ///< Position within the current beat, 0..1.
uniform float audioOnset;      ///< percussive hits -> tiny chromatic shimmer

// Per-activation variety (re-rolled each activation; 0 = default):
uniform float breathAmtP;  ///< beat breath depth   (0 -> 0.030; 0.02 = subtle, 0.06 = deep)
uniform float waveAmtP;    ///< shock-wave strength (0 -> 0.012; 0.008 = faint, 0.03 = strong)
uniform float spinP;       ///< rotation speed      (0 -> 0.05; 0.02 = slow, 0.12 = lively)
uniform float chromaP;     ///< onset chroma split  (0 -> 0.0022; up to ~0.005)

/// @brief 2D rotation matrix.
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

vec4 frame(vec2 uv)
{
    return interpolation * texture(tex0, uv)
         + (1.0 - interpolation) * texture(tex1, uv);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 p = gl_FragCoord.xy / resolution;

    // Per-activation character (constant during the scene):
    float breathAmt = (breathAmtP <= 0.001)  ? 0.030  : breathAmtP;
    float waveAmt   = (waveAmtP   <= 0.001)  ? 0.012  : waveAmtP;
    float spinV     = (spinP      <= 0.001)  ? 0.05   : spinP;
    float chromaV   = (chromaP    <= 0.0001) ? 0.0022 : chromaP;

    // Centre the coordinate for the zoom/rotation, aspect-corrected.
    vec2 c = p - 0.5;
    c.x *= resolution.x / resolution.y;

    float r = length(c);

    // Beat breath: zoom in slightly on the beat (deeper on the downbeat).
    float breath = breathAmt * audioBeat + 0.5 * breathAmt * audioDownbeat;
    c /= (1.0 + breath);

    // Radial shock-wave riding the continuous beat phase: a faint expanding
    // ripple that displaces the sampling radius as it passes.
    float wR   = audioBeatPhase * 1.2;
    float wave = exp(-pow((r - wR) * 10.0, 2.0)) * audioBeat;
    c *= 1.0 + waveAmt * wave;

    // Slow continuous rotation.
    c = rot(audioPhase * spinV) * c;

    c.x /= resolution.x / resolution.y;
    vec2 uv = c + 0.5;

    // Onset chroma shimmer: R and B sample at slightly different radii while a
    // hit rings (slew-limited upstream -> a soft glassy fringe, no strobe).
    float split = chromaV * audioOnset;
    vec2  dir   = (uv - 0.5);
    vec4  colG  = frame(uv);
    vec4  colR  = frame(uv + dir * split);
    vec4  colB  = frame(uv - dir * split);
    fragColor = vec4(colR.r, colG.g, colB.b, colG.a);
}
