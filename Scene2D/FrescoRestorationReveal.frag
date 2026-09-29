#version 330 core
out vec4 fragColor;
/**
 * @file FrescoRestorationReveal.frag
 * @brief FRESCO RESTORATION REVEAL: a chapel fresco black with centuries of
 * soot, and the restorer at work.  Beneath the grime: a lapis-blue vault
 * strewn with gold stars and two painted panels in red-and-cream Cosmati
 * frames, the photo rendered in them as soft tempera, with plaster cracks
 * and a few losses.  Over the scene arc the sponge works along the wall in
 * a serpentine, row after row -- its path is continuous, and the colour
 * comes up behind it with a ragged wet edge; the work lamp follows it.
 * The kick is the documentation camera's flash, the treble the gold
 * glinting where it has been uncovered.  Camera fixed on the scaffold.
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

float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
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
    float rows = 4.0 + floor(4.0 * clamp(gridP, 0.0, 1.0));
    float sootAmt = 0.6 + 0.4 * clamp(sootP, 0.0, 1.0);
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float lampS = 0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);

    // --- The fresco: a lapis-blue vault strewn with gold stars, and two
    // painted panels in decorated frames, the photo rendered as tempera.
    vec3 lapis = vec3(0.1, 0.22, 0.6);
    vec3 painting = lapis * (0.85 + 0.2 * fbm(p * 6.0));
    // Gold stars: round, eight-rayed glints on a jittered lattice.
    {
        vec2 g = p * 9.0;
        vec2 gi = floor(g), gf = fract(g);
        vec2 c = 0.3 + 0.4 * vec2(hash21(gi + 1.0), hash21(gi + 2.0));
        vec2 d = gf - c;
        float r = length(d);
        float a = atan(d.y, d.x);
        float star = smoothstep(0.1, 0.06, r - 0.04 * pow(abs(cos(a * 4.0)), 8.0));
        painting = mix(painting, vec3(0.95, 0.78, 0.35) * (0.9 + 0.3 * hi), star);
    }
    // Two panels with painted frames.
    float panelMask = 0.0;
    for (int k = 0; k < 2; ++k) {
        vec2 pc = vec2((k == 0) ? -0.42 : 0.42, -0.02);
        vec2 hs = vec2(0.34, 0.4);
        vec2 q = p - pc;
        vec2 aq = abs(q);
        float inner = step(aq.x, hs.x - 0.05) * step(aq.y, hs.y - 0.05);
        float frame = step(aq.x, hs.x) * step(aq.y, hs.y) * (1.0 - inner);
        if (frame > 0.0) {
            // Cosmati-style border: red and cream bands with a diamond chain.
            float t = (aq.x > hs.x - 0.05) ? q.y : q.x;
            float band = max(aq.x - (hs.x - 0.05), aq.y - (hs.y - 0.05)) / 0.05;
            float dia = abs(fract(t * 12.0) - 0.5) + abs(band - 0.5);
            vec3 fc = mix(vec3(0.62, 0.18, 0.12), vec3(0.92, 0.85, 0.7), step(dia, 0.4));
            fc = mix(fc, vec3(0.1, 0.35, 0.3), step(dia, 0.18));
            painting = fc;
        }
        if (inner > 0.0) {
            // The photo as fresco: soft, warm, matte earth colours.
            vec2 puv = (q / (hs - 0.05)) * 0.5 + 0.5;
            vec3 ph = img(clamp(vec2((puv.x + float(k)) * 0.5, puv.y), 0.0, 1.0));
            float L = dot(ph, vec3(0.3, 0.5, 0.2));
            vec3 earth = mix(vec3(0.35, 0.22, 0.14), vec3(0.95, 0.85, 0.66), L);
            vec3 fres = mix(earth, ph * vec3(1.05, 0.95, 0.8), 0.45);
            fres = mix(fres, fres * imgPalette(0.1 + hue * 0.159) * 1.4, 0.12);
            painting = fres;
            panelMask = 1.0;
        }
    }
    // Plaster: texture, cracks, a few losses showing the bare intonaco.
    painting *= 0.9 + 0.12 * fbm(p * 25.0);
    float cr = fbm(p * 5.0);
    float crack = smoothstep(0.008, 0.0, abs(cr - 0.62)) * 0.35;
    painting *= 1.0 - crack;
    float loss = smoothstep(0.72, 0.76, fbm(p * 3.0 + 11.0));
    painting = mix(painting, vec3(0.82, 0.76, 0.66), loss * 0.85);

    // --- The soot, and the cleaning: the sponge works along the wall in a
    // serpentine, row after row, continuously; behind it the colour comes up.
    vec3 soot = mix(vec3(0.07, 0.06, 0.05), painting * 0.22, 0.3 * (1.0 - sootAmt) + 0.12) * (0.7 + 0.3 * fbm(p * 8.0));
    float rowF = (1.0 - uv.y) * rows + 0.35 * (fbm(p * 7.0 + 3.0) - 0.5);   // ragged row edges
    float r = floor(rowF);
    float xr = (mod(r, 2.0) < 0.5) ? uv.x : 1.0 - uv.x;
    float cleanAt = (r + xr) / rows;
    float ragged = 0.35 * (fbm(p * 12.0) - 0.5) / rows;
    float edgeW = 0.02 / rows;
    float cleaned = smoothstep(cleanAt + ragged - edgeW, cleanAt + ragged + edgeW, prog * 1.02);
    vec3 col = mix(soot, painting, cleaned);

    // The sponge: where the cleaning front is now (continuous path).
    float rp = min(prog * 1.02, 0.9999) * rows;
    float rr = floor(rp), f = fract(rp);
    float sx = (mod(rr, 2.0) < 0.5) ? f : 1.0 - f;
    float sy = 1.0 - (rr + 0.5 + smoothstep(0.93, 1.0, f)) / rows;
    vec2 sp = vec2((sx - 0.5) * aspect, sy - 0.5);
    float dS = length(p - sp);
    // Fresh cleaning is wet: a sheen right behind the sponge.
    col += vec3(0.25, 0.27, 0.3) * exp(-dS * 18.0) * 0.5 * step(prog, 0.98);

    // The work lamp follows the sponge (smoothly); the rest of the wall is dim.
    float lamp = 0.45 + 0.8 * exp(-dS * 1.4);
    lamp = mix(lamp, 1.0, smoothstep(0.9, 1.0, prog));      // the finished wall lit whole
    col *= lamp * lampS;
    // The documentation camera's flash near the worked patch on the kick.
    col += vec3(1.0) * clamp(audioKick, 0.0, 1.0) * 0.25 * exp(-dS * 2.5);
    col *= 0.8 + 0.4 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
