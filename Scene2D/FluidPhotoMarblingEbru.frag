#version 330 core
out vec4 fragColor;
/**
 * @file FluidPhotoMarblingEbru.frag
 * @brief FLUID PHOTO MARBLING EBRU: 100% viewport-filling traditional Turkish
 * Ebru paper-marbling simulation. The loaded photo floats as viscous liquid
 * oil pigments on a water bath, combed and raked into elegant peacock
 * plumes, curling swirls, and non-Euclidean fluid streamlines.
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

uniform float rakeP;
uniform float swirlP;
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

// Overall level of the photo currently on the texture units, from a fixed
// 5-tap grid. The whole picture here IS the photo, floated on the water bath,
// so a bright photo left the gold veins and the surface specular no headroom
// at all. The probe rides the tex0/tex1 crossfade, so the gain it feeds can
// never pop, and being one number for the whole frame it rescales exposure
// without touching the marbling's local contrast.
float photoLevel() {
    vec3 s = img(vec2(0.25, 0.25)) + img(vec2(0.75, 0.25))
           + img(vec2(0.25, 0.75)) + img(vec2(0.75, 0.75))
           + img(vec2(0.50, 0.50));
    return dot(s * 0.2, vec3(0.299, 0.587, 0.114));
}

// Mathematical Ebru Comb / Rake transformation
vec2 ebruRake(vec2 p, vec2 dir, float spacing, float speed) {
    float proj = dot(p, vec2(-dir.y, dir.x)); // Distance perpendicular to rake motion
    float wave = sin(proj * 6.2831853 / spacing + speed);
    return p + dir * (wave * 0.12);
}

// Mathematical Ebru Vortex / Droplet tine transformation
vec2 ebruVortex(vec2 p, vec2 center, float strength, float radius) {
    vec2 d = p - center;
    float dist = length(d);
    float factor = exp(-dist / radius) * strength;
    float c = cos(factor), s = sin(factor);
    return center + vec2(d.x * c - d.y * s, d.x * s + d.y * c);
}

void main() {
    float rk  = (rakeP  > 0.0) ? rakeP  : 1.0;
    float swl = (swirlP > 0.0) ? swirlP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Apply cascading Ebru comb rakes
    vec2 p = uv;

    // Horizontal & vertical comb passes
    p = ebruRake(p, normalize(vec2(1.0, 0.2)), 0.35, t * 1.5 * rk);
    p = ebruRake(p, normalize(vec2(-0.3, 1.0)), 0.45, -t * 1.2 * rk);

    // Multi-drop droplet swirls (needle swirls)
    vec2 c1 = vec2(sin(t * 0.6) * 0.4, cos(t * 0.5) * 0.3);
    vec2 c2 = vec2(cos(t * 0.4 + 2.0) * 0.45, sin(t * 0.7 + 1.0) * 0.35);
    vec2 c3 = vec2(sin(t * 0.5 + 4.0) * 0.35, cos(t * 0.6 + 3.0) * 0.4);

    float swirlStrength = (2.2 + 1.5 * audioBass) * swl;
    p = ebruVortex(p, c1, swirlStrength, 0.4);
    p = ebruVortex(p, c2, -swirlStrength * 0.8, 0.45);
    p = ebruVortex(p, c3, swirlStrength * 0.9, 0.35);

    // Kick shockwave rings expanding through the marbled liquid
    float kickDist = length(uv - c1);
    float kickRing = sin(kickDist * 16.0 - time * 8.0) * exp(-kickDist * 3.0) * audioKick * 0.15;
    p += (uv - c1) * kickRing;

    // Sample marbled photo texture
    vec2 marbledUV = p * 0.8 + vec2(0.5);
    vec3 photoMarbled = img(fract(marbledUV));

    // Specular liquid water surface sheen
    vec2 eps = vec2(0.005, 0.0);
    vec3 pX = img(fract((p + eps.xy) * 0.8 + vec2(0.5)));
    vec3 pY = img(fract((p + eps.yx) * 0.8 + vec2(0.5)));
    float lumX = dot(pX, vec3(0.333));
    float lumY = dot(pY, vec3(0.333));
    float lum0 = dot(photoMarbled, vec3(0.333));

    vec3 normal = normalize(vec3((lum0 - lumX) * 15.0, (lum0 - lumY) * 15.0, 1.0));
    vec3 lightDir = normalize(vec3(0.4, 0.8, 1.0));
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    vec3 halfVec = normalize(lightDir + viewDir);

    float spec = pow(max(dot(normal, halfVec), 0.0), 32.0);

    // Gold pigment veins floating in marbled swirls. The scalar was bounded
    // only by audioHigh's range while the TINTED vector was free, so on a
    // bright passage the veins alone added up to 2.1 per channel.
    float veinMask = smoothstep(0.7, 0.85, abs(sin(lum0 * 20.0)));
    vec3 goldVein = min(vec3(1.0, 0.82, 0.35) * (1.5 + 2.0 * audioHigh) * veinMask * 0.6, vec3(0.80));

    // Hold the oil film back to a fixed exposure. The bath is one flat sample
    // of the picture, so a light photo pinned the entire viewport near 1.0 and
    // both the veins and the water sheen were clipped away on top of it.
    float expGain = clamp(0.32 / max(0.05, photoLevel()), 0.32, 2.4);

    vec3 col = photoMarbled * expGain * (0.85 + 0.4 * audioLevel) + goldVein;
    col += min(vec3(1.0) * spec * (0.6 + 0.8 * audioMid), vec3(0.70));

    col = hueRot(col, audioChromaHue + hue);

    col = pow(max(col, 0.0), vec3(0.9));
    vec3 _catTone = clamp(col, 0.0, 1.0);
    _catTone /= 1.0 + 0.26 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
