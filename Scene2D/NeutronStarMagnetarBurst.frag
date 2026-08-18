#version 330 core
out vec4 fragColor;
/**
 * @file NeutronStarMagnetarBurst.frag
 * @brief NEUTRON STAR MAGNETAR BURST: 100% viewport-filling extreme close-up of
 * a hyper-magnetic neutron star (10^15 Gauss). Starquake crust fault fractures,
 * blinding Cherenkov radiation bursts, relativistic pair-plasma fountains,
 * twisted dipolar magnetic flux tubes, and gravitational synchrotron lensing.
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
uniform float audioSpectrum[32];

uniform float magnetP;
uniform float burstP;
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

float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

// Voronoi crust fracture plates
float crustFracture(vec2 p, out vec2 cellCenter) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float m = 8.0;
    vec2 mCenter = vec2(0.0);
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = vec2(hash21(n + g), hash21(n + g + vec2(13.1, 7.3)));
            vec2 r = g + o - f;
            float d = dot(r, r);
            if (d < m) {
                m = d;
                mCenter = n + g + o;
            }
        }
    }
    cellCenter = mCenter;
    return sqrt(m);
}

void main() {
    float mag = (magnetP > 0.0) ? magnetP : 1.0;
    float brs = (burstP  > 0.0) ? burstP  : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Curved horizon & curved magnetic field lines
    float r = length(uv);
    float angle = atan(uv.y, uv.x);

    // Dynamic magnetic flux twist
    float t = time * 0.3 * spd + audioAdvance * 0.15;
    vec2 warpedUV = uv * (1.8 + 0.4 * sin(t * 0.5));
    
    // Magnetic dipole field line curvature
    float bDipole = (warpedUV.x * warpedUV.x - 2.0 * warpedUV.y * warpedUV.y) / pow(r + 0.1, 2.5);
    warpedUV += vec2(-warpedUV.y, warpedUV.x) * (bDipole * 0.08 * mag);

    // Crust fracture plate simulation
    vec2 cellCenter;
    float fractureDist = crustFracture(warpedUV * 4.5, cellCenter);
    float faultLine = smoothstep(0.08, 0.0, fractureDist);

    // Starquake pulse triggered by audioKick & low bass
    float starquake = sin(length(warpedUV) * 15.0 - time * 8.0);
    float quakeFlash = exp(-abs(starquake) * 5.0) * (audioKick * 2.5 + audioSubBass * 1.5) * brs;

    // Relativistic magnetic flux loops (arching over the crust)
    float loopY = sin(warpedUV.x * 6.0 + t * 2.0) * cos(warpedUV.y * 4.0 - t);
    float fluxTube = exp(-abs(loopY) * 15.0) * (0.8 + 0.8 * audioHigh);

    // Photo projection on neutron crust plates
    vec2 crustUV = cellCenter * 0.15 + warpedUV * 0.3;
    vec3 photoCrust = img(fract(crustUV));

    // Neutron star crust colors: Ultra-dense metallic chrome + glowing mantle faults
    vec3 crustBase = palTint(mix(vec3(0.05, 0.06, 0.09), vec3(0.12, 0.15, 0.22), photoCrust.r), 0.40 * photoCrust.r, 0.20);
    
    // Glowing fault lines: Blinding blue-white Cherenkov radiation + ultra-hot cyan
    vec3 cherenkovCol = vec3(0.3, 0.7, 1.0) * 2.5 + vec3(1.0) * 1.5;
    vec3 pairPlasmaCol = vec3(1.0, 0.2, 0.7) * 2.0;

    vec3 col = crustBase * (1.0 - faultLine * 0.8) + photoCrust * 0.4;
    col += cherenkovCol * faultLine * (1.2 + 2.0 * quakeFlash);
    col += mix(cherenkovCol, pairPlasmaCol, sin(t + bDipole) * 0.5 + 0.5) * fluxTube * mag;

    // Relativistic gamma-ray burst shockwave covering 100% of viewport
    float shockRing = exp(-abs(r - fract(time * 0.6) * 1.6) * 8.0) * audioKick * 2.0;
    col += vec3(0.9, 0.95, 1.0) * shockRing;

    // Polar magnetic beacon synchrotron sweep
    float beacon = pow(max(sin(angle * 2.0 + t * 4.0), 0.0), 12.0) * (0.5 + 1.5 * audioMid);
    col += vec3(0.4, 0.8, 1.0) * beacon * (0.8 + 0.5 * audioLevel);

    col = hueRot(col, hue);   // chromaHue handled inside imgPalette
    col = pow(col, vec3(0.85)); // Contrast boost
    col += vec3(0.03, 0.02, 0.06) * audioSwell;

    fragColor = vec4(col, 1.0);
}
