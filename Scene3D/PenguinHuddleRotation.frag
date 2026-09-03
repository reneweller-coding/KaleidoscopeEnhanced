#version 330 core
out vec4 fragColor;
/**
 * @file PenguinHuddleRotation.frag
 * @brief Fragment stage for PenguinHuddleRotation: a white-out sky and
 * ice (the photo as the drifted snow texture), blowing snow as round
 * flakes streaming across on the clock (the storm is the swell), the
 * birds as black-backed, white-fronted ovals with the golden neck patch,
 * snow-crusted on the windward edge, the huddle's warmth as a faint glow
 * at its heart with the bass; the kick a gust that whitens everything for
 * a moment.
 *
 * Audio Reactivity: audioSwell -> storm density; audioBass -> huddle warmth;
 *                   audioKick -> gust white-out; audioLevel -> brightness.
 */
in vec2  vTexCoord;
in vec3  vWorld;
in float vKind;
in float vEdge;
in float vId;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float sceneAdvance;
uniform float audioSwell;
uniform float audioBass;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioAdvance;
uniform float audioValence;
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

vec3 blowingSnow(vec2 uv, float storm)
{
    vec2 su = (uv + vec2(sceneAdvance * 0.6, sceneAdvance * 0.1)) * vec2(60.0, 30.0);
    vec2 sc = floor(su); vec2 sf = fract(su) - 0.5;
    vec2 so = vec2(hash21(sc + 1.3), hash21(sc + 5.9)) - 0.5;
    float flake = smoothstep(0.3, 0.1, length((sf - so * 0.5) * vec2(0.5, 1.0))) * step(1.0 - 0.3 * storm, hash21(sc));
    return vec3(flake);
}

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float storm = 0.4 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float gust = audioKick * 0.35;
    vec3 white = vec3(0.85, 0.88, 0.92);
    vec3 col;
    if (vKind < -1.5)
    {
        vec2 uv = vTexCoord;
        vec3 ice = img(fract(uv * vec2(4.0, 1.0))) * 0.35 + white * 0.65;
        ice *= 0.85 + 0.15 * uv.y;
        col = mix(ice, white, smoothstep(0.4, 1.0, uv.y) * storm * 0.7);
        col += blowingSnow(uv, storm) * 0.5;
        col = mix(col, white, gust);
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind < -0.5)
    {
        vec2 uv = vTexCoord;
        col = mix(white * 0.9, vec3(0.6, 0.65, 0.75), uv.y * 0.6);
        col = mix(col, col * imgPalette(hue * 0.159 + 0.6) * 1.3, 0.1);
        col += blowingSnow(uv, storm) * 0.6;
        col = mix(col, white, gust);
        fragColor = vec4(col, 1.0);
        return;
    }
    // A bird: an oval (discard outside), black back, white front, a golden
    // neck patch, snow crust on the windward (left) side for the edge birds.
    vec2 d = (vTexCoord - 0.5) * 2.0;
    float r = length(d * vec2(1.0, 0.9));
    if (r > 1.0) discard;
    float front = smoothstep(-0.2, 0.3, d.x * 0.3 + (1.0 - abs(d.x)) * 0.6 - 0.35 * abs(d.y) * 0.0);
    float belly = smoothstep(0.55, 0.25, abs(d.x)) * smoothstep(0.95, 0.5, d.y);
    vec3 back = vec3(0.08, 0.09, 0.11);
    vec3 chest = vec3(0.92, 0.92, 0.9);
    col = mix(back, chest, belly);
    float neck = smoothstep(0.25, 0.1, length((d - vec2(0.35, 0.6)) * vec2(1.6, 1.0)));
    col = mix(col, vec3(0.95, 0.75, 0.2), neck * 0.9);
    // Shading and the snow crust on the edge birds' windward side.
    col *= 0.6 + 0.5 * sqrt(1.0 - r * r);
    float crust = smoothstep(-0.2, -0.8, d.x) * vEdge;
    col = mix(col, white, crust * 0.8);
    // The warmth at the heart of the huddle: a faint warm glow on the inner birds with the bass.
    col += vec3(0.4, 0.25, 0.1) * (1.0 - vEdge) * clamp(audioBass, 0.0, 1.0) * 0.25;
    // Distance white-out.
    float fog = 1.0 - exp(-max(vWorld.z - 8.0, 0.0) * 0.06 * storm);
    col = mix(col, white, clamp(fog, 0.0, 0.8));
    col = mix(col, white, gust);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
