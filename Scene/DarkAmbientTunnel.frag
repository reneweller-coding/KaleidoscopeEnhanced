#version 330 core
out vec4 fragColor;
// DarkAmbientTunnel.frag
// -----------------------------------------------------------------------
// Atmospheric void tunnel designed for dark ambient and drone music.
// (Christoph Heemann, Thomas Köner, Lustmord aesthetics)
//
// Audio mapping:
//   audioSubBass  → heavy vignette (darkness closing in from edges)
//   audioFlux     → forward motion (still on held drone, moves when layers change)
//   audioLowMid   → harmonic wave distortion along tunnel walls
//   audioCentroid → colour temperature: void-blue (dark) → deep amber (warm)
//   audioBeat     → subtle flash (only relevant in hybrid beat+ambient works)
//   audioLevel    → slow breathing luminance
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float speedTunnel;
uniform float speed;
uniform int   sides;
uniform float power;
uniform int   rotate;

// Core audio uniforms (uploaded by EffectShader::applyAudioFeatures)
uniform float audioBeat;       // decaying beat pulse 0..1
uniform float audioLevel;      // overall smoothed loudness 0..1
uniform float audioFlip;       // rotation direction +1 or -1
uniform float audioCentroid;   // tonal brightness 0=dark drone 1=bright shimmer
uniform float audioFlux;       // spectral change rate 0..1

// 6-band extras (only used by this shader; other shaders get -1 silently)
uniform float audioSubBass;    // 20-60 Hz  physical rumble / sub-bass weight
uniform float audioLowMid;     // 150-500 Hz harmonic warmth / pad body

// Integrated, jump-free audio motion (computed once per frame on the host)
uniform float audioPhase;      // audio rotation phase (radians)
uniform float audioAdvance;    // audio tunnel forward advance

const float PI = 3.14159265358979;

void main()
{
    // ---- Normalise to centred coordinates ----
    vec2 p;
    p.x = gl_FragCoord.x / resolution.y - 0.5 * resolution.x / resolution.y;
    p.y = gl_FragCoord.y / resolution.y - 0.5;
    p *= 4.0;

    // Optional rotation
    float angle = (rotate > 0) ? PI * 0.25 : 0.0;
    float ca = cos(angle);
    float sa = sin(angle);
    p = mat2(ca, -sa, sa, ca) * p;

    // ---- Polar coordinates with power-law metric ----
    float r = pow(pow(p.x * p.x, power) + pow(p.y * p.y, power),
                  1.0 / (2.0 * power));

    float a = atan(p.y, p.x);

    // ---- Kaleidoscope fold ----
    float sidesK = 0.5 * float(sides);
    float tau    = 1.047;
    a = mod(a, tau / sidesK);
    a = abs(a - tau / sidesK * 0.5);

    // Very slow rotation – dark ambient should barely drift.
    // Base drift stays smooth; audio adds a jump-free integrated phase.
    a += time * speed + audioPhase * 0.25;

    // ---- Tunnel UV ----
    // Forward motion = smooth base drift + integrated, flux-driven audio advance
    // (host integrates flux*loudness over dt, so it never jumps when flux moves).
    vec2 uv;
    uv.x = speedTunnel * time + audioAdvance + 0.1 / max(r, 0.001);
    uv.y = a / PI;

    // ---- Low-mid harmonic wave distortion ----
    // Slow lateral shimmer proportional to 150-500 Hz harmonic content.
    // Creates a sense of resonance and room mode.
    float warp = audioLowMid * 0.05 * sin(uv.x * 3.7 + time * 0.45);
    uv.y += warp;

    // ---- Texture sample ----
    vec4 col = interpolation         * texture(tex0, uv)
             + (1.0 - interpolation) * texture(tex1, uv);

    // ---- Spectral centroid: colour temperature ----
    // centroid = 0 → void-blue  (Thomas Köner / Lustmord sub-bass void)
    // centroid = 1 → deep amber (warmer drone / pitch-shifted pads)
    vec3 voidBlue  = vec3(0.55, 0.65, 1.08);
    vec3 deepAmber = vec3(1.12, 0.78, 0.42);
    col.rgb *= mix(voidBlue, deepAmber, audioCentroid);

    // ---- Sub-bass vignette ----
    // Darkness closes in from the screen edges as sub-bass energy rises.
    // At audioSubBass=0 there is minimal vignette (0.3×).
    // At audioSubBass=1 the vignette is maximal – the image retreats to a small
    // central window surrounded by absolute darkness.
    float dist     = length(p) * 0.25;           // 0 at centre, ~1 at corners
    float vigPower = 0.25 + audioSubBass * 0.75;  // 0.25 to 1.0
    float vignette = 1.0 - smoothstep(0.2, 1.1, dist * (vigPower + 0.05));
    col.rgb *= vignette;

    // ---- Luminance modulation ----
    // Keep all effects subtle – dark ambient should never feel "flashy".
    col.rgb *= (1.0
              + audioLevel * 0.25   // slow breathing with overall loudness
              + audioBeat  * 0.20   // subtle flash on beat (slew-limited host-side)
              + audioFlux  * 0.12); // shimmer when new drone layers enter

    fragColor = clamp(col, 0.0, 1.0);
}
