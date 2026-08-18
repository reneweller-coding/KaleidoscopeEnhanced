#version 400 core
out vec4 fragColor;
/**
 * @file GlacierTessellation.frag
 * @brief GLACIER TESSELLATION: low flight over tessellated glacier ice - white/blue
 * subsurface-scattering ice with crevasse light from INSIDE, tinted by the
 * photo palette; the terrain streams beneath the camera.
 *   audioAdvance -> flight speed      audioKick -> crevasse flash
 *   audioBass    -> ice-wave heave
 */

in vec3 vNormal;
in vec3 vWorld;
in vec2 vUV;
in float vCrevasse;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float time;
uniform float hueP;
uniform float audioChromaHue;
uniform float audioAdvance;
uniform float audioValence;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image; the arc follows the musical key (audioChromaHue
// is circular-slewed = jump-free), valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

void main() {
    vec3 n = normalize(vNormal);
    vec3 lightDir = normalize(vec3(0.6, 0.8, -0.5));
    float diff = max(dot(n, lightDir), 0.0);

    // Specular frost
    vec3 viewDir = normalize(-vWorld);
    vec3 refl = reflect(-lightDir, n);
    float spec = pow(max(dot(viewDir, refl), 0.0), 32.0);

    // Subsurface scattering ice blue
    vec3 iceCore = vec3(0.05, 0.6, 0.95);
    vec3 iceSurface = vec3(0.85, 0.95, 1.0);
    vec3 iceCol = mix(iceCore, iceSurface, diff * 0.7 + 0.3);

    // Glowing crevasses: light from inside the ice, tinted by the PHOTO
    // palette (house standard) instead of a fixed neon cyan.
    vec3 crevasseCol = mix(vec3(0.0, 1.0, 0.9), imgPalette(0.18) * 1.6, 0.65)
                     * vCrevasse * 1.6;

    // Sample active photo texture
    vec3 photo = img(vUV);

    vec3 col = iceCol + spec * vec3(1.0, 1.0, 1.0) * 0.8 + crevasseCol;
    col += photo * 0.25;
    col /= 1.0 + 0.25 * max(col.r, max(col.g, col.b));

    // Fog into distance
    float dist = length(vWorld);
    float fog = 1.0 - exp(-dist * 0.008);
    vec3 fogCol = vec3(0.02, 0.08, 0.15);
    col = mix(col, fogCol, fog);

    float h = (hueP > 0.0) ? hueP : 0.0;
    if (h > 0.001) col = hueRot(col, h);

    fragColor = vec4(col, 1.0);
}
