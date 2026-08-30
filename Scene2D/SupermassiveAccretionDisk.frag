#version 330 core
out vec4 fragColor;
/**
 * @file SupermassiveAccretionDisk.frag
 * @brief SUPERMASSIVE ACCRETION DISK: Raymarched Kerr rotating black hole with extreme
 * gravitational frame-dragging, Doppler-boosted photon sphere, relativistic
 * polar plasma jets, and gravitational lensing warping background starfields & photos.
 *   audioSubBass -> expands ergosphere & singularity gravitational lens ring
 *   audioKick    -> ignites explosive polar relativistic jet bursts
 *   audioHigh    -> sparks synchrotron radiation in accretion disk
 *   audioSwell   -> increases accretion disk thermal radiance & swirl
 *
 * Per-activation variety:
 *   spinP    float black hole angular momentum spin factor (0.5..1.8)
 *   diskP    float accretion disk radius / density         (0.6..1.8)
 *   jetP     float relativistic polar jet intensity        (0.5..2.2)
 *   hueP     float Doppler spectrum color shift            (0..6.28)
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

uniform float spinP;
uniform float diskP;
uniform float jetP;
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

float hash21(vec2 p) {
    p = fract(p * vec2(371.89, 493.12));
    p += dot(p, p + 59.23);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
    float spn = (spinP > 0.0) ? spinP : 1.0;
    float dsk = (diskP > 0.0) ? diskP : 1.0;
    float jt  = (jetP  > 0.0) ? jetP  : 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float r = length(uv);
    float a = atan(uv.y, uv.x);

    float t = time * 0.3 * spn + audioAdvance * 0.15;

    // Kerr black hole parameters
    float rs = 0.22 * (1.0 + 0.3 * audioSubBass); // Event horizon radius
    float rErgo = rs * 1.6; // Ergosphere radius

    // Gravitational lensing curvature
    float deflection = rs / max(r - rs * 0.7, 0.015);
    vec2 lensUV = uv + (uv / max(r, 0.01)) * deflection * 0.12;

    // Camera tilt / view angle towards tilted accretion disk
    float tiltAngle = 0.35 + 0.1 * sin(t * 0.2);
    vec2 diskCoord = vec2(lensUV.x, lensUV.y / cos(tiltAngle));
    float diskR = length(diskCoord);
    float diskA = atan(diskCoord.y, diskCoord.x);

    // Accretion disk keplerian spiral coordinates
    float diskSpin = (8.0 / (diskR + 0.4)) * t;
    float spiralA = diskA - diskSpin;

    // Accretion disk temperature & gas density
    float innerR = rs * 1.8;
    float outerR = 1.4 * dsk;
    float diskMask = smoothstep(innerR, innerR + 0.08, diskR) * smoothstep(outerR, outerR - 0.3, diskR);

    float diskGas = noise(vec2(spiralA * 4.0, diskR * 12.0 - t * 2.0));
    float diskGas2 = noise(vec2(spiralA * 8.0 + t, diskR * 24.0));
    float gasDensity = (diskGas * 0.6 + diskGas2 * 0.4) * diskMask;

    // Relativistic Doppler Beaming: Approaching side (left) is blue-shifted & much brighter
    float beaming = clamp(1.0 - sin(diskA) * 0.75, 0.2, 2.5);
    vec3 dopplerCol = imgPalette(0.30 * clamp(beaming * 0.5, 0.0, 1.0)) * 1.5;
    dopplerCol = mix(dopplerCol, vec3(1.0, 0.9, 0.4), pow(gasDensity, 2.0));

    vec3 accretionCol = dopplerCol * gasDensity * beaming * 2.5 * (0.8 + audioSwell * 0.6);

    // Photon sphere bright glowing ring at 1.5 * rs
    float photonRingDist = abs(r - rs * 1.5);
    float photonRing = (0.003 / (photonRingDist * photonRingDist + 0.0002)) * (1.0 + audioKick * 2.0);
    vec3 ringCol = vec3(1.0, 0.9, 0.6) * photonRing;

    // Relativistic polar plasma jets shooting perpendicular to disk
    float jetDistX = abs(uv.x) / max(abs(uv.y), 0.05);
    float jetGlow = (0.008 * jt) / (jetDistX * jetDistX + 0.01) * exp(-abs(uv.y) * 0.3);
    jetGlow *= (0.5 + 0.5 * sin(uv.y * 30.0 - time * 15.0));
    vec3 jetCol = vec3(0.1, 0.7, 1.0) * jetGlow * (1.0 + audioKick * 3.0);

    // Gravitationally warped photo background
    vec2 photoUV = st + (uv / max(r, 0.01)) * deflection * 0.06 * (1.0 + audioBass);
    vec3 photo = img(clamp(photoUV, 0.0, 1.0));

    // Combine black hole visualizer
    vec3 col = photo * 0.35 + accretionCol + ringCol + jetCol;

    // Event horizon absolute darkness
    float horizonMask = smoothstep(rs * 0.95, rs * 1.05, r);
    col *= horizonMask;

    // High frequency synchrotron radiation sparks
    if (audioHigh > 0.4 && diskMask > 0.1) {
        float spark = hash21(floor(diskCoord * 60.0) + vec2(floor(time * 4.00), 5.0));
        if (spark > 0.96) {
            col += vec3(1.5, 1.2, 0.9) * audioHigh * 2.0;
        }
    }

    if (hue > 0.001) col = hueRot(col, hue);

    // Vignette
    vec2 vUV = st * (1.0 - st.yx);
    float vig = vUV.x * vUV.y * 15.0;
    col *= clamp(pow(vig, 0.25), 0.0, 1.0);

    fragColor = vec4(col, 1.0);
}
