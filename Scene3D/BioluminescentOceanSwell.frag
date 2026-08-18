#version 330 core
out vec4 fragColor;
/**
 * @file BioluminescentOceanSwell.frag
 * @brief BIOLUMINESCENT OCEAN SWELL: open-ocean Gerstner swell viewed from a
 * gliding camera above the water, horizon high in the frame; narrow crest
 * bands glow bioluminescent cyan, the moon adds a specular path, the photo
 * tints sky reflection and glow.
 *   audioBass/Swell -> wave amplitude    audioKick -> splash + crest flash
 *   audioAdvance    -> forward glide over open water
 */

in vec3 vPos;
in vec3 vNormal;
in vec2 vUV;
in float vCrest;
in float vHeight;

uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioChromaHue;
uniform float audioSwell;

uniform float glowP;
uniform float bioP;
uniform float hueP;
uniform float audioAdvance;
uniform float audioValence;

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

void main() {
    float glw = (glowP > 0.0) ? glowP : 1.0;
    float bio = (bioP  > 0.0) ? bioP  : 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(vec3(0.0, 2.0, 5.0) - vPos);
    vec3 lightDir = normalize(vec3(0.4, 0.8, -0.6));

    // Deep ocean water shading
    vec3 deepWater = vec3(0.01, 0.03, 0.08);
    vec3 shallowWater = vec3(0.02, 0.12, 0.22);
    vec3 waterBase = mix(deepWater, shallowWater, clamp(vHeight + 0.5, 0.0, 1.0));

    // Fresnel reflection of photo sky
    float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 4.0);
    vec3 ref = reflect(-viewDir, n);
    vec2 skyUV = ref.xz * 0.2 + 0.5;
    vec3 photoSky = img(fract(skyUV));

    // Specular highlight from moonlight
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(dot(n, halfVec), 0.0), 64.0);

    // Bioluminescent dinoflagellate blue-cyan glow on wave crests — a
    // narrow crest band, hot audio brightens WITHOUT washing to white.
    float bioIntensity = smoothstep(0.7, 2.2, vCrest);
    vec3 bioGlowCol = palTint(mix(vec3(0.0, 0.8, 1.0), vec3(0.1, 1.0, 0.6), sin(vPos.x * 2.0 + time * 3.0) * 0.5 + 0.5), 0.15, 0.25);
    vec3 bioEmission = bioGlowCol * bioIntensity * (0.9 + 1.1 * audioKick) * bio * glw;

    // Subsurface scattering glow
    float sss = smoothstep(-0.2, 0.8, vHeight) * (1.0 - n.y);
    vec3 sssCol = vec3(0.05, 0.35, 0.45) * sss;

    vec3 col = waterBase + photoSky * fresnel * 0.8 + vec3(1.0) * spec * 0.9 + bioEmission + sssCol;

    col = hueRot(col, hue);   // chromaHue handled inside imgPalette
    col /= 1.0 + 0.32 * max(col.r, max(col.g, col.b));
    fragColor = vec4(col, 1.0);
}
