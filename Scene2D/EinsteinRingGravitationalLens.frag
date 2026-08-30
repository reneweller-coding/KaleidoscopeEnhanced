#version 330 core
out vec4 fragColor;
/**
 * @file EinsteinRingGravitationalLens.frag
 * @brief EINSTEIN RING GRAVITATIONAL LENS: Relativistic gravitational lensing around
 * a massive rotating dark-matter singularity. Background photo textures are
 * warped into Einstein rings, arc mirages, and multiple relativistic images
 * with Doppler frequency shifts and gravitational wave metric ripples.
 *   audioAdvance -> rotates relativistic accretion and frame dragging
 *   audioKick    -> fires gravitational metric compression shockwaves
 *   audioSubBass -> expands Einstein radius and event horizon shadow
 *   audioChromaHue-> shifts relativistic Doppler color grading
 *
 * Per-activation variety:
 *   lensP   float Einstein ring deflection strength (0.5..2.2)
 *   massP   float central singularity mass scale    (0.5..2.0)
 *   speedP  float orbital frame dragging velocity  (0.5..2.0)
 *   hueP    float base chromatic palette offset     (0..6.28)
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

uniform float lensP;
uniform float massP;
uniform float speedP;
uniform float hueP;

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

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

void main() {
    float lns = (lensP  > 0.0) ? lensP  : 1.0;
    float mss = (massP  > 0.0) ? massP  : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Lens center with slow gravitational drift
    vec2 lensCenter = vec2(sin(t * 0.4) * 0.18, cos(t * 0.3) * 0.12);
    vec2 rel = uv - lensCenter;
    float r = length(rel);
    float angle = atan(rel.y, rel.x);

    // Einstein radius with audio swell & mass
    float rEinstein = (0.32 + 0.12 * audioSwell + 0.08 * audioSubBass) * lns * sqrt(mss);
    // The frame is only 0.5 uv units tall from the centre: past ~0.42 the
    // luminous ring leaves the picture and the shadow disc below swallows
    // everything (the recording showed exactly that -- an 85%-black frame).
    rEinstein = min(rEinstein, 0.40);

    // Gravitational wave metric ripples on kick
    float gwRipple = sin(r * 35.0 - t * 8.0) * exp(-r * 3.0) * audioKick * 0.08;

    // Relativistic light deflection formula: alpha(r) = 4GM / r
    // Deflection angle theta_source = theta - rEinstein^2 / theta
    float deflFactor = (rEinstein * rEinstein) / max(r * r + 0.002, 0.001);
    vec2 warpedRel = rel * (1.0 - deflFactor) + rel * gwRipple;

    // Frame dragging swirl near the photon sphere
    float frameDrag = (0.25 * mss) / (r * r * r * 8.0 + 1.0);
    warpedRel = rot2D(frameDrag * (1.0 + audioBass * 1.5)) * warpedRel;

    // Reconstruct texture coordinate
    vec2 photoUV = (warpedRel * resolution.y + 0.5 * resolution) / resolution;
    // Langsame Hintergrund-Drift: das gelinste Feld zieht vorbei.
    photoUV += vec2(t * 0.03, t * 0.012);
    photoUV = fract(photoUV);

    vec3 photo = img(photoUV);

    // WANDERNDER QUASAR hinter der Linse: er laeuft im Orbit und wird durch
    // das GEWARPTE Feld gezeichnet -- die Linse zerlegt ihn in wandernde
    // Bogen und Mehrfachbilder.
    vec2 srcPos = vec2(sin(t * 0.23), cos(t * 0.31)) * 0.45;
    float srcD = length(warpedRel - srcPos);
    vec3 quasar = max(imgPalette(0.82), vec3(0.85, 0.75, 0.55))
                * exp(-srcD * srcD * 700.0) * (1.8 + 1.2 * audioSwell);

    // Einstein ring luminous photon ring glow
    float ringDist = abs(r - rEinstein);
    float ringGlow = exp(-ringDist * 45.0 / lns) * (1.2 + audioKick * 2.5 + audioMid);

    // Relativistic Doppler beaming across azimuthal angle
    float doppler = 1.0 + 0.45 * sin(angle + t * 2.0);
    vec3 dopplerColor = palTint(mix(vec3(0.1, 0.7, 1.0), vec3(1.0, 0.3, 0.1), clamp(doppler * 0.5, 0.0, 1.0)), 0.30 * clamp(doppler * 0.5, 0.0, 1.0), 0.22);

    // Event horizon shadow at the core
    float horizonR = min(rEinstein * 0.35 * mss, 0.14);
    float shadow = smoothstep(horizonR * 0.8, horizonR * 1.2, r);

    // Combine visualizer
    vec3 col = photo * (0.8 + 0.4 * audioLevel) * shadow;
    col += quasar * shadow;
    col += ringGlow * dopplerColor * (0.9 + audioHigh * 1.2);

    // Accretion disk inner ring glints
    float innerR = abs(r - horizonR * 1.4);
    float innerGlow = exp(-innerR * 30.0) * (audioSubBass * 1.8 + audioKick * 1.5);
    col += innerGlow * vec3(1.0, 0.85, 0.4);

    // Chroma rotation
    if (audioChromaHue != 0.0)     if (hue > 0.001) col = hueRot(col, hue);

    // Subtle edge vignette
    float vig = smoothstep(1.4, 0.4, length(uv));
    col *= vig;

    fragColor = vec4(col, 1.0);
}
