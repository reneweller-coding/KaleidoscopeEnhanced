#version 330 core
out vec4 fragColor;
/**
 * @file PulsarMagnetosphereJets.frag
 * @brief PULSAR MAGNETOSPHERE JETS: Rapidly spinning millisecond pulsar with twisted
 * dipole magnetic light cylinder, polar synchrotron radiation lighthouse beams
 * sweeping directly across viewport, and photo texture warping in magnetosphere.
 *   audioAdvance -> locks rotation velocity of the millisecond pulsar
 *   audioKick    -> flashes blinding lighthouse synchrotron beam pass
 *   audioSubBass -> expands pulsar magnetosphere Alfvén wave ripples
 *   audioHigh    -> sparks synchrotron gamma-ray flashes
 *
 * Per-activation variety:
 *   spinP    float pulsar rotation period multiplier       (0.5..2.2)
 *   beamP    float relativistic lighthouse beam intensity  (0.5..2.2)
 *   fieldP   float dipole magnetic field line density      (0.5..1.8)
 *   hueP     float synchrotron radiation hue offset        (0..6.28)
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
uniform float beamP;
uniform float fieldP;
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

void main() {
    float spn = (spinP  > 0.0) ? spinP  : 1.0;
    float bm  = (beamP  > 0.0) ? beamP  : 1.0;
    float fld = (fieldP > 0.0) ? fieldP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float r = length(uv);
    float a = atan(uv.y, uv.x);

    // Pulsar rotation angle
    float rotAngle = time * 3.0 * spn + audioAdvance * 0.8;

    // Relativistic polar lighthouse beam (sweeping across screen)
    vec2 beamDir1 = vec2(cos(rotAngle), sin(rotAngle));
    vec2 beamDir2 = -beamDir1;

    float dot1 = max(dot(normalize(uv), beamDir1), 0.0);
    float dot2 = max(dot(normalize(uv), beamDir2), 0.0);
    float beamPass = pow(max(dot1, dot2), 24.0) * bm * (1.0 + audioKick * 3.5);

    vec3 beamCol = imgPalette(0.25 * beamPass) * 1.4 * beamPass * 3.0;

    // Dipole magnetic field lines (r = R0 * sin^2(theta))
    float magTheta = a - rotAngle;
    float dipoleField = abs(r - 0.5 * pow(sin(magTheta * fld), 2.0));
    float fieldGlow = (0.002 / (dipoleField * dipoleField + 0.0003)) * (0.8 + 0.4 * audioSwell);
    vec3 fieldCol = vec3(0.8, 0.2, 1.0) * fieldGlow;

    // Neutron star central core (radius ~ 0.06)
    float coreDist = length(uv);
    float coreGlow = (0.008 / (coreDist * coreDist + 0.001)) * (1.0 + audioKick * 2.0);
    vec3 coreCol = vec3(1.0, 1.0, 1.0) * coreGlow;

    // Warped background photo
    vec2 photoUV = st + normalize(uv) * (0.04 / (r + 0.1)) * (1.0 + audioSubBass);
    vec3 photo = img(clamp(photoUV, 0.0, 1.0));

    // Combine pulsar visualizer
    vec3 col = photo * 0.3 + fieldCol + beamCol + coreCol;

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}
