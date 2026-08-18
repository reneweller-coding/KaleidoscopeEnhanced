#version 330 core
out vec4 fragColor;
// StargateWormhole.frag
// -----------------------------------------------------------------------
// STARGATE WORMHOLE: Relativistic Einstein-Rosen bridge hyperspace tunnel.
// Gravitational light lensing around a central singularity, event horizon
// photon sphere, relativistic Doppler shifts, hyper-velocity star streaks,
// and explosive accretion corona bursts on audio transients.
//   audioAdvance -> accelerates warp tunnel velocity & streak velocity
//   audioSubBass -> expands gravitational lensing ring & singularity radius
//   audioKick    -> flashes relativistic shockwave accretion flares
//   audioHigh    -> sparks quantum particle emissions & blue Doppler shift
//
// Per-activation variety:
//   warpP     float hyperspace distortion scale        (0.5..2.2)
//   lensP     float gravitational lens curvature       (0.5..2.0)
//   speedP    float travel velocity multiplier         (0.5..1.8)
//   hueP      float Doppler color spectrum shift       (0..6.28)
// -----------------------------------------------------------------------

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

uniform float warpP;
uniform float lensP;
uniform float speedP;
uniform float hueP;
uniform float audioChromaHue;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


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


// House tint: bend a colour toward the photo palette while keeping its
// luminance -- the identity look survives, only the hue follows the photos.
vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float hash21(vec2 p) {
    p = fract(p * vec2(567.89, 789.01));
    p += dot(p, p + 89.12);
    return fract(p.x * p.y);
}

void main() {
    float wrp  = (warpP  > 0.0) ? warpP  : 1.0;
    float lns  = (lensP  > 0.0) ? lensP  : 1.0;
    float spd  = (speedP > 0.0) ? speedP : 1.0;
    float hue  = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float r = length(uv);
    float a = atan(uv.y, uv.x);

    // Relativistic gravitational light bending around event horizon
    float rs = 0.28 * lns * (1.0 + 0.3 * audioSubBass); // Schwarzschild radius
    float deflection = rs / max(r - rs * 0.5, 0.01);
    
    // Warped radius
    float warpedR = r + deflection * 0.15;
    
    // Hyper-velocity tunnel coordinate
    float camZ = time * 4.0 * spd + audioAdvance * 8.0;
    float tunnelZ = (1.0 / max(warpedR, 0.02)) * wrp + camZ;
    
    // Twisted spiral angle
    float spiralA = a + tunnelZ * 0.08 + sin(tunnelZ * 0.05) * 0.5 + audioPhase * 0.3;

    // Relativistic star streaks & hyperspace filament lattice
    vec2 grid = vec2(spiralA * (12.0 / 3.14159), tunnelZ * 0.5);
    vec2 gridId = floor(grid);
    vec2 gridF = fract(grid) - 0.5;

    float streakSeed = hash21(gridId);
    float streakMask = step(0.65, streakSeed);
    
    // Longitudinal streak stretch
    float streakDist = length(vec2(gridF.x, gridF.y * 0.15));
    float streakGlow = (0.006 / (streakDist * streakDist + 0.0008)) * streakMask;

    // Doppler Shift color spectrum: Blue-shift in center, Red-shift in periphery
    float doppler = clamp((1.0 - r) * 1.5 + audioAdvance * 0.5, 0.0, 2.0);
    vec3 dopplerCol = palTint(mix(vec3(1.0, 0.2, 0.1), vec3(0.1, 0.8, 1.0), doppler * 0.6), 0.30 * doppler, 0.22);
    dopplerCol = mix(dopplerCol, vec3(0.9, 0.4, 1.0), sin(tunnelZ * 0.2) * 0.5 + 0.5);

    vec3 col = dopplerCol * streakGlow * (0.8 + audioHigh * 1.2);

    // Accretion disk photon sphere ring
    float ringDist = abs(r - rs * 1.4);
    float photonRing = (0.004 / (ringDist * ringDist + 0.0003)) * (1.0 + audioKick * 2.0);
    vec3 ringCol = palTint(mix(vec3(1.0, 0.9, 0.4), vec3(0.2, 1.0, 0.8), sin(a * 4.0 + time * 3.0) * 0.5 + 0.5), 0.20, 0.22);
    col += ringCol * photonRing;

    // Gravitational lensing photo mapping
    vec2 lensUV = st + (uv / max(r, 0.01)) * deflection * 0.08 * (1.0 + audioBass);
    vec3 photo = img(clamp(lensUV, 0.0, 1.0));
    col += photo * (0.4 + 0.4 * audioLevel) * exp(-r * 0.6);

    // Event horizon singularity darkness
    float horizonMask = smoothstep(rs * 0.8, rs * 1.05, r);
    col *= horizonMask;

    // Relativistic warp pulse on heavy kicks
    if (audioKick > 0.65) {
        float pulse = exp(-abs(r - fract(time * 2.0)) * 6.0) * audioKick * 1.5;
        col += vec3(0.8, 0.95, 1.0) * pulse;
    }

    if (hue > 0.001) col = hueRot(col, hue);

    // Vignette
    vec2 vUV = st * (1.0 - st.yx);
    float vig = vUV.x * vUV.y * 15.0;
    col *= clamp(pow(vig, 0.25), 0.0, 1.0);

    fragColor = vec4(col, 1.0);
}
