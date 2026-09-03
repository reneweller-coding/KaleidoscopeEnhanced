#version 330 core
out vec4 fragColor;
/**
 * @file GlacierCrevasseDescent.frag
 * @brief GLACIER CREVASSE DESCENT: a steady descent into a blue crevasse.
 * The walls are old ice -- layered, veined, lit from the sky far above so
 * they glow deep blue near the top and fall into indigo dark below; ice
 * crystals in the walls glint with the treble; the sub-bass is the glacier's
 * groan, felt as light welling from the depth; drips of meltwater fall as
 * round drops on the scene clock.  The crevasse narrows and widens along
 * its length (slowly, on the descent), never with the beat.  The camera
 * descends at constant pace; it never jolts.
 *
 * Audio Reactivity:
 *   sceneAdvance -> the descent (continuous)
 *   audioHigh    -> crystal glint (light)
 *   audioSubBass -> deep light (light)
 *   audioSwell   -> skylight strength (slow)
 *   audioKick    -> a drop catches the light (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: widthP, veinP (vein density), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioHigh;
uniform float audioSubBass;
uniform float audioSwell;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float widthP;
uniform float veinP;
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
    float halfW = 0.55 + 0.3 * clamp(widthP, 0.0, 1.0);
    float veins = 3.0 + 4.0 * clamp(veinP, 0.0, 1.0);
    float descent = sceneAdvance * 0.9 + sceneTime * 0.2;

    // Looking down: the crevasse is a slot of width 2*halfW(y) running away
    // below us; depth from the eye maps to screen radius.  Two walls (left
    // and right), the slot between them opens to the dark below.
    vec3 ro = vec3(0.0, 0.0, 0.0);
    vec3 rd = normalize(vec3(p.x, -1.0, p.y * 0.9));      // looking down (-y), z forward
    // Walls at x = +-halfW(depth); solve for the hit with the nearer wall.
    float side = (rd.x > 0.0) ? 1.0 : -1.0;
    // The width varies with depth (slowly): iterate a few times.
    float t = 0.1; float w = halfW;
    for (int i = 0; i < 4; ++i)
    {
        float depth = -(ro.y + rd.y * t) + descent;
        w = halfW * (0.75 + 0.35 * sin(depth * 0.35) + 0.15 * sin(depth * 0.9 + 1.0));
        t = (side * w - ro.x) / max(abs(rd.x), 1e-3) * (rd.x > 0.0 ? 1.0 : 1.0);
        t = abs(t);
    }
    vec3 hit = ro + rd * t;
    float depth = -hit.y + descent;                       // depth below the surface

    vec3 col;
    // Blue ice colour ramps: bright cyan-blue near the surface, indigo deep.
    vec3 shallow = mix(vec3(0.55, 0.85, 1.0), imgPalette(hue * 0.159 + 0.55), 0.3);
    vec3 deep    = mix(vec3(0.02, 0.05, 0.18), imgPalette(hue * 0.159 + 0.6) * 0.2, 0.4);
    float sky = exp(-depth * 0.09) * (0.8 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    // Wall texture: layers (annual bands), veins of bubbles, a faint photo.
    vec2 wuv = vec2(hit.z * 0.5, depth * 0.5);
    float layers = 0.5 + 0.5 * sin(depth * veins + fbm(wuv * 2.0) * 3.0);
    float vein = smoothstep(0.55, 0.75, fbm(wuv * 3.5 + 7.0));
    vec3 ice = mix(deep, shallow, sky);
    ice *= 0.45 + 0.7 * layers;
    ice += vec3(0.6, 0.8, 1.0) * vein * 0.5 * sky;
    ice = mix(ice, img(fract(wuv * 0.3)) * shallow, 0.12 * sky);
    // Crystal glints: round sparkles in the wall, brighter on the treble.
    vec2 gu = wuv * 18.0; vec2 cell = floor(gu); vec2 f = fract(gu) - 0.5;
    vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
    float glint = smoothstep(0.22, 0.03, length(f - off * 0.6)) * step(0.93, hash21(cell));
    ice += vec3(0.8, 0.95, 1.0) * glint * (0.2 + 1.2 * clamp(audioHigh * 2.0, 0.0, 1.0)) * sky;
    // The glacier's groan: light welling from the depth on the sub-bass.
    ice += imgPalette(hue * 0.159 + 0.5) * exp(-max(4.0 - depth, 0.0) * 0.4) * 0.35 * clamp(audioSubBass, 0.0, 1.0);
    col = ice;
    // Meltwater drops: round, falling on the scene clock down the slot.
    for (int k = 0; k < 6; ++k)
    {
        float fk = float(k);
        float ph = fract(descent * 0.25 * (0.7 + 0.3 * hash21(vec2(fk, 1.0))) + hash21(vec2(fk, 2.0)));
        float dz = 0.8 + 3.0 * hash21(vec2(fk, 3.0));
        float dd = 0.5 + 6.0 * ph;                         // depth of the drop
        vec3 dp = vec3((hash21(vec2(fk, 4.0)) - 0.5) * w * 1.4, -(dd - descent) , dz);
        // Project the drop to screen.
        vec2 sp = vec2(dp.x, dp.z) / max(-dp.y, 0.1) * vec2(1.0, 1.0 / 0.9);
        float ds = length(p - vec2(sp.x, sp.y));
        float sz = 0.02 / max(-dp.y, 0.3);
        float drop = smoothstep(sz, sz * 0.4, ds) * step(0.0, -dp.y) * step(-dp.y, 8.0);
        col += vec3(0.8, 0.95, 1.0) * drop * (0.4 + 1.0 * audioKick);
    }
    // The dark below, and fog with depth.
    float fog = 1.0 - exp(-t * 0.08);
    col = mix(col, deep * 0.5, clamp(fog, 0.0, 0.9));
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
