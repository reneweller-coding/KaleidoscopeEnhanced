#version 330 core
out vec4 fragColor;
/**
 * @file LeafVenationGrowth.frag
 * @brief LEAF VENATION GROWTH: a leaf lit through, and the growth of its
 * veins -- the midrib first, then the secondaries branching off, then the
 * finer orders, each order switching on later in the scene arc and
 * extending smoothly from its parent.  The photo is the leaf tissue seen
 * against the light; sap light pulses along the veins with the bass; the
 * treble sparkles the tissue; the swell is the sun behind the leaf.
 * Camera still.
 *
 * Audio Reactivity:
 *   sceneProgress -> vein growth (the arc)
 *   audioBass     -> sap light along the veins (light)
 *   audioSwell    -> backlight (slow)
 *   audioHigh     -> tissue sparkle (light)
 *   audioLevel    -> brightness
 *
 * Per-activation variety: ordersP, angleP, hueP.
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
uniform float audioBass;
uniform float audioSwell;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float ordersP;
uniform float angleP;
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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float segDist(vec2 p, vec2 a, vec2 b, out float t)
{
    vec2 d = b - a; t = clamp(dot(p - a, d) / max(dot(d, d), 1e-6), 0.0, 1.0);
    return length(p - (a + d * t));
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float orders = 2.0 + 2.0 * clamp(ordersP, 0.0, 1.0);
    float branchAng = 0.6 + 0.5 * clamp(angleP, 0.0, 1.0);
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float sun = 0.6 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);

    // The leaf outline: an ellipse with a pointed tip, the midrib along x.
    float leafR = length(p * vec2(0.9, 1.9));
    float tipPinch = 1.0 - 0.25 * smoothstep(0.2, 0.7, p.x);
    float leaf = smoothstep(0.66 * tipPinch, 0.64 * tipPinch, leafR);
    // Tissue: the photo backlit, green, with the cells as a fine round pattern.
    vec3 tissue = img(gl_FragCoord.xy / resolution) * mix(vec3(0.45, 0.85, 0.3), imgPalette(hue * 0.159 + 0.3), 0.3) * 1.3 * sun;
    vec2 cu = p * 70.0; vec2 cc = floor(cu); vec2 cf = fract(cu) - 0.5;
    vec2 co = vec2(hash21(cc + 1.3), hash21(cc + 5.9)) - 0.5;
    float cellWall = smoothstep(0.2, 0.32, length(cf - co * 0.4));
    tissue *= 0.85 + 0.15 * cellWall;
    tissue += vec3(1.0) * smoothstep(0.12, 0.04, length(cf - co * 0.4)) * step(0.94, hash21(cc)) * clamp(audioHigh * 2.0, 0.0, 1.0) * 0.5;
    // Outside the leaf: the sky behind, bright.
    vec3 sky = mix(vec3(0.85, 0.9, 0.75), imgPalette(hue * 0.159 + 0.6), 0.3) * sun;
    vec3 col = mix(sky, tissue, leaf);

    // Veins: midrib (order 0) from the base at x = -0.6 to the tip; secondaries
    // branch from it at intervals, tertiaries from those.  Each grows from its
    // origin at a rate; order k begins at prog = k / (orders + 1).
    float vein = 0.0; float sap = 0.0;
    // Midrib.
    float t0;
    float g0 = smoothstep(0.0, 0.35, prog);
    float d0 = segDist(p, vec2(-0.62, 0.0), vec2(-0.62 + 1.25 * g0, 0.0), t0);
    vein = max(vein, smoothstep(0.012, 0.004, d0));
    sap = max(sap, exp(-d0 * 60.0) * pow(0.5 + 0.5 * sin(t0 * 20.0 - sceneAdvance * 3.0), 6.0));
    // Secondaries: pairs at 9 stations, angled forward.
    for (int i = 0; i < 9; ++i)
    {
        float fi = float(i);
        float x0 = -0.52 + fi * 0.13;
        float start = 0.2 + fi * 0.05;
        float g1 = smoothstep(start, start + 0.3, prog) * step(x0, -0.62 + 1.25 * g0);
        float len = (0.32 - fi * 0.022) * g1;
        for (int side = -1; side <= 1; side += 2)
        {
            vec2 a = vec2(x0, 0.0);
            vec2 dir = normalize(vec2(cos(branchAng), float(side) * sin(branchAng)));
            dir += vec2(0.0, float(side) * 0.15 * (fi / 9.0));
            vec2 b = a + normalize(dir) * len;
            float t1;
            float d1 = segDist(p, a, b, t1);
            vein = max(vein, smoothstep(0.007, 0.002, d1) * g1);
            sap = max(sap, exp(-d1 * 90.0) * pow(0.5 + 0.5 * sin(t1 * 14.0 - sceneAdvance * 2.5 + fi), 6.0) * g1);
            // Tertiaries: small branches off each secondary, later in the arc.
            if (orders > 2.5)
            {
                for (int j = 1; j <= 3; ++j)
                {
                    float fj = float(j);
                    float g2 = smoothstep(start + 0.3, start + 0.55, prog) * g1;
                    vec2 a2 = a + normalize(dir) * len * (fj / 4.0);
                    vec2 dir2 = normalize(vec2(cos(branchAng * 1.4), float(side) * sin(branchAng * 1.4)));
                    vec2 b2 = a2 + dir2 * 0.09 * g2 * (1.0 - fi / 12.0);
                    float t2;
                    float d2 = segDist(p, a2, b2, t2);
                    vein = max(vein, smoothstep(0.004, 0.001, d2) * g2);
                }
            }
        }
    }
    vein *= leaf;
    vec3 veinCol = mix(vec3(0.85, 0.95, 0.6), imgPalette(hue * 0.159 + 0.15), 0.3) * sun;
    col = mix(col, veinCol, vein * 0.9);
    col += imgPalette(hue * 0.159 + 0.9) * sap * leaf * (0.2 + 1.0 * bass);
    // The sun behind the leaf.
    col += vec3(1.0, 0.95, 0.8) * exp(-length(p - vec2(0.2, 0.3)) * 3.0) * 0.25 * sun * (1.0 - leaf * 0.6);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
