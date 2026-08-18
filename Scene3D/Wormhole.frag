#version 330 core
out vec4 fragColor;
// Wormhole.frag — the wall image is bent around each throat: near the
// horizon the angular coordinate smears (extra rotation growing with
// lensAmt, like light dragged around a photon sphere) and the three colour
// channels sample at slightly different bend amounts (chromatic
// aberration).  A bright photon ring traces the horizon itself.
uniform sampler2D tex0;
uniform float time;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioDrop;
uniform float audioChromaHue;

in vec2  vUV;
in float vDist;
in float vAng;
in float vLensAmt;

/**
 * @file Wormhole.frag
 * @brief Flies through a repeating chain of gravitational-lensing wormhole
 * throats: bends the slideshow image (tex0) around each throat with growing
 * angular smear near its horizon and per-channel chromatic aberration, and
 * traces a bright photon ring at the horizon itself.
 *
 * audioAdvance drives the flight speed and the image's scroll along the
 * tube; audioKick and audioDrop flare the photon ring's brightness;
 * audioChromaHue tints the ring's colour. vLensAmt (the current throat's
 * lensing strength, from the vertex stage) controls both the bend amount
 * and how brightly that stretch of tube is lit; vDist applies depth fog.
 */

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
vec2 mfold(vec2 uv) { return abs(fract(uv * 0.5) * 2.0 - 1.0); }

vec3 sampleBent(float bendMul)
{
    // Kaleido-fold into 6 sectors, then bend the angle around the horizon —
    // stronger bend = more of the image drags around the throat.
    float sector = 6.2831853 / 6.0;
    float a = mod(vAng + vLensAmt * bendMul * 4.0, sector * 2.0);
    a = abs(a - sector) / sector;                 // 0..1 mirrored
    vec2 uv = vec2(a * 1.4,
                   vUV.y * 6.0 - time * 0.30 - audioAdvance * 1.0);
    return texture(tex0, mfold(uv)).rgb;
}

void main()
{
    // Chromatic aberration: R bends least, B bends most.
    vec3 col;
    col.r = sampleBent(0.75).r;
    col.g = sampleBent(1.00).g;
    col.b = sampleBent(1.35).b;

    // Photon ring right at the horizon, blazing on kicks/drops.
    float ring = pow(vLensAmt, 3.0);
    col += hueRot(vec3(1.0, 0.85, 0.55), audioChromaHue)
         * ring * (1.2 + 1.4 * audioKick + 2.4 * audioDrop);

    col *= 0.75 + 0.5 * vLensAmt;                  // brighter near the throat
    col *= exp(-vDist * 0.014);                    // depth fog

    fragColor = vec4(col * 1.3, 1.0);
}
