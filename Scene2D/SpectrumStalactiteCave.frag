#version 330 core
out vec4 fragColor;
/**
 * @file SpectrumStalactiteCave.frag
 * @brief SPECTRUM STALACTITE CAVE: a limestone cave whose stalactites hang
 * one per spectral band across the ceiling, the bass bands the thickest
 * and longest.  Each band's energy lights its stalactite from within
 * (calcite glow) and lets it drip: drops form at the tip and fall as round
 * beads on a continuous clock, brighter on onsets.  Below, a still pool
 * mirrors it all in the photo's colours.  The camera never moves.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> stalactite glow and drip rate (light)
 *   audioOnset        -> drops flash (light)
 *   sceneAdvance      -> drip fall (continuous)
 *   audioSwell        -> torchlight (slow)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: lengthP, poolP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioOnset;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float lengthP;
uniform float poolP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float lengthScale = 0.5 + 0.5 * clamp(lengthP, 0.0, 1.0);
    float poolY = -0.28 - 0.1 * clamp(poolP, 0.0, 1.0);
    float torch = 0.5 + 0.7 * clamp(audioSwell, 0.0, 1.0);

    // Mirror the lower part in the pool (with a ripple).
    float inPool = step(p.y, poolY);
    vec2 q = p;
    if (inPool > 0.5)
    {
        float rip = 0.006 * sin(p.x * 40.0 + sceneAdvance * 2.0) + 0.004 * sin(p.x * 23.0 - sceneAdvance * 1.3);
        q.y = 2.0 * poolY - p.y + rip;
    }

    // Cave wall: the photo as wet limestone, dark, torch-lit from below.
    vec3 wall = img(vec2(q.x / aspect + 0.5, q.y + 0.5)) * mix(vec3(0.35), imgPalette(hue * 0.159 + 0.55) * 0.6, 0.5);
    wall *= (0.3 + 0.7 * exp(-abs(q.y - poolY) * 2.0)) * torch;
    vec3 col = wall;

    // Stalactites: 32 across the ceiling, band k at x_k; length and
    // thickness from the band index (bass longest); the band energy lights
    // it from within and sets its drip.
    float ceiling = 0.5;
    for (int k = 0; k < 32; ++k)
    {
        float fk = float(k);
        float e = clamp(audioSpectrum[k] * 1.6, 0.0, 1.0);
        float x = (fk + 0.5) / 32.0 * aspect - aspect * 0.5 + (hash11(fk * 3.3) - 0.5) * 0.02;
        float len = (0.25 + 0.45 * (1.0 - fk / 32.0) * lengthScale) * (0.8 + 0.4 * hash11(fk * 5.1));
        float thick = 0.012 + 0.02 * (1.0 - fk / 32.0);
        float tipY = ceiling - len;
        float dy = ceiling - q.y;                          // distance down from the ceiling
        float half_w = thick * (1.0 - clamp(dy / len, 0.0, 1.0)) * (1.0 + 0.2 * noise2(vec2(fk, dy * 20.0)));
        float dx = abs(q.x - x);
        float inside = step(dx, half_w) * step(q.y, ceiling) * step(tipY, q.y);
        if (inside > 0.5)
        {
            float nx = dx / max(half_w, 1e-3);
            float shade = 0.4 + 0.6 * sqrt(max(1.0 - nx * nx, 0.0));
            vec3 calc = mix(vec3(0.85, 0.8, 0.7), imgPalette(hue * 0.159 + fk / 32.0), 0.35);
            vec3 st = calc * shade * (0.35 + 0.4 * torch);
            st += imgPalette(hue * 0.159 + fk / 32.0) * e * 1.2 * shade;    // the glow from within
            col = st;
        }
        // Drips: a round bead forming at the tip and falling on the clock
        // (rate 1..3 per period scaled by the band energy as amplitude of
        // brightness, never of the clock).
        float dripClock = sceneAdvance * (0.6 + 0.3 * hash11(fk * 7.7)) + sceneTime * 0.1 + hash11(fk * 9.1);
        float ph = fract(dripClock);
        float dropY = tipY - ph * ph * (tipY - poolY + 0.02);
        float dd = length(vec2(q.x - x, q.y - dropY) * vec2(1.0, 0.8));
        float bead = smoothstep(0.012, 0.004, dd) * step(q.y, tipY + 0.01);
        float onset = clamp(audioOnset, 0.0, 1.0);
        col += mix(vec3(0.7, 0.85, 1.0), imgPalette(hue * 0.159 + fk / 32.0), 0.4) * bead * (0.3 + 0.9 * e + 0.8 * onset);
        // Splash rings on the pool surface where the drop lands.
        float ring = exp(-abs(length(vec2((p.x - x) * 1.0, (p.y - poolY) * 4.0)) - ph * 0.12) * 60.0) * (1.0 - ph) * step(0.85, ph + 0.15) * inPool;
        col += vec3(0.6, 0.75, 0.9) * ring * 0.25 * (0.3 + e);
    }
    // The pool: darker, bluer, the reflection dimmed.
    col = mix(col, col * vec3(0.5, 0.65, 0.85) * 0.7 + imgPalette(hue * 0.159 + 0.6) * 0.05, inPool);
    // Torch glow near the pool line.
    col += imgPalette(hue * 0.159 + 0.1) * exp(-abs(p.y - poolY) * 6.0) * 0.12 * torch;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
