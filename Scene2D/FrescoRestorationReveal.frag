#version 330 core
out vec4 fragColor;
/**
 * @file FrescoRestorationReveal.frag
 * @brief FRESCO RESTORATION REVEAL: a fresco black with centuries of soot,
 * and the restorer at work -- patch by patch the cleaning reveals the
 * painting (the photo) beneath, over the scene arc; the cleaned squares
 * appear in the order a conservator works (rows across), each patch
 * fading from soot to colour smoothly.  The lamp is the swell, the kick a
 * flash of the camera documenting the work, the treble the gold-leaf
 * halos glinting where they have been uncovered.  Camera fixed on the
 * scaffold.
 *
 * Audio Reactivity:
 *   sceneProgress -> cleaning progress (the arc)
 *   audioSwell    -> the work lamp (slow)
 *   audioKick     -> camera flash (light)
 *   audioHigh     -> gold glints (light)
 *   audioLevel    -> brightness
 *
 * Per-activation variety: gridP, sootP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float sceneProgress;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float gridP;
uniform float sootP;
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
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 5.0; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);
    vec2 uv = gl_FragCoord.xy / resolution;

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float cols = 8.0 + 8.0 * clamp(gridP, 0.0, 1.0);
    float rows = floor(cols * 0.6);
    float sootAmt = 0.6 + 0.4 * clamp(sootP, 0.0, 1.0);
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float lamp = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);

    // The fresco beneath: the photo as tempera on plaster, slightly matte,
    // with plaster cracks; halos of gold where the picture is brightest.
    vec3 painting = img(uv);
    painting = mix(painting, painting * imgPalette(hue * 0.159 + 0.1) * 1.4, 0.2);
    float plaster = 0.9 + 0.1 * fbm(p * 20.0);
    painting *= plaster;
    float crack = smoothstep(0.62, 0.66, fbm(p * 6.0)) * (1.0 - smoothstep(0.66, 0.7, fbm(p * 6.0)));
    painting *= 1.0 - 0.5 * crack;
    float bright = smoothstep(0.7, 0.95, dot(img(uv), vec3(0.333)));
    vec3 gold = vec3(0.95, 0.8, 0.4);
    painting = mix(painting, gold * (0.95 + 0.25 * hi), bright * 0.6);
    // The soot: dark grime with the painting barely showing through.
    vec3 soot = mix(vec3(0.08, 0.07, 0.06), painting * 0.25, 0.4 * (1.0 - sootAmt) + 0.15) * (0.7 + 0.3 * fbm(p * 8.0));
    // The cleaning grid: patch (i, j) is cleaned in row-major order over
    // the arc; each patch crossfades over its own slice, with a ragged
    // edge (the sponge does not follow the tape exactly).
    vec2 g = vec2(uv.x * cols, (1.0 - uv.y) * rows);
    vec2 cell = floor(g);
    float order = (cell.y * cols + cell.x) / (cols * rows);
    float slice = 1.0 / (cols * rows);
    float ragged = 0.3 * (fbm(p * 15.0) - 0.5) * slice * 4.0;
    float cleaned = smoothstep(order + ragged, order + slice * 1.5 + ragged, prog);
    vec3 col = mix(soot, painting, cleaned) * lamp;
    // The patch being worked now: a wet sheen and the sponge circle.
    float nowOrder = floor(prog * cols * rows);
    vec2 nowCell = vec2(mod(nowOrder, cols), floor(nowOrder / cols));
    vec2 nowCentre = vec2((nowCell.x + 0.5) / cols, 1.0 - (nowCell.y + 0.5) / rows);
    float sponge = exp(-length((uv - nowCentre) * vec2(aspect, 1.0)) * 12.0);
    col += vec3(0.3, 0.3, 0.35) * sponge * 0.5 * step(prog, 0.999);
    // The grid tape lines, faint, over the uncleaned area.
    vec2 gf = abs(fract(g) - 0.5);
    float tape = smoothstep(0.03, 0.0, min(gf.x, gf.y) - 0.47) * (1.0 - cleaned) * 0.3;
    col += vec3(0.5, 0.45, 0.35) * tape * lamp;
    // The lamp falloff and the camera flash on the kick.
    col *= 0.6 + 0.6 * exp(-length(uv - nowCentre) * 1.2) + 0.2;
    col += vec3(1.0) * audioKick * 0.3 * exp(-length((uv - nowCentre) * vec2(aspect, 1.0)) * 2.5);   // the flash near the worked patch, not the whole wall
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
