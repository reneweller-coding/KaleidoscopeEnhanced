#version 330 core
out vec4 fragColor;
/**
 * @file Datamosh.frag
 * @brief Datamosh glitch: RGB-split, stuttering block-shifted 'corrupted
 * P-frame' look, most intense mid-fade.
 *
 * Scene TRANSITION shader (Transitions/): blends the outgoing scene
 * (tex0) into the incoming one (tex1) over one cross-fade.
 * interpolation: 1 = old scene fully visible .. 0 = new scene.
 * Extracted from the former FxPlain.frag 28-style library.
 */
uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioBeat;    // engine beat pulse: the wipe surges with the music
uniform float audioLevel;   // AGC-smoothed loudness: deepens the mid-transition effect


const float PI = 3.14159265358979;

float hashT(vec2 p2)
{
    return fract(sin(dot(p2, vec2(127.1, 311.7))) * 43758.5453);
}

void main()
{
    vec2  p   = gl_FragCoord.xy / resolution;
    float d   = 1.0 - interpolation;          // transition progress 0..1
    // Beat surge, endpoint-safe: sin(PI*d) is 0 at d=0 and d=1,
    // so the contract (exact A at 0, exact B at 1) cannot break.
    d = clamp(d + 0.05 * sin(PI * d) * audioBeat, 0.0, 1.0);
    float mid = sin(PI * d);                  // 0 at both ends, 1 mid-transition
    mid *= 1.0 + 0.35 * audioLevel;   // loud music deepens the effect

    // Stutter clock: block offsets HOLD for a few frames, then jump - a
    // continuous animation would read as a wave, not a corrupted codec.
    // Everything is gated by `mid` (0 at both ends) so identity holds
    // exactly at d=0/d=1 regardless of the (time-based) stutter phase.
    float glitchT = floor(time * 8.0);
    float rowH    = 1.0 / (18.0 + 14.0 * hashT(vec2(glitchT, 0.7)));
    float row     = floor(p.y / rowH);
    float rn      = hashT(vec2(row, glitchT));

    // `active` is a RESERVED word in the GLSL spec, like `half` -- NVIDIA
    // accepts it as an identifier, a conformant compiler need not.
    float onRow  = step(0.55, rn) * mid;
    float shift  = (hashT(vec2(row, glitchT + 3.1)) - 0.5) * 0.12 * onRow;

    vec2 pr = clamp(vec2(p.x + shift,        p.y), 0.0, 1.0);
    vec2 pg = clamp(vec2(p.x + shift * 0.4,  p.y), 0.0, 1.0);
    vec2 pb = clamp(vec2(p.x - shift * 0.7,  p.y), 0.0, 1.0);

    // A handful of blocks briefly "stick" on the old frame even as the
    // fade progresses - the classic moshed P-frame smear.
    float stuck  = step(0.93, hashT(vec2(row, glitchT + 7.0))) * mid;
    float wLocal = mix(d, d * 0.15, stuck);

    float rC = mix(texture(tex0, pr).r, texture(tex1, pr).r, wLocal);
    float gC = mix(texture(tex0, pg).g, texture(tex1, pg).g, wLocal);
    float bC = mix(texture(tex0, pb).b, texture(tex1, pb).b, wLocal);
    fragColor = vec4(rC, gC, bC, 1.0);
}
