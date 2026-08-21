#version 330 core
out vec4 fragColor;
/**
 * @file LiquidMercuryFerrofluidChamber.frag
 * @brief LIQUID MERCURY FERROFLUID CHAMBER: Raymarched reflective pool of liquid
 * mercury and magnetic ferrofluid. Paramagnetic Rosensweig instability cone
 * spikes erupt in hexagonal arrays under shifting magnetic fields, with
 * standing Faraday ripples, chrome mirror reflections, and photo dispersion.
 *   audioAdvance -> rotates magnetic field poles & advects liquid ripples
 *   audioKick    -> violently erupts sharp Rosensweig cone spikes from pool
 *   audioBass    -> undulates Faraday standing-wave frequency and height
 *   audioCentroid-> modulates specular chrome highlight sharpness
 *
 * Per-activation variety:
 *   spikeP   float Rosensweig cone spike sharpness & height (0.5..2.2)
 *   faradayP float Faraday ripple wave amplitude           (0.5..2.0)
 *   speedP   float magnetic field oscillation velocity     (0.5..2.0)
 *   hueP     float metallic sheen hue offset               (0..6.28)
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
    // Hexagonal magnetic lattice pattern.
    // Lattice and ripple frequencies both dropped (4.0 -> 2.4, 18.0 -> 7.0).
    // At the old rates the surface slope changed faster than the picture can
    // resolve: neighbouring pixels got completely unrelated normals, so the
    // mirror lookup below sampled unrelated parts of the photo and the whole
    // pool averaged down to one flat mid grey (measured contrast 0.034). At
    // these rates the spike lattice and the standing waves are individually
    // VISIBLE, which is the entire point of the scene.
    vec2 hex = p * 2.4;
    float h1 = sin(hex.x);
    float h2 = sin(-0.5 * hex.x + 0.866 * hex.y);
    float h3 = sin(-0.5 * hex.x - 0.866 * hex.y);
    float hexPattern = (h1 + h2 + h3) / 3.0;

    // Rosensweig sharp cone spikes (nonlinear sharpening)
    float spikes = pow(max(0.0, hexPattern * 0.5 + 0.5), 4.0) * (0.35 + audioKick * 0.8) * spk;

    // Faraday standing waves
    float r = length(p);
    float faraday = sin(r * 7.0 - t * 6.0) * cos(atan(p.y, p.x) * 6.0) * 0.09 * far * (1.0 + audioBass);

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
    vec3 p = vec3(0.0);   // guarded by hitDist, but the compiler cannot see that

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
        // Normal computation via finite differences. eps widened to band-limit
        // the slope: a 0.005 stencil resolved detail finer than a pixel, which
        // is what turned the mirror into noise.
        vec2 e = vec2(0.014, 0.0);
        float hL = ferroHeight(p.xz - e.xy, t, spk, far);
        float hR = ferroHeight(p.xz + e.xy, t, spk, far);
        float hD = ferroHeight(p.xz - e.yx, t, spk, far);
        float hU = ferroHeight(p.xz + e.yx, t, spk, far);
        vec3 n = normalize(vec3(hL - hR, 2.0 * e.x, hD - hU));

        // Chrome mirror reflection.
        // fract() wrapped the whole photo every 2 units of refl.xz, so the
        // slightest change of slope jumped to an unrelated crop -- clamping to a
        // single, gently-scaled window keeps neighbouring pixels reflecting
        // neighbouring parts of the image, which is what a mirror does.
        vec3 refl = reflect(rd, n);
        vec2 reflUV = clamp(refl.xz * 0.34 + 0.5, 0.0, 1.0);
        vec3 photo = img(reflUV);

        // Environment: a mirror pool reflects a bright ceiling and a dark rim.
        // This is the term that gives the surface its large-scale light/dark --
        // refl.y is a genuine per-point quantity (it swings the full -1..1 as the
        // Rosensweig cones tip the normal over) whereas the photo crop alone was
        // near-constant in average once the picture was resolved.
        float envUp = refl.y * 0.5 + 0.5;
        vec3 envCol = mix(vec3(0.035, 0.045, 0.075),
                          imgPalette(0.25 + audioPhase * 0.05) * 1.15,
                          smoothstep(0.30, 0.92, envUp));

        // Specular highlight from overhead magnetic coil
        vec3 lightDir = normalize(vec3(0.2, 0.9, 0.1));
        float diff = max(dot(n, lightDir), 0.0);
        float spec = pow(max(dot(refl, lightDir), 0.0), 48.0);

        // Fresnel term for liquid metal
        float fresnel = pow(1.0 - max(dot(-rd, n), 0.0), 3.0);

        // Metallic palette (liquid mercury silver + oily thin-film sheen)
        vec3 mercuryBase = vec3(0.85, 0.9, 0.95);
        vec3 oilySheen = imgPalette((p.y * 12.0 + audioPhase) * 0.159);

        vec3 metal = mix(mercuryBase, oilySheen, 0.35);
        // The mirror image is the environment gradient MODULATED by the photo,
        // not the photo alone; a mirror that only ever shows one crop of one
        // picture has no light and dark of its own.
        vec3 mirror = envCol * (0.45 + 0.95 * photo);
        col = mix(metal * 0.28, mirror, 0.60 + 0.32 * fresnel);
        col += metal * diff * 0.22;
        col += spec * vec3(1.0, 1.0, 1.0) * (1.2 + audioKick * 2.5);

        // Distance fog. At 0.2/unit the far half of the pool -- which is most of
        // the frame at this grazing camera angle -- was already 60-80% dissolved
        // into the flat background colour.
        col = mix(col, vec3(0.05, 0.06, 0.10), min(1.0 - exp(-hitDist * 0.085), 0.55));
    }

    if (audioChromaHue != 0.0)     if (hue > 0.001) col = hueRot(col, hue);

    col = min(col, vec3(1.35));
    col /= 1.0 + 0.30 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
