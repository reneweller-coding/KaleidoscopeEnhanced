#version 330 core
out vec4 fragColor;
/**
 * @file SelfSimilarityTerrain.frag
 * @brief SELF SIMILARITY TERRAIN: the self-similarity matrix flown over as
 * a landscape -- ridges where the music repeats itself, the diagonal as
 * the main range, valleys where it is new.  The photo is the rock; the
 * summits (high similarity) carry snow; a warm light rakes from the side
 * with the swell; the kick flashes the nearest ridge, the bass warms the
 * valleys, the treble glints the snow.  Camera height fixed.
 *
 * Audio Reactivity:
 *   texSSM / ssmHead -> the terrain (evaluation stage)
 *   audioSwell -> light; audioKick -> ridge flash; audioBass -> valley warmth;
 *   audioHigh -> snow glints; audioLevel -> brightness.
 *
 * Per-activation variety: camHP, detailP, heightP, hueP.
 */
in vec3  vWorld;
in vec2  vSurfUV;
in vec3  vNormal;
in float vSim;
in float vDist;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float time;
uniform float audioAdvance;
uniform float audioLevel;
uniform float audioKick;
uniform float audioBass;
uniform float audioHigh;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioValence;
uniform float camHP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    vec3 n = normalize(vNormal);
    float sun = 0.5 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    vec3 L = normalize(vec3(-0.6, 0.5, 0.3));
    float diff = max(dot(n, L), 0.0);
    // Rock: the photo, tinted; valleys warm with the bass, summits snowy.
    vec3 rock = img(fract(vWorld.xz * 0.02)) * 1.1;
    rock = mix(rock, rock * imgPalette(hue * 0.159 + 0.3) * 1.5, 0.35);
    vec3 valley = mix(vec3(0.5, 0.3, 0.15), imgPalette(hue * 0.159 + 0.05), 0.4);
    rock = mix(rock, valley, (1.0 - vSim) * 0.4 * (0.3 + 0.7 * clamp(audioBass, 0.0, 1.0)));
    float snow = smoothstep(0.55, 0.8, vSim) * smoothstep(0.3, 0.7, n.y);
    vec3 snowCol = vec3(0.95, 0.97, 1.0);
    vec2 gu = vWorld.xz * 1.2; vec2 gc = floor(gu); vec2 gf = fract(gu) - 0.5;
    vec2 go = vec2(hash21(gc + 1.3), hash21(gc + 5.9)) - 0.5;
    float glint = smoothstep(0.2, 0.05, length(gf - go * 0.6)) * step(0.92, hash21(gc)) * clamp(audioHigh * 2.0, 0.0, 1.0);
    vec3 surf = mix(rock, snowCol + glint, snow);
    vec3 col = surf * (0.25 + 0.95 * diff * sun);
    // The nearest ridge flashes on the kick.
    col += imgPalette(hue * 0.159 + 0.9) * smoothstep(20.0, 3.0, vDist) * vSim * audioKick * 0.8;
    // Haze into the distance, the far range in the sky's colour.
    vec3 skyCol = mix(vec3(0.6, 0.7, 0.85), imgPalette(hue * 0.159 + 0.6), 0.3) * sun;
    float fog = 1.0 - exp(-vDist * 0.008);
    col = mix(col, skyCol, clamp(fog, 0.0, 0.85));
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
