#version 330 core
out vec4 fragColor;
/**
 * @file CherryBlossomFront.frag
 * @brief CHERRY BLOSSOM FRONT: the sakura front sweeping up a country --
 * a map-like landscape of hills (the photo) seen from above at an angle,
 * over which the blossom front advances during the scene arc, turning the
 * trees from bare to pink to green behind it; petals (round) drift on the
 * scene clock; the swell is the spring light, the treble the petal
 * glitter, the kick a gust that brightens the falling petals.  Camera
 * fixed high over the land.
 *
 * Audio Reactivity:
 *   sceneProgress -> the front's advance (the arc)
 *   sceneAdvance  -> petal drift (continuous)
 *   audioSwell    -> spring light (slow)
 *   audioHigh     -> petal glitter (light)
 *   audioKick     -> gust light (light)
 *   audioLevel    -> brightness
 *
 * Per-activation variety: hillsP, petalP, hueP.
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
uniform float audioHigh;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float hillsP;
uniform float petalP;
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

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float hills = 0.5 + 0.5 * clamp(hillsP, 0.0, 1.0);
    float petals = 0.5 + 0.5 * clamp(petalP, 0.0, 1.0);
    float spring = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float clock = sceneAdvance * 0.4 + sceneTime * 0.08;

    // The land: the photo as terrain seen from above at an angle (a mild
    // perspective: the top is farther), with hills from fbm shading.
    float persp = 1.0 / (1.0 + (p.y + 0.5) * 0.8);
    vec2 land = vec2(p.x * persp * 0.6 + 0.5, (p.y + 0.5) * 0.7);
    vec3 ground = img(clamp(land, 0.0, 1.0));
    float relief = fbm(land * 8.0) * hills;
    float slope = fbm(land * 8.0 + vec2(0.02, 0.0)) * hills - relief;
    ground *= 0.7 + 0.5 * relief + 3.0 * slope;
    // The front: a wavy line moving up the land (south to north) over the
    // arc; behind it (south) the trees have bloomed and are greening,
    // at it they are pink, ahead of it bare.
    float frontY = -0.55 + 1.3 * prog + 0.06 * fbm(vec2(p.x * 3.0 + 1.0, prog * 2.0));
    float behind = smoothstep(0.0, 0.08, frontY - p.y);           // 1 south of the front
    float atFront = exp(-pow((p.y - frontY) / 0.12, 2.0));
    float greening = smoothstep(0.1, 0.6, frontY - p.y);           // greening well behind
    vec3 bare = mix(ground * 0.7, vec3(0.45, 0.4, 0.35), 0.3) * spring * 0.8;
    vec3 pink = mix(vec3(1.0, 0.75, 0.85), imgPalette(hue * 0.159 + 0.95), 0.25) * spring;
    vec3 green = mix(ground, vec3(0.45, 0.7, 0.35), 0.4) * spring;
    // Trees: round crowns on a jittered grid, coloured by their state.
    vec2 tu = land * 40.0; vec2 tc = floor(tu); vec2 tf = fract(tu) - 0.5;
    vec2 to = vec2(hash21(tc + 3.1), hash21(tc + 7.7)) - 0.5;
    float crown = smoothstep(0.32, 0.22, length(tf - to * 0.6)) * step(0.35, hash21(tc)) * step(0.15, relief);
    vec3 treeCol = mix(bare, pink, atFront + behind * (1.0 - greening));
    treeCol = mix(treeCol, green, greening);
    vec3 col = mix(ground * spring * (0.6 + 0.4 * behind), treeCol, crown);
    // The front itself glows faintly pink (the bloom at its peak).
    col += pink * atFront * 0.25;
    // Petals: round, drifting on the clock across the bloomed region, glittering on the treble, brighter in the gust.
    for (int layer = 0; layer < 2; ++layer)
    {
        float fl = float(layer);
        vec2 pu = (p + vec2(clock * (0.25 + 0.15 * fl) + 0.03 * sin(clock * 2.0 + fl), -clock * (0.12 + 0.08 * fl))) * (30.0 + 15.0 * fl);
        vec2 pc = floor(pu); vec2 pf = fract(pu) - 0.5;
        vec2 po = vec2(hash21(pc + 1.3), hash21(pc + 5.9)) - 0.5;
        float petal = smoothstep(0.2, 0.06, length(pf - po * 0.6)) * step(1.0 - 0.15 * petals, hash21(pc)) * behind;
        col = mix(col, pink * 1.2, petal * 0.9);
        col += vec3(1.0) * petal * (clamp(audioHigh * 2.0, 0.0, 1.0) * 0.4 + audioKick * 0.5);
    }
    // Haze toward the north (far).
    col = mix(col, vec3(0.85, 0.9, 0.95) * spring, smoothstep(0.1, 0.5, p.y) * 0.4);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
