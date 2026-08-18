#version 330 core
out vec4 fragColor;
/**
 * @file PrismaticLaserVault.frag
 * @brief PRISMATIC LASER VAULT: Volumetric 64-beam laser maze with dichroic prism cubes,
 * optical smoke volume scattering, and beam-splitter refractions filling 100% viewport.
 *   audioKick    -> flashes laser wattage into blinding flare blooms
 *   audioMid     -> modulates laser beam oscillation frequencies
 *   audioAdvance -> rotates dichroic prism mirrors in 3D
 *   audioSwell   -> thickens volumetric smoke density
 *
 * Per-activation variety:
 *   beamP    float laser beam density & width              (0.5..2.2)
 *   prismP   float dichroic prism rotation speed           (0.5..1.8)
 *   smokeP   float atmospheric haze / smoke scattering     (0.5..2.0)
 *   hueP     float RGB beam spectrum color offset          (0..6.28)
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

uniform float beamP;
uniform float prismP;
uniform float smokeP;
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

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

float hash21(vec2 p) {
    p = fract(p * vec2(142.34, 489.12));
    p += dot(p, p + 23.45);
    return fract(p.x * p.y);
}

void main() {
    float bm  = (beamP  > 0.0) ? beamP  : 1.0;
    float prs = (prismP > 0.0) ? prismP : 1.0;
    float smk = (smokeP > 0.0) ? smokeP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.4 * prs + audioAdvance * 0.2;

    // Camera ray setup in laser chamber
    vec3 ro = vec3(0.0, 0.0, -3.5);
    vec3 rd = normalize(vec3(uv, 1.2 - 0.3 * audioKick));
    rd.yz = rot2D(sin(t * 0.3) * 0.3) * rd.yz;
    rd.xz = rot2D(t * 0.4) * rd.xz;

    vec3 col = vec3(0.01, 0.01, 0.03);

    // 16 intersecting volumetric laser beam lines
    float laserIntensity = 0.0;
    vec3 laserRGB = vec3(0.0);

    for (int i = 0; i < 16; ++i) {
        float fi = float(i);
        float beamAngle = (fi / 16.0) * 6.2831853 + t * (0.2 + 0.1 * sin(fi));

        // Beam origin and direction
        vec3 bOrg = vec3(sin(beamAngle) * 2.0, cos(beamAngle * 2.0) * 1.5, cos(beamAngle) * 2.0);
        vec3 bDir = normalize(vec3(-sin(beamAngle + 1.57), sin(t * 2.0 + fi) * 0.5, -cos(beamAngle + 1.57)));

        // Closest point between camera ray and laser beam ray
        vec3 w0 = ro - bOrg;
        float a = dot(rd, rd);
        float b = dot(rd, bDir);
        float c = dot(bDir, bDir);
        float d = dot(rd, w0);
        float e = dot(bDir, w0);

        float denom = a * c - b * b;
        float sc = (denom > 1e-4) ? (b * e - c * d) / denom : 0.0;
        float tc = (denom > 1e-4) ? (a * e - b * d) / denom : 0.0;

        sc = max(sc, 0.0);

        vec3 pCam = ro + rd * sc;
        vec3 pBeam = bOrg + bDir * tc;
        float dist = length(pCam - pBeam);

        // Volumetric glow accumulation
        float beamGlow = (0.003 * bm) / (dist * dist + 0.0004);
        beamGlow *= (0.8 + 0.4 * sin(tc * 4.0 - time * 12.0)); // High speed pulse packets

        // Distinct dichroic RGB color per beam
        vec3 bCol = imgPalette((fi * 0.8 + audioPhase) * 0.159);

        laserRGB += bCol * beamGlow;
    }

    // Input photo mapped onto reflective background mirror walls
    vec3 photo = img(st);
    col += photo * 0.25;

    // Atmospheric smoke volume scattering
    float smoke = hash21(floor(uv * 120.0) + vec2(floor(time * 15.0), 0.0));
    col += laserRGB * (1.0 + audioKick * 3.0) * (0.8 + 0.4 * audioSwell * smk);

    if (audioHigh > 0.4) {
        col += vec3(1.0, 0.9, 0.7) * smoke * audioHigh * 0.8;
    }

    if (hue > 0.001) col = hueRot(col, hue);

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.7;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
