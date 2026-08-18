#version 330 core
out vec4 fragColor;
// LiquidMercuryFerrofluidChamber.frag
// -----------------------------------------------------------------------
// LIQUID MERCURY FERROFLUID CHAMBER: Raymarched reflective pool of liquid
// mercury and magnetic ferrofluid. Paramagnetic Rosensweig instability cone
// spikes erupt in hexagonal arrays under shifting magnetic fields, with
// standing Faraday ripples, chrome mirror reflections, and photo dispersion.
//   audioAdvance -> rotates magnetic field poles & advects liquid ripples
//   audioKick    -> violently erupts sharp Rosensweig cone spikes from pool
//   audioBass    -> undulates Faraday standing-wave frequency and height
//   audioCentroid-> modulates specular chrome highlight sharpness
//
// Per-activation variety:
//   spikeP   float Rosensweig cone spike sharpness & height (0.5..2.2)
//   faradayP float Faraday ripple wave amplitude           (0.5..2.0)
//   speedP   float magnetic field oscillation velocity     (0.5..2.0)
//   hueP     float metallic sheen hue offset               (0..6.28)
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

uniform float spikeP;
uniform float faradayP;
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

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

// Ferrofluid heightfield function
float ferroHeight(vec2 p, float t, float spk, float far) {
    // Hexagonal magnetic lattice pattern
    vec2 hex = p * 4.0;
    float h1 = sin(hex.x);
    float h2 = sin(-0.5 * hex.x + 0.866 * hex.y);
    float h3 = sin(-0.5 * hex.x - 0.866 * hex.y);
    float hexPattern = (h1 + h2 + h3) / 3.0;

    // Rosensweig sharp cone spikes (nonlinear sharpening)
    float spikes = pow(max(0.0, hexPattern * 0.5 + 0.5), 4.0) * (0.35 + audioKick * 0.8) * spk;

    // Faraday standing waves
    float r = length(p);
    float faraday = sin(r * 18.0 - t * 6.0) * cos(atan(p.y, p.x) * 6.0) * 0.08 * far * (1.0 + audioBass);

    return spikes + faraday;
}

void main() {
    float spk = (spikeP   > 0.0) ? spikeP   : 1.0;
    float far = (faradayP > 0.0) ? faradayP : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.35 * spd + audioAdvance * 0.18;

    // Raymarching camera angled at the mercury pool
    vec3 ro = vec3(0.0, 1.8, -2.4);
    vec3 lookTarget = vec3(0.0, 0.0, 0.0);

    vec3 ww = normalize(lookTarget - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);

    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.2 * ww);

    // Raymarch against heightfield plane y = ferroHeight(x, z)
    float dO = 0.0;
    float hitDist = -1.0;
    vec3 p;

    for (int i = 0; i < 45; ++i) {
        p = ro + rd * dO;
        float h = ferroHeight(p.xz, t, spk, far);
        float dist = p.y - h;
        if (dist < 0.004) {
            hitDist = dO;
            break;
        }
        if (dO > 8.0) break;
        dO += dist * 0.6;
    }

    vec3 col = vec3(0.04, 0.05, 0.08);

    if (hitDist > 0.0) {
        // Normal computation via finite differences
        vec2 e = vec2(0.005, 0.0);
        float hL = ferroHeight(p.xz - e.xy, t, spk, far);
        float hR = ferroHeight(p.xz + e.xy, t, spk, far);
        float hD = ferroHeight(p.xz - e.yx, t, spk, far);
        float hU = ferroHeight(p.xz + e.yx, t, spk, far);
        vec3 n = normalize(vec3(hL - hR, 2.0 * e.x, hD - hU));

        // Chrome mirror reflection
        vec3 refl = reflect(rd, n);
        vec2 reflUV = fract(refl.xz * 0.5 + 0.5);
        vec3 photo = img(reflUV);

        // Specular highlight from overhead magnetic coil
        vec3 lightDir = normalize(vec3(0.2, 0.9, 0.1));
        float diff = max(dot(n, lightDir), 0.0);
        float spec = pow(max(dot(refl, lightDir), 0.0), 48.0);

        // Fresnel term for liquid metal
        float fresnel = pow(1.0 - max(dot(-rd, n), 0.0), 3.0);

        // Metallic palette (liquid mercury silver + oily thin-film sheen)
        vec3 mercuryBase = vec3(0.85, 0.9, 0.95);
        vec3 oilySheen = imgPalette((p.y * 12.0 + audioPhase) * 0.159);

        col = mix(mercuryBase, oilySheen, 0.35);
        col = mix(col * 0.4, photo * 1.2, 0.65 + 0.25 * fresnel);
        col += spec * vec3(1.0, 1.0, 1.0) * (1.2 + audioKick * 2.5);

        // Distance fog
        col = mix(col, vec3(0.04, 0.05, 0.08), 1.0 - exp(-hitDist * 0.2));
    }

    if (audioChromaHue != 0.0)     if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}
