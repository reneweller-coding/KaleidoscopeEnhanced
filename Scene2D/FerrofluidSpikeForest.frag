#version 330 core
out vec4 fragColor;
/**
 * @file FerrofluidSpikeForest.frag
 * @brief FERROFLUID SPIKE FOREST: 3D raymarched pool of magnetic liquid ferrofluid
 * rising into sharp Rosensweig instability spikes under dynamic electromagnets.
 * Metallic liquid specular reflections, oily rainbow thin-film sheen, and photo projection.
 *   audioSubBass -> pulls ferrofluid spikes up into tall sharp needles
 *   audioKick    -> triggers magnetic pulse shockwaves across the fluid pool
 *   audioCentroid-> shifts thin-film oil-slick iridescent colors
 *   audioSwell   -> undulates electromagnetic coil magnetic fields
 *
 * Per-activation variety:
 *   spikeP   float Rosensweig spike height & sharpness     (0.5..2.2)
 *   ringP    float concentric magnetic mandala rings       (0.5..2.0)
 *   oilP     float rainbow thin-film iridescence           (0.5..2.0)
 *   hueP     float specular reflection color offset        (0..6.28)
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
uniform float audioChromaHue;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;

uniform float spikeP;
uniform float ringP;
uniform float oilP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

// IMG-PALETTE (house standard, replaces the generic cos-rainbow): colours
// come from a rotating arc in the CURRENT slideshow image, so every
// activation inherits a fresh palette from the photos, and the arc follows
// the musical key (chromaHue is circular-slewed = jump-free) with a slow
// advance drift.  Valence shapes saturation toward the mood.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
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

// Ferrofluid surface height function
float ferroHeight(vec2 p, float spk, float rng) {
    float r = length(p);
    float a = atan(p.y, p.x);

    float t = time * 0.4 + audioAdvance * 0.2;

    // Hexagonal / concentric Rosensweig magnetic spikes
    float rings = sin(r * 14.0 * rng - t * 2.0);
    float petals = cos(a * 6.0 + sin(r * 8.0));
    float spikes = max(rings * petals, 0.0);

    // Height of spikes driven by sub-bass
    float spikeH = pow(spikes, 2.5) * (0.8 + 1.2 * audioSubBass + 0.5 * audioKick) * spk;
    return spikeH * exp(-r * 0.6);
}

void main() {
    float spk = (spikeP > 0.0) ? spikeP : 1.0;
    float rng = (ringP  > 0.0) ? ringP  : 1.0;
    float oil = (oilP   > 0.0) ? oilP   : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    // Ray setup for 3D ferrofluid pool
    vec3 ro = vec3(0.0, 1.8, -2.8);
    vec3 rd = normalize(vec3(uv.x, uv.y - 0.35, 1.2));

    // Raymarch onto the ferrofluid heightfield
    float t = 1.0;
    vec3 p = ro;
    bool hit = false;

    for (int i = 0; i < 60; ++i) {
        p = ro + rd * t;
        float h = ferroHeight(p.xz, spk, rng);
        float d = p.y - h;

        if (d < 0.002) {
            hit = true;
            break;
        }
        if (t > 7.0) break;
        t += max(d * 0.5, 0.01);
    }

    vec3 col = vec3(0.02, 0.02, 0.04);

    if (hit) {
        // Compute surface normal
        float eps = 0.005;
        float hL = ferroHeight(p.xz - vec2(eps, 0.0), spk, rng);
        float hR = ferroHeight(p.xz + vec2(eps, 0.0), spk, rng);
        float hD = ferroHeight(p.xz - vec2(0.0, eps), spk, rng);
        float hU = ferroHeight(p.xz + vec2(0.0, eps), spk, rng);
        vec3 n = normalize(vec3(hL - hR, 2.0 * eps, hD - hU));

        // Specular reflections on deep black oily liquid
        vec3 lightDir = normalize(vec3(0.5, 1.0, -0.6));
        vec3 ref = reflect(rd, n);
        float diff = max(dot(n, lightDir), 0.0) * 0.3 + 0.1;
        float spec = pow(max(dot(ref, lightDir), 0.0), 64.0);

        // Reflected photo mapping
        vec2 refUV = fract(ref.xy * 0.5 + 0.5);
        vec3 photo = img(refUV);

        // Oil-slick thin-film iridescence.  The colour phase now also drifts
        // with radius, so the rainbow sheen forms concentric mandala bands
        // that follow the spike rings instead of a single flat tint.
        float cosTheta = max(dot(-rd, n), 0.0);
        vec3 oilIrid = imgPalette(((1.0 - cosTheta) * 8.0 * oil
                                        + length(p.xz) * 2.2 + audioCentroid * 3.0) * 0.159);

        // Deep glossy black ferrofluid body + sharp chrome specular highlights.
        // The iridescence used to be a pure Fresnel-edge effect (pow(...,3) is
        // near zero across most of a head-on surface), so almost the whole
        // pool read as flat black with colour only right at the silhouette.
        // A gentler falloff plus a small always-on floor spreads the rainbow
        // sheen across the visible spikes instead of just their rims.
        vec3 ferroBody = vec3(0.03, 0.03, 0.04);
        float iridSpread = 0.30 + 0.70 * pow(1.0 - cosTheta, 1.6);
        col = mix(ferroBody, photo, 0.3) * diff + oilIrid * iridSpread * 1.3 * oil;
        col += vec3(1.0, 1.0, 1.0) * spec * (1.5 + audioKick * 3.0);
    } else {
        col = img(st) * 0.2;
    }

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}
