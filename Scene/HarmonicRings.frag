#version 330 core
out vec4 fragColor;
// HarmonicRings.frag
// -----------------------------------------------------------------------
// 6 concentric Gaussian glow rings, one per frequency band.
// A visual spectrograph tuned for drone and dark ambient music:
// overtone structures, sub-bass rumble, and metallic harmonics all
// appear as distinct glowing rings against a near-black field.
//
// Band → ring radius mapping (inner to outer):
//   Ring 0  r≈0.10  subBass   (20-60 Hz)   – inner void-blue pulse
//   Ring 1  r≈0.24  bass      (60-150 Hz)  – drone fundamental
//   Ring 2  r≈0.41  lowMid    (150-500 Hz) – harmonic warmth
//   Ring 3  r≈0.60  mid       (0.5-2k Hz)  – melody / texture
//   Ring 4  r≈0.82  upperMid  (2k-6k Hz)   – metallic overtones
//   Ring 5  r≈1.10  high      (6k+ Hz)     – air shimmer (outer edge)
//
// Image is used as texture inside each ring (ring-arc UV sampling).
// Background remains dark – the image only appears where rings glow.
//
// Audio mapping:
//   audioSubBass  → Ring 0 width + brightness
//   audioLowMid   → Ring 2 width + brightness
//   audioUpperMid → Ring 4 width + brightness
//   audioLevel    → Rings 1, 3 (approximated bass and mid)
//   audioFlux     → Ring 5 (approximated high shimmer)
//   audioCentroid → Colour temperature gradient across all rings
//   audioBeat     → All rings briefly flare
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float speed;
uniform float power;
uniform int   rotate;

// Core audio uniforms
uniform float audioBeat;
uniform float audioBeatPhase;
uniform float audioKick;
uniform float audioDrop;
uniform float audioLevel;
uniform float audioFlip;
uniform float audioCentroid;
uniform float audioFlux;

// 6-band extras
uniform float audioSubBass;    // 20-60 Hz
uniform float audioLowMid;     // 150-500 Hz
uniform float audioUpperMid;   // 2k-6k Hz

// Integrated, jump-free audio rotation phase (computed once per frame on host)
uniform float audioPhase;

const float PI = 3.14159265358979;

// Gaussian glow ring intensity at radius r for a ring centred at ri.
// wBase: structural minimum half-width.
// energy: band energy 0..1, widens and brightens the ring.
float ringGlow(float r, float ri, float wBase, float energy)
{
    float w    = wBase + energy * 0.045;
    float diff = r - ri;
    return exp(-(diff * diff) / (w * w)) * (0.35 + energy * 1.65);
}

// Sample the image texture along the ring arc, offset per ring to avoid
// identical wrapping on all rings.
vec4 ringTex(float angle, float r, float ringIdx)
{
    float u = angle / (2.0 * PI) + ringIdx * 0.137;
    float v = fract(r * 0.45 + ringIdx * 0.073);
    return interpolation         * texture(tex0, vec2(u, v))
         + (1.0 - interpolation) * texture(tex1, vec2(u, v));
}

void main()
{
    // ---- Centred polar coordinates ----
    vec2 p;
    p.x = gl_FragCoord.x / resolution.y - 0.5 * resolution.x / resolution.y;
    p.y = gl_FragCoord.y / resolution.y - 0.5;
    p *= 2.5;

    float r = length(p);
    float a = atan(p.y, p.x);

    // SUBWOOFER MEMBRANE: the whole ring stack pumps in and out with the
    // bass like a speaker cone (centre-weighted, so the middle excursions
    // are biggest) — the picture IS the driver making the sound.
    r /= 1.0 + 0.30 * (audioSubBass + 0.6 * audioKick) * exp(-r * 0.8);

    // Slowly rotating angle: smooth base drift + jump-free integrated audio phase
    float at = a + time * speed + audioPhase * 0.35;

    // ---- Derived band approximations ----
    // We have: audioSubBass, audioLowMid, audioUpperMid, audioLevel, audioFlux
    // We approximate missing bands from these:
    //   bass    ≈ audioLevel boosted, minus sub-bass leakage
    //   mid     ≈ audioLevel balanced, minus low-mid leakage
    //   high    ≈ audioFlux (high transients drive flux) + upperMid residual
    float eBass = clamp(audioLevel * 1.5 - audioSubBass * 0.5,   0.0, 1.0);
    float eMid  = clamp(audioLevel * 1.3 - audioLowMid  * 0.35,  0.0, 1.0);
    float eHigh = clamp(audioFlux  * 0.65 + audioUpperMid * 0.25, 0.0, 1.0);

    // ---- Colour temperature helper ----
    // Each ring gets a tint: inner (low freq) = void-blue, outer (high) = air-white.
    // audioCentroid shifts the entire palette warmer or cooler.
    // ringPos in [0,1] is the ring's position from inner to outer.
    // Returns a multiplicative RGB tint.
    // (Defined inline below since GLSL 1.20 has no nested function calls before declaration)

    // ---- Accumulate all 6 rings ----
    vec3  accColor = vec3(0.0);
    float accAlpha = 0.0;

    // Ring 0 – Sub-bass (20-60 Hz) ----------------------------------------
    {
        float e  = audioSubBass;
        float g  = ringGlow(r, 0.10, 0.007, e);
        vec4  tc = ringTex(at, r, 0.0);
        float rp = 0.0;  // ring position 0=inner
        vec3  cold = vec3(0.40, 0.50, 1.00);
        vec3  warm = vec3(0.70, 0.50, 0.80);
        vec3  tint = mix(cold, warm, mix(rp, audioCentroid, 0.25));
        accColor += tc.rgb * tint * g;
        accAlpha += g;
    }

    // Ring 1 – Bass (60-150 Hz) -------------------------------------------
    {
        float e  = eBass;
        float g  = ringGlow(r, 0.24, 0.009, e);
        vec4  tc = ringTex(at, r, 1.0);
        float rp = 0.2;
        vec3  cold = vec3(0.50, 0.55, 1.00);
        vec3  warm = vec3(0.80, 0.65, 0.85);
        vec3  tint = mix(cold, warm, mix(rp, audioCentroid, 0.35));
        accColor += tc.rgb * tint * g;
        accAlpha += g;
    }

    // Ring 2 – Low-mid (150-500 Hz) ---------------------------------------
    {
        float e  = audioLowMid;
        float g  = ringGlow(r, 0.41, 0.010, e);
        vec4  tc = ringTex(at, r, 2.0);
        float rp = 0.4;
        vec3  cold = vec3(0.60, 0.60, 0.90);
        vec3  warm = vec3(0.95, 0.78, 0.55);
        vec3  tint = mix(cold, warm, mix(rp, audioCentroid, 0.45));
        accColor += tc.rgb * tint * g;
        accAlpha += g;
    }

    // Ring 3 – Mid (500-2k Hz) --------------------------------------------
    {
        float e  = eMid;
        float g  = ringGlow(r, 0.60, 0.011, e);
        vec4  tc = ringTex(at, r, 3.0);
        float rp = 0.6;
        vec3  cold = vec3(0.65, 0.65, 0.80);
        vec3  warm = vec3(1.05, 0.88, 0.55);
        vec3  tint = mix(cold, warm, mix(rp, audioCentroid, 0.55));
        accColor += tc.rgb * tint * g;
        accAlpha += g;
    }

    // Ring 4 – Upper-mid (2k-6k Hz) – metallic / industrial ---------------
    {
        float e  = audioUpperMid;
        float g  = ringGlow(r, 0.82, 0.009, e);
        vec4  tc = ringTex(at, r, 4.0);
        float rp = 0.8;
        vec3  cold = vec3(0.70, 0.70, 0.72);
        vec3  warm = vec3(1.10, 0.95, 0.60);
        vec3  tint = mix(cold, warm, mix(rp, audioCentroid, 0.65));
        accColor += tc.rgb * tint * g;
        accAlpha += g;
    }

    // Ring 5 – High (6k+ Hz) – air shimmer, outermost ---------------------
    {
        float e  = eHigh;
        float g  = ringGlow(r, 1.10, 0.008, e);
        vec4  tc = ringTex(at, r, 5.0);
        float rp = 1.0;
        vec3  cold = vec3(0.70, 0.82, 1.10);
        vec3  warm = vec3(1.05, 0.98, 0.88);
        vec3  tint = mix(cold, warm, mix(rp, audioCentroid, 0.50));
        accColor += tc.rgb * tint * g;
        accAlpha += g;
    }

    // ---- KICK SHOCKWAVE: a bright ring EXPANDS from the centre through
    // the whole stack once per beat (radius rides beatPhase, brightness the
    // kick) — the stack stops being static wallpaper and starts drumming.
    {
        float shockR = audioBeatPhase * 1.35;
        float shock  = exp(-abs(r - shockR) * 22.0)
                     * audioKick * (1.0 - audioBeatPhase * 0.6);
        vec3 sc = mix(vec3(1.0, 0.85, 0.55), vec3(0.6, 0.8, 1.0), audioCentroid);
        accColor += sc * shock * 1.6;
        accAlpha += shock;
    }

    // ---- Global modulation ----
    accColor *= (1.0
               + audioBeat  * 0.25   // rings flare on beat (slew-limited host-side)
               + audioFlux  * 0.10   // shimmer as spectrum evolves
               + audioLevel * 0.20   // gentle overall breathing
               + audioDrop  * 0.9);  // a drop lights the whole stack

    fragColor = clamp(vec4(accColor, accAlpha), 0.0, 1.0);
}
