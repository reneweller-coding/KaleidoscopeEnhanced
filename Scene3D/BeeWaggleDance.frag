#version 330 core
out vec4 fragColor;
/**
 * @file BeeWaggleDance.frag
 * @brief Fragment stage for BeeWaggleDance: the comb as a hexagonal grid
 * of photo cells (some capped with wax, some open with honey glowing with
 * the bass), the bees as striped ovals with wings, the dancer glowing on
 * her waggle run, the followers dimmer; the stereo balance sweeps a warm
 * light across the comb (the sun through the hive), the treble sparkles
 * the honey, the kick flashes the dancers.
 *
 * Audio Reactivity: audioStereo -> light sweep; audioBass -> honey glow;
 *                   audioHigh -> sparkle; audioKick -> dancer flash; audioLevel.
 */
in vec2  vTexCoord;
in vec3  vWorld;
in float vKind;
in float vRun;
in float vId;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioStereo;
uniform float audioBass;
uniform float audioHigh;
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

// Hex grid (pointy-top): returns the cell id and the normalised distance
// to the nearest edge (0 at the centre .. 1 at the edge).
vec2 hexCell(vec2 p, float s, out float edge)
{
    vec2 r = vec2(1.7320508, 3.0) * s;
    vec2 h = r * 0.5;
    vec2 a = mod(p, r) - h;
    vec2 b = mod(p - h, r) - h;
    vec2 gv = (dot(a, a) < dot(b, b)) ? a : b;
    vec2 id = p - gv;
    vec2 ag = abs(gv);
    edge = max(ag.x, dot(ag, vec2(0.5, 0.8660254))) / (0.8660254 * s);
    return floor(id / s + 0.5);
}

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float sweep = clamp(audioStereo, -1.0, 1.0);
    vec3 col;
    if (vKind < -0.5)
    {
        // The comb: hexagon cells of the photo; a warm light sweeps with the balance.
        vec2 p = (vTexCoord - 0.5) * vec2(18.0, 10.4);
        float s = vId * 0.9;
        float edge;
        vec2 cell = hexCell(p, s, edge);
        float wall = smoothstep(0.8, 0.92, edge);
        float h = hash21(cell + 1.7);
        vec3 photo = img(fract(cell * 0.071 + 0.3)) * 1.2;
        vec3 wax = mix(vec3(0.85, 0.7, 0.35), photo, 0.5);
        vec3 honey = mix(vec3(0.9, 0.55, 0.1), imgPalette(hue * 0.159 + 0.08), 0.35) * (0.7 + 0.9 * clamp(audioBass, 0.0, 1.0));
        vec3 cellCol = (h < 0.45) ? wax * (0.7 + 0.3 * (1.0 - edge)) : honey * (0.6 + 0.6 * (1.0 - edge * edge));
        col = mix(cellCol, vec3(0.45, 0.35, 0.15), wall);
        float light = 0.55 + 0.6 * exp(-pow((vTexCoord.x - 0.5 - 0.35 * sweep) * 2.5, 2.0));
        col *= light;
        col += vec3(1.0, 0.95, 0.8) * step(0.45, h) * smoothstep(0.35, 0.15, edge) * clamp(audioHigh * 2.0, 0.0, 1.0) * 0.3;
        col *= 0.75 + 0.5 * audioLevel;
        fragColor = vec4(col, 1.0);
        return;
    }
    // A bee: an oval body with stripes, a head at the front, wings.
    vec2 d = (vTexCoord - 0.5) * 2.0;
    float body = length(d * vec2(1.0, 1.5));
    float wing = length((d - vec2(-0.15, 0.0)) * vec2(1.4, 0.9));
    if (body > 1.0 && wing > 0.85) discard;
    float stripes = 0.5 + 0.5 * sin(d.x * 9.0);
    vec3 bee = mix(vec3(0.95, 0.75, 0.15), vec3(0.12, 0.08, 0.03), smoothstep(0.4, 0.6, stripes));
    bee = mix(bee, vec3(0.1, 0.08, 0.05), smoothstep(0.55, 0.8, d.x));            // the head
    float inBody = smoothstep(1.0, 0.9, body);
    vec3 wingCol = vec3(0.85, 0.9, 1.0) * 0.5;
    col = mix(wingCol, bee, inBody);
    if (vKind < 0.5)
    {
        // The dancer: glowing on the waggle run, flashing on the kick.
        col += imgPalette(hue * 0.159 + 0.9) * vRun * (0.6 + 1.5 * audioKick);
    }
    else col *= 0.8;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
