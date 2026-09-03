#version 330 core
out vec4 fragColor;
/**
 * @file HaboobDustWall.frag
 * @brief HABOOB DUST WALL: a wall of dust a kilometre high rolling over a
 * desert town.  The wall advances steadily on the scene clock (it never
 * quite arrives: the front breathes forward and back over a long period),
 * its height follows the swell, its face boils with round-lobed billows,
 * lightning flickers inside it on the kick, and the town -- the photo --
 * is swallowed from the far edge in.  The camera stands in the street.
 *
 * Audio Reactivity:
 *   sceneAdvance -> the wall's advance and the billowing (continuous)
 *   audioSwell   -> wall height (slow)
 *   audioKick    -> lightning inside the dust (light)
 *   audioBass    -> the dusk glow through the dust (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: heightP, billowP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioKick;
uniform float audioBass;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float heightP;
uniform float billowP;
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
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = p * 2.03 + 5.0; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float wallH = (0.65 + 0.35 * clamp(heightP, 0.0, 1.0)) * (0.75 + 0.4 * clamp(audioSwell, 0.0, 1.0));
    float billow = 0.5 + 0.8 * clamp(billowP, 0.0, 1.0);
    float clock = sceneAdvance * 0.4 + sceneTime * 0.08;
    // The front: the wall's near edge in screen depth, advancing and
    // breathing back on a long period (so it never simply passes through).
    float front = 0.35 + 0.25 * sin(clock * 0.15 + 1.0);         // 0 = at the camera, 1 = far
    float ground = -0.3;

    // Dusk sky, orange through the dust already in the air, darker above.
    vec3 dust = mix(vec3(0.85, 0.55, 0.25), imgPalette(hue * 0.159 + 0.05), 0.3);
    vec3 sky = mix(dust * 0.9, vec3(0.25, 0.15, 0.12), smoothstep(-0.1, 0.5, p.y));
    sky += dust * 0.4 * clamp(audioBass, 0.0, 1.0) * (1.0 - smoothstep(-0.2, 0.3, p.y));
    // The town: the photo as the street ahead, with buildings; depth by height.
    float depth = clamp((p.y - ground) / 0.35, 0.0, 1.0);                // 0 near .. 1 far along the street
    vec3 town = img(vec2(p.x / aspect + 0.5, (p.y + 0.5) * 0.7)) * mix(vec3(0.9, 0.8, 0.65), imgPalette(hue * 0.159 + 0.1), 0.3);
    town *= 0.6 + 0.4 * (1.0 - depth);
    float skyline = -0.05 + 0.15 * fbm(vec2(p.x * 3.0, 2.0));
    vec3 col = mix(sky, town, step(p.y, skyline));
    // The wall: it covers the scene from the front depth outward; its face
    // is a boiling field of round billows (fbm lobes), its top ragged.
    float wallTop = ground + wallH + 0.08 * fbm(vec2(p.x * 2.5 + clock * 0.5, 3.0)) * billow;
    float wallDepth = 1.0 - front;                                        // how far it has come
    // In screen space the wall stands at a depth; pixels "behind" it (far
    // side of the street and the sky above the far side) are inside it.
    float behind = smoothstep(front - 0.08, front + 0.08, depth);        // ground pixels beyond the front
    float inWall = max(behind, step(skyline, p.y)) * step(p.y, wallTop);
    inWall = max(inWall, step(skyline, p.y) * step(p.y, wallTop));
    vec2 wq = vec2(p.x * 2.0 + clock * 0.3, p.y * 3.0 - clock * 0.6);
    float lobes = fbm(wq * billow) * 0.6 + fbm(wq * 3.0 * billow + 7.0) * 0.4;
    vec3 wallCol = dust * (0.55 + 0.6 * lobes);
    wallCol *= 0.5 + 0.5 * smoothstep(wallTop, ground, p.y);             // darker toward the base
    // Lightning inside the dust: a diffuse flash with a branching shape on the kick.
    float bolt = pow(fbm(vec2(p.x * 8.0, p.y * 3.0 + clock)), 4.0) * 6.0;
    wallCol += vec3(1.0, 0.95, 0.85) * (0.3 + bolt) * audioKick * 0.8 * inWall;
    // The wall's edge: a softer boundary where the dust thins.
    float edgeSoft = smoothstep(wallTop, wallTop - 0.08, p.y);
    col = mix(col, wallCol, inWall * edgeSoft);
    // Dust in the air in front of the wall: round motes streaming on the clock.
    vec2 mu = (p + vec2(-clock * 0.6, 0.0)) * 50.0; vec2 mc = floor(mu); vec2 mf = fract(mu) - 0.5;
    vec2 mo = vec2(hash21(mc + 1.3), hash21(mc + 5.9)) - 0.5;
    float motes = smoothstep(0.2, 0.06, length(mf - mo * 0.6)) * step(0.93, hash21(mc));
    col = mix(col, dust * 1.1, motes * 0.5);
    // Haze over everything near the wall.
    col = mix(col, dust, 0.15 * (1.0 - front));
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
