#version 330 core
out vec4 fragColor;
/**
 * @file MayflyStreetLamps.frag
 * @brief MAYFLY STREET LAMPS: a summer night on an old river bridge, the
 * mayflies hatching -- around each of the bridge's lamps a dense swirling
 * cloud of insects, every one a tiny point of light caught in the glow,
 * whirling in loose orbits like snow in a lamp beam.  The row of lamps
 * recedes along the bridge in perspective, their clouds smaller with
 * distance; the iron railing stands dark, the river below mirrors the
 * lamps in long rippling streaks.  The camera is still; the swarms whirl.
 *
 * Audio Reactivity:
 *   audioHigh   -> the sparkle of the insects (light)
 *   audioBass   -> the glow of the lamps (light)
 *   audioSwell  -> the haze around the lamps (slow)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the swarms whirling (continuous)
 *
 * Per-activation variety: swarmP (how dense the swarms), hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioHigh;
uniform float audioBass;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float swarmP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float px = 1.0 / resolution.y;
    float dens = 0.5 + 0.5 * clamp(swarmP, 0.0, 1.0);

    // Night: a deep blue sky, the far bank's dark trees.
    float hz = -0.05;
    vec3 col = mix(vec3(0.03, 0.04, 0.09), vec3(0.01, 0.015, 0.04), smoothstep(hz, 0.5, p.y));
    float bank = hz + 0.03 + 0.02 * noise2(vec2(p.x * 8.0, 1.0));
    if (p.y < bank && p.y > hz) col = vec3(0.01, 0.015, 0.02);

    // The bridge's parapet runs from the lower left to a vanishing point;
    // the lamps stand on it, the river lies beyond it.
    vec2 vp = vec2(0.45, hz + 0.01);
    vec2 A = vec2(-1.0, -0.3);
    float tx = clamp((p.x - A.x) / (vp.x - A.x), 0.0, 1.0);
    float parTop = mix(A.y, vp.y, tx);
    bool onBridge = p.y < parTop && p.x < vp.x + (vp.y - p.y) * 1.3;
    float postM = 0.0, lanM = 0.0;
    vec3 lampC = mix(vec3(1.0, 0.78, 0.45), imgPalette(0.1 + hueP * 0.159) * 1.2, 0.12);
    vec3 glow = vec3(0.0);
    vec3 river = vec3(0.0);
    for (int k = 0; k < 7; ++k) {
        float fk = float(k);
        float z = 1.0 + fk * 1.1;                               // distance
        float s = 1.0 / z;
        vec2 base = mix(vp, A + vec2(0.35, 0.0), s);            // foot of the post on the parapet
        vec2 lamp = base + vec2(0.0, 0.55 * s);                 // the lantern on top
        float I = (0.8 + 0.5 * bass);
        // Post and lantern.
        float post = step(abs(p.x - base.x), 0.005 * s + px * 0.5) * step(base.y, p.y) * step(p.y, lamp.y - 0.02 * s);
        postM = max(postM, post);
        float lan = length((p - lamp) * vec2(1.0, 0.8)) - 0.02 * s;
        lanM = max(lanM, smoothstep(px, -px, lan));
        // Glow and haze around the lamp.
        float dl = length(p - lamp);
        glow += lampC * (exp(-dl / (0.04 * s)) * 0.7 + exp(-dl / (0.15 * s)) * 0.15 * (0.7 + 0.6 * swell)) * I;
        // The swarm: insects on loose orbits around the lamp, each a point of light.
        float R = 0.22 * s;
        if (dl < R * 1.6) {
            for (int i = 0; i < 110; ++i) {
                float fi = float(i);
                if (hash11(fi * 1.3 + fk * 7.0) > dens) continue;
                float rr = R * (0.15 + 0.85 * sqrt(hash11(fi * 2.1 + fk)));
                float sp = (0.5 + 0.9 * hash11(fi * 3.7 + fk)) * (hash11(fi * 5.3) > 0.5 ? 1.0 : -1.0);
                float a = T * sp + hash11(fi * 7.1 + fk) * 6.2831853;
                float tilt = hash11(fi * 9.3 + fk) * 3.14159;
                vec2 o = vec2(cos(a), sin(a) * (0.3 + 0.6 * hash11(fi * 4.4)));
                o = vec2(o.x * cos(tilt) - o.y * sin(tilt), o.x * sin(tilt) + o.y * cos(tilt)) * rr;
                o += 0.15 * rr * vec2(sin(T * 1.7 + fi), cos(T * 1.3 + fi * 2.0));
                float d = length(p - lamp - o);
                float r0 = 0.0012 + 0.0022 * s + px * 0.5;
                float tw = 0.6 + 0.4 * sin(T * 6.0 + fi * 3.0);
                float lit = exp(-length(o) / R * 1.2);
                glow += lampC * (smoothstep(r0, 0.0, d) * 1.6 + exp(-d / (r0 * 2.5)) * 0.25) * (0.6 + 1.0 * hi) * tw * lit;
            }
        }
        // The lamp mirrored in the river: a long rippling streak.
        float streak = exp(-pow((p.x - lamp.x - 0.012 * sin(p.y * 90.0 + T * 2.0 + fk)) / (0.014 * s + 0.004), 2.0));
        river += lampC * streak * exp(-(hz - p.y) * 3.0) * (0.25 + 0.3 * noise2(vec2(p.x * 40.0, p.y * 200.0 - T * 2.0))) * I;
    }
    // The river below the far bank, where the parapet does not hide it.
    if (p.y < hz && !onBridge) {
        col = vec3(0.01, 0.015, 0.03) + river;
    }
    // The parapet: dark stone, its top edge catching the lamplight.
    if (onBridge) {
        float stone = 0.8 + 0.2 * noise2(vec2(p.x * 30.0, p.y * 60.0));
        col = vec3(0.03, 0.025, 0.022) * stone;
        col += lampC * 0.18 * smoothstep(0.012, 0.0, parTop - p.y) * (0.7 + 0.4 * bass);
    }
    col = mix(col, vec3(0.03, 0.025, 0.02), postM);
    col = mix(col, lampC * 2.0, lanM);
    col += glow;

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
