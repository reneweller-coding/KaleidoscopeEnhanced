#version 330 core
out vec4 fragColor;
/**
 * @file AizawaAttractorSphereVortex.frag
 * @brief AIZAWA ATTRACTOR SPHERE VORTEX: 3D Aizawa attractor forming a rotating spherical
 * shell with a penetrating central plasma vortex tube and celestial Saturn rings.
 * High-velocity chaotic flow, glowing orbital particle swarms, and phase flares.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous integration of Aizawa attractor vortex
 *   audioKick    -> flashes central axial vortex funnel & triggers ring pulse
 *   audioCentroid-> sharpens orbital trajectory lines & sphere shell resolution
 *   audioSubBass -> expands spherical attractor breathing radius
 *   audioChromaHue-> rotates the luminous celestial sphere spectrum
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

// Per-activation variety
uniform float speedP;
uniform float sphereRadP;
uniform float vortexP;
uniform float glowP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t) {
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

// Overall level of the photo currently bound, from a fixed 5-tap grid. The
// celestial base is entirely photo-derived and the library spans near-black
// to near-white; a bright photo left the shell and funnel flares no headroom.
// The probe rides the tex0/tex1 crossfade so the gain can never pop, and one
// number for the whole frame rescales exposure without touching contrast.
float photoLevel() {
    vec3 s = img(vec2(0.25, 0.25)) + img(vec2(0.75, 0.25))
           + img(vec2(0.25, 0.75)) + img(vec2(0.75, 0.75))
           + img(vec2(0.50, 0.50));
    return dot(s * 0.2, vec3(0.299, 0.587, 0.114));
}

// Aizawa system parameters: a=0.95, b=0.7, c=0.6, d=3.5, e=0.25, f=0.1
const float AIZ_A = 0.95, AIZ_B = 0.7, AIZ_C = 0.6, AIZ_D = 3.5, AIZ_E = 0.25, AIZ_F = 0.1;

vec3 aizawaDeriv(vec3 q) {
    float r2xy = q.x * q.x + q.y * q.y;
    return vec3(
        (q.z - AIZ_B) * q.x - AIZ_D * q.y,
        AIZ_D * q.x + (q.z - AIZ_B) * q.y,
        AIZ_C + AIZ_A * q.z - (q.z * q.z * q.z) / 3.0
              - r2xy * (1.0 + AIZ_E * q.z) + AIZ_F * q.z * (q.x * q.x * q.x));
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    // Sub-bass swells the shell's apparent radius. Applied to the view scale
    // (a static per-frame shape factor), never to anything multiplied by time.
    float sRad = ((sphereRadP > 0.01) ? sphereRadP : 1.0) * (1.0 + 0.35 * audioSubBass);
    float vrtx = (vortexP > 0.01) ? vortexP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.3 * spd;

    // 3D Orbital rotation of screen plane. The window is sized so the traced
    // attractor (|xy| reaches ~1.3) fills the frame height instead of sitting
    // as a small motif on a large dead field.
    float rotA = t * 0.2 + audioPhase * 0.1;
    float cs = cos(rotA), sn = sin(rotA);
    vec2 pRot = mat2(cs, -sn, sn, cs) * uv * (3.2 / sRad);

    // Multi-step numerical RK2 integration along Aizawa sphere attractor.
    // Seeded from a FIXED point shared by every pixel -- not the pixel's own
    // position -- so the traced curve is one real spatial trajectory instead
    // of every pixel trivially starting AT distance zero from itself (which
    // washed the whole frame out to a near-uniform glow).
    vec3 pAiz = vec3(0.1, 0.05, 0.5 + 0.3 * sin(t * 0.4));
    float minDist = 1e5;
    float vortexEnergy = 0.0;

    // Clamped so no preset value of vortexP can push the step past the point
    // where the d=3.5 rotation term stops integrating cleanly.
    float dt = clamp(0.07 * vrtx, 0.04, 0.095);

    for (int i = 0; i < 72; i++) {
        // Midpoint RK2. The loop previously ran plain Euler over 28 steps of
        // dt=0.018 -- 0.5 time units total, far short of the transient, so the
        // "sphere shell" never left the seed's immediate neighbourhood: it was
        // a pinhead blob at the origin surrounded by dead field. Euler also
        // pumps radius into the d=3.5 rotation term, so simply integrating
        // longer would have blown the orbit up; RK2's error is O(dt^3) per
        // step, which keeps the traced curve on the real attractor.
        vec3 k1 = aizawaDeriv(pAiz);
        vec3 k2 = aizawaDeriv(pAiz + k1 * (dt * 0.5));
        pAiz += k2 * dt;

        float dDist = length(pRot - pAiz.xy);
        minDist = min(minDist, dDist);

        // Core axial tornado energy
        if (abs(pAiz.x) < 0.3 && abs(pAiz.y) < 0.3) {
            vortexEnergy += exp(-dDist * 8.0);
        }
    }

    // One un-normalised exp() per near-axis step, with a falloff so shallow it
    // still read 0.05 a full unit away: with the whole orbit parked on the
    // axis every step qualified, the sum reached ~28 and the tinted vector hit
    // ~48 at the centre -- the white flood that ate the frame. Normalise by
    // the step budget and cap so the funnel stays a core, not a haze.
    vortexEnergy = clamp(vortexEnergy * 0.09, 0.0, 1.1);

    // Sample distorted background photo
    vec2 sampleUV = fract(pRot * 0.2 + 0.5);
    vec3 texCol = img(sampleUV);

    // Glowing trajectory ribbon lines. The old 4.5 falloff still returned 0.1
    // a half-unit off the curve, so the "ribbons" were a broad soft haze with
    // no edge anywhere; a tighter exponent turns them back into lines.
    float lineGlow = exp(-minDist * (11.0 + 6.0 * audioCentroid)) * glw;

    // Palette mixing across Aizawa sphere
    float phase = atan(pRot.y, pRot.x) / 6.2831853 + length(pRot) * 0.15;
    vec3 palA = imgPalette(phase + t * 0.05);
    vec3 palB = imgPalette(phase + 0.5);
    vec3 col = mix(palA, palB, 0.5 + 0.5 * sin(vortexEnergy * 0.5));

    col = mix(col, texCol, 0.35 + 0.15 * audioValence);

    // Hold the celestial backdrop to a fixed dark level so the shell and the
    // funnel are what carries the light, whatever photo happens to be bound.
    col *= clamp(0.20 / max(0.05, photoLevel()), 0.20, 2.4);

    // Add glowing spherical shell and central tornado flares. Both tint
    // constants exceed 1.0 per channel, so the TINTED vectors are capped --
    // capping the scalars alone still let the colour run past white.
    vec3 sphereTint = min(vec3(1.3, 1.1, 1.8) * lineGlow * (1.0 + 2.5 * audioKick), vec3(1.2));
    vec3 tornadoTint = min(vec3(1.7, 1.4, 0.5) * vortexEnergy * (1.0 + 3.0 * audioKick), vec3(1.4));
    col += sphereTint + tornadoTint;

    col = pow(col, vec3(0.88));
    vec3 _catTone = clamp(col, 0.0, 1.0);
    _catTone /= 1.0 + 0.32 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
