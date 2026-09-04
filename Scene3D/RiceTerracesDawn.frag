#version 330 core
out vec4 fragColor;
/**
 * @file RiceTerracesDawn.frag
 * @brief RICE TERRACES DAWN: a hillside of flooded paddies at sunrise.
 * Every paddy floor is a mirror lying flat on the hill, so the sky (the
 * photo) is repeated across the slope in a hundred separate panes, each
 * offset by its own height; the bunds between them are dark earth with a
 * line of grass.  The sun rises over the scene arc, so the mirrors turn
 * from grey through pink to gold; the bass is the water's sheen, the
 * treble the sparkle where a breeze crosses one pane.  Camera fixed.
 *
 * Audio Reactivity:
 *   sceneProgress -> the sunrise (the arc)
 *   audioSwell    -> daylight and haze (slow)
 *   audioBass     -> the sky in the water (slow)
 *   audioHigh     -> breeze sparkle on a pane (light)
 *   audioKick     -> an egret lifting (light)
 *
 * Per-activation variety: camHP, detailP, stepsP, hueP.
 */
in vec3  vWorld;
in vec2  vSurfUV;
in vec3  vNormal;
in float vPaddy;
in float vLevel;
in float vDist;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float time;
uniform float sceneAdvance;
uniform float sceneTime;
uniform float sceneProgress;
uniform float audioAdvance;
uniform float audioLevel;
uniform float audioKick;
uniform float audioBass;
uniform float audioHigh;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioValence;
uniform float camHP;
uniform float stepsP;
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
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 6.9; a *= 0.5; } return v; }

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float day = 0.6 + 0.4 * clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.4 + sceneTime * 0.08;
    vec3 n = normalize(vNormal);
    // The sun climbs over the arc and warms as it goes.
    float sunH = mix(-0.05, 0.55, prog);
    vec3 L = normalize(vec3(0.5, 0.15 + sunH, -0.7));
    vec3 sunCol = mix(vec3(1.0, 0.45, 0.3), vec3(1.0, 0.95, 0.8), smoothstep(0.0, 0.5, sunH));
    sunCol = mix(sunCol, imgPalette(hue * 0.159 + 0.1), 0.25);
    float diff = max(dot(n, L), 0.0);

    // The bunds: wet earth with a fringe of grass along the top.
    vec3 earth = mix(vec3(0.26, 0.2, 0.14), imgPalette(hue * 0.159 + 0.12) * 0.5, 0.3);
    earth *= 0.7 + 0.5 * fbm(vWorld.xz * 1.6);
    vec3 grass = mix(vec3(0.2, 0.35, 0.14), imgPalette(hue * 0.159 + 0.33) * 0.6, 0.3);
    float fringe = smoothstep(0.18, 0.32, vPaddy);
    vec3 bund = mix(earth, grass, fringe * 0.7);
    vec3 col = bund * (0.25 + 0.65 * diff) * day * 0.8;

    // The paddy water: a flat mirror.  Because the floor is level, the sky
    // it reflects depends only on the terrace, which is what gives the
    // hillside its hundred separate panes.
    float water = smoothstep(0.15, 0.35, vPaddy);
    if (water > 0.001)
    {
        // Each terrace reflects a slightly different slice of the sky.
        float slice = fract(vLevel * 0.37);
        vec2 skyUV = clamp(vec2(fract(vWorld.x * 0.004 + slice), 0.55 + 0.4 * slice), 0.0, 1.0);
        vec3 sky = (img(skyUV) * 0.55 + 0.4) * mix(vec3(0.8, 0.85, 1.0), imgPalette(hue * 0.159 + 0.55), 0.25);
        // The dawn colour lies over the whole reflection.
        sky = mix(sky, sky * sunCol * 1.5, 0.45 + 0.3 * (1.0 - prog));
        sky *= 0.8 + 0.6 * bass;
        // A breeze crossing one pane at a time: a band of ruffled water.
        float breeze = smoothstep(0.55, 0.85, fbm(vec2(vWorld.x * 0.06 + clock * 0.35, vLevel * 1.3)));
        sky *= 1.0 - 0.3 * breeze;
        sky += vec3(1.0) * breeze * hi * 0.5;
        // Young rice: fine green stipple standing in the shallow water.
        vec2 rg = vWorld.xz * 3.2;
        vec2 rc = floor(rg), rf = fract(rg) - 0.5;
        vec2 rj = vec2(hash21(rc + 2.3), hash21(rc + 7.1)) - 0.5;
        float shoot = smoothstep(0.24, 0.08, length(rf - rj * 0.7)) * step(0.35, hash21(rc + 5.5));
        sky = mix(sky, grass * (0.5 + 0.8 * diff) * 1.3, shoot * 0.55 * smoothstep(0.0, 0.6, prog));
        // The sun's own glare where it lines up with a pane.
        float glare = pow(max(dot(reflect(-L, n), normalize(vec3(0.0, 0.2, -1.0))), 0.0), 40.0);
        sky += sunCol * glare * 1.8;
        col = mix(col, sky * day * 1.25, water * 0.96);
    }
    // The bund edge catches the low sun as a bright rule.
    col += sunCol * smoothstep(0.28, 0.34, vPaddy) * (1.0 - smoothstep(0.34, 0.42, vPaddy)) * (0.25 + 0.5 * day);
    // An egret lifting off, low over the terraces.
    float bph = fract(clock * 0.08);
    vec3 bird = vec3(mix(-40.0, 40.0, bph), 6.0 + 5.0 * sin(bph * 3.14159), 55.0);
    col += vec3(1.0, 0.98, 0.95) * exp(-length(vWorld - bird) * 0.5) * audioKick * 1.3;
    // Dawn mist lying in the valley, and distance haze.
    float mist = smoothstep(14.0, 2.0, vWorld.y) * smoothstep(20.0, 90.0, vDist) * (0.35 + 0.4 * (1.0 - prog));
    vec3 mistCol = mix(vec3(0.85, 0.82, 0.85), sunCol, 0.35) * day;
    col = mix(col, mistCol, clamp(mist, 0.0, 0.7));
    float fog = 1.0 - exp(-max(vDist - 30.0, 0.0) * 0.007);
    col = mix(col, mistCol * 1.05, clamp(fog, 0.0, 0.85));
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
