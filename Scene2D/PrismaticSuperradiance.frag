#version 330 core
out vec4 fragColor;
// PrismaticSuperradiance.frag
// -----------------------------------------------------------------------
// PRISMATIC SUPERRADIANCE: Volumetric quantum laser resonance chamber
// with multi-faceted Brewster-angle dichroic prism cubes, cascaded Raman
// scattering, coherent Q-switched stimulated emission beam sheets, and
// chromatic dispersion of live kaleidoscope photo textures.
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
uniform float audioChromaHue;

uniform float beamP;
uniform float dispersionP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// Spectral color from wavelength parameter
vec3 spectrumColor(float t) {
    return vec3(
        smoothstep(0.4, 0.0, abs(t - 0.75)),
        smoothstep(0.4, 0.0, abs(t - 0.50)),
        smoothstep(0.4, 0.0, abs(t - 0.25))
    );
}

void main() {
    float bm   = (beamP       > 0.0) ? beamP       : 1.0;
    float disp = (dispersionP > 0.0) ? dispersionP : 1.0;
    float spd  = (speedP      > 0.0) ? speedP      : 1.0;
    float hue  = (hueP        > 0.0) ? hueP        : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Ray setup through laser resonator
    float t = time * 0.3 * spd + audioAdvance * 0.15;
    vec3 ro = vec3(sin(t * 0.5) * 2.5, cos(t * 0.4) * 1.8, -4.5);
    vec3 ta = vec3(0.0, 0.0, 0.0);
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.5 * ww);

    vec3 col = vec3(0.0);
    float stepSize = 0.12;

    // Volumetric beam accumulation
    for (int i = 0; i < 48; ++i) {
        vec3 p = ro + rd * (float(i) * stepSize);
        
        // Multi-axis laser grid sheets
        vec3 gridP = fract(p * 0.8) - 0.5;
        float beamX = exp(-abs(gridP.y) * 25.0) * exp(-abs(gridP.z) * 25.0);
        float beamY = exp(-abs(gridP.x) * 25.0) * exp(-abs(gridP.z) * 25.0);
        float beamZ = exp(-abs(gridP.x) * 25.0) * exp(-abs(gridP.y) * 25.0);

        // Q-switched pulse wave traveling along beams
        float pulseX = sin(p.x * 6.0 - time * 12.0) * 0.5 + 0.5;
        float pulseY = sin(p.y * 6.0 + time * 10.0) * 0.5 + 0.5;
        float pulseZ = sin(p.z * 6.0 - time * 14.0) * 0.5 + 0.5;

        // Dispersion of photo texture through dichroic prisms
        vec2 prismUV = p.xy * 0.2 + vec2(0.5);
        vec3 photoR = img(fract(prismUV + vec2(0.015 * disp, 0.0)));
        vec3 photoG = img(fract(prismUV));
        vec3 photoB = img(fract(prismUV - vec2(0.015 * disp, 0.0)));
        vec3 dispersedPhoto = vec3(photoR.r, photoG.g, photoB.b);

        // Beam colors & Raman stimulated emission
        vec3 colX = vec3(1.0, 0.2, 0.1) * (pulseX * 1.5 + 0.5) * (0.8 + 1.2 * audioKick);
        vec3 colY = vec3(0.1, 1.0, 0.4) * (pulseY * 1.5 + 0.5) * (0.8 + 0.8 * audioMid);
        vec3 colZ = vec3(0.2, 0.5, 1.0) * (pulseZ * 1.5 + 0.5) * (0.8 + 1.0 * audioHigh);

        vec3 beamEnergy = (colX * beamX + colY * beamY + colZ * beamZ) * bm;

        // Brewster prism cubes floating in cavity
        vec3 cubeP = mod(p + 1.5, 3.0) - 1.5;
        float cubeDist = max(abs(cubeP.x), max(abs(cubeP.y), abs(cubeP.z))) - 0.45;
        float prismFacet = smoothstep(0.05, 0.0, abs(cubeDist));
        vec3 prismGlow = spectrumColor(fract(length(cubeP) * 2.0 + audioPhase * 0.2)) * prismFacet * 2.0;

        col += (beamEnergy * dispersedPhoto * 2.2 + prismGlow) * stepSize * (0.7 + 0.6 * audioLevel);
    }

    // Vanishing point core laser flash on downbeats
    float centerBeam = exp(-length(uv) * 4.0) * (0.4 + 1.8 * audioKick);
    col += vec3(1.0, 0.8, 0.9) * centerBeam;

    col = hueRot(col, audioChromaHue + hue);
    col = pow(col, vec3(0.9)); // Saturation boost
    col += vec3(0.03, 0.02, 0.06) * audioSwell;

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.6;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
