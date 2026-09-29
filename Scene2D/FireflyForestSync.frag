#version 330 core
out vec4 fragColor;
/**
 * @file FireflyForestSync.frag
 * @brief FIREFLY FOREST SYNC: a forest on a June night where the fireflies
 * flash in synchrony -- among the dark trunks and ferns thousands of
 * small yellow-green lights, and their flashes run through the woods in
 * waves: a burst sweeps across from one side, the whole forest lights up
 * in a ripple of points, then darkness, then the next wave.  The trunks
 * stand in layers receding into blue night mist, the ferns catch the
 * glow.  The camera is still; the fireflies drift slowly.
 *
 * Audio Reactivity:
 *   audioKick   -> the strength of the flash waves (light)
 *   audioSwell  -> the night mist (slow)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the waves running, the fireflies drifting
 *
 * Per-activation variety: swarmP (how many fireflies), hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioKick;
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
vec2 hash22(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float px = 1.0 / resolution.y;
    float dens = 0.45 + 0.5 * clamp(swarmP, 0.0, 1.0);

    // Night: blue mist between the trunks, darker toward the ground.
    vec3 mist = vec3(0.05, 0.09, 0.15) * (0.8 + 0.6 * swell);
    vec3 col = mist * (0.6 + 0.6 * smoothstep(-0.4, 0.3, p.y));
    vec3 ffC = mix(vec3(0.75, 1.0, 0.25), imgPalette(0.2 + hueP * 0.159) * vec3(1.0, 1.2, 0.5), 0.12);

    // The flash waves: a front sweeping across the forest, then a pause.
    float period = 7.0;
    float wavePos = fract(T / period) * 3.2 - 1.3;               // the front's x position
    float bursts = 1.0 + 0.8 * kick;

    // Layers of trunks from far to near; fireflies between the layers.
    for (int L = 0; L < 4; ++L) {
        float fl = float(L);
        float depth = 1.0 - fl / 3.0;                             // 1 far .. 0 near
        float sc = 0.4 + fl * 0.5;
        // Fireflies in this layer: round points, drifting slowly.
        vec2 g = p * (38.0 - fl * 8.0) + vec2(fl * 13.0, 0.0);
        vec2 gi = floor(g);
        for (int j = -1; j <= 1; ++j)
        for (int i = -1; i <= 1; ++i) {
            vec2 id = gi + vec2(i, j);
            if (hash21(id + fl * 7.0) > dens * 0.65) continue;
            vec2 c = id + 0.5 + 0.35 * vec2(sin(T * 0.15 + hash21(id) * 20.0), cos(T * 0.12 + hash21(id + 1.0) * 20.0));
            vec2 cp = c / (38.0 - fl * 8.0) - vec2(fl * 13.0, 0.0) / (38.0 - fl * 8.0);
            // Each flash when the wave passes, with a little individual delay.
            float delay = (cp.x - wavePos) * 2.2 + 0.3 * hash21(id + 3.0);
            float flash = exp(-delay * delay * 3.0) * bursts * 2.0;
            // A dim constant glimmer between waves, some out of step.
            float own = pow(max(0.0, sin(T * 1.3 + hash21(id + 5.0) * 40.0)), 16.0) * 0.4;
            float I = flash + own;
            float d = length(g - c);
            float r0 = 0.08 + 0.04 * fl;
            col += ffC * (smoothstep(r0, 0.0, d) * 1.5 + exp(-d / (r0 * 2.0)) * 0.25) * I * (0.5 + 0.5 * (1.0 - depth));
        }
        // Trunks of this layer: vertical, slightly tapering, with bark texture.
        float tx = p.x * (6.0 - fl * 1.1) + fl * 3.7;
        float ti = floor(tx);
        for (int k = -1; k <= 1; ++k) {
            float id = ti + float(k);
            if (hash11(id * 1.7 + fl * 5.0) < 0.4) continue;
            float cx = id + 0.5 + 0.3 * (hash11(id * 2.3 + fl) - 0.5);
            float w = (0.08 + 0.12 * hash11(id * 3.1 + fl)) * (1.0 + 0.1 * p.y);
            float dx = (tx - cx) / w;
            float cov = smoothstep(1.0 + 0.05 * sc, 1.0 - 0.05 * sc, abs(dx));
            if (cov > 0.0) {
                // Lit from within the forest by the passing wave on one side.
                float lit = exp(-pow((p.x - wavePos) * 1.5, 2.0)) * bursts * 0.15;
                vec3 bark = vec3(0.02, 0.025, 0.03) * (0.7 + 0.5 * noise2(vec2(dx * 3.0, p.y * 30.0)));
                bark = mix(bark, mist * 0.8, depth * 0.6);
                bark += ffC * lit * (0.5 + 0.5 * dx) * (1.0 - depth * 0.5);
                col = mix(col, bark, cov);
            }
        }
    }
    // Ferns and undergrowth along the bottom, catching the glow.
    float fern = smoothstep(0.55, 0.7, fbm(vec2(p.x * 10.0, p.y * 14.0)) + smoothstep(-0.25, -0.5, p.y) * 0.6);
    float glowG = exp(-pow((p.x - wavePos) * 1.8, 2.0)) * bursts;
    col = mix(col, vec3(0.02, 0.04, 0.02) + ffC * 0.08 * glowG, fern * smoothstep(-0.2, -0.4, p.y));
    // A faint haze of light where the wave is.
    col += ffC * 0.03 * glowG * smoothstep(0.4, -0.3, p.y);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
