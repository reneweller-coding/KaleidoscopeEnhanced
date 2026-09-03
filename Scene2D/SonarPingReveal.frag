#version 330 core
out vec4 fragColor;
/**
 * @file SonarPingReveal.frag
 * @brief SONAR PING REVEAL: a bat's cave, or a submarine's sea -- the
 * scene (the photo) exists only where an echo has returned.  Pings leave
 * the centre on the scene clock as expanding rings; where a ring passes,
 * the photo lights up along the ring and fades behind it, so the world is
 * painted in sweeps of returning sound.  The kick fires a bright extra
 * ping, the treble is the echo detail, the bass the hum of the emitter.
 * Camera still.
 *
 * Audio Reactivity:
 *   sceneAdvance -> ping launches and expansion (continuous)
 *   audioKick    -> a bright ping (light)
 *   audioHigh    -> echo detail (light)
 *   audioBass    -> emitter hum (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: rateP, fadeP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioHigh;
uniform float audioBass;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float rateP;
uniform float fadeP;
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

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);
    vec2 uv = gl_FragCoord.xy / resolution;

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float rate = 0.35 + 0.45 * clamp(rateP, 0.0, 1.0);
    float fadeLen = 0.25 + 0.45 * clamp(fadeP, 0.0, 1.0);
    float clock = sceneAdvance * 0.6 + sceneTime * 0.12;
    float r = length(p);
    float a = atan(p.y, p.x);

    // The scene: the photo, but only where echoes have lit it.
    vec3 photo = img(uv);
    photo = mix(photo, photo * imgPalette(hue * 0.159 + 0.5) * 1.6, 0.25);
    // Echo detail: the edges of the photo return stronger (the treble).
    vec2 e = vec2(1.5) / resolution;
    float edge = length(vec2(dot(img(uv + vec2(e.x, 0.0)) - img(uv - vec2(e.x, 0.0)), vec3(0.333)), dot(img(uv + vec2(0.0, e.y)) - img(uv - vec2(0.0, e.y)), vec3(0.333)))) * 5.0;
    edge = clamp(edge, 0.0, 1.0) * clamp(audioHigh * 2.0, 0.0, 1.0);

    // Pings: several rings in flight at once, each on its own phase; a
    // ring lights the photo at its front and leaves a fading wake behind.
    float lit = 0.0; float front = 0.0;
    for (int k = 0; k < 5; ++k)
    {
        float fk = float(k);
        float ph = fract(clock * rate + fk * 0.2);
        float rr = ph * 1.2;                                   // ring radius
        float behind = rr - r;                                 // >0 inside the ring (already passed)
        float wake = exp(-max(behind, 0.0) / fadeLen) * step(0.0, behind);
        float ringLine = exp(-abs(behind) * 40.0);
        // Angular texture on the ring: the echo is not uniform.
        float angMod = 0.8 + 0.2 * sin(a * 12.0 + fk * 2.0 + clock);
        lit = max(lit, wake * angMod * (1.0 - smoothstep(0.85, 1.0, ph)));
        front += ringLine * (1.0 - smoothstep(0.85, 1.0, ph));
    }
    // The kick ping: an extra bright ring that leaves the centre with the kick.
    float kickRing = exp(-abs(r - fract(clock * rate * 2.0) * 1.2) * 30.0) * audioKick;
    vec3 ringCol = mix(vec3(0.4, 1.0, 0.7), imgPalette(hue * 0.159 + 0.35), 0.4);
    vec3 col = photo * lit * 1.2 + photo * edge * lit * 0.8;
    col += ringCol * front * 0.6 + ringCol * kickRing * 1.5;
    // The emitter at the centre hums with the bass; a faint grid of the sonar display.
    col += ringCol * exp(-r * 12.0) * (0.3 + 1.0 * clamp(audioBass, 0.0, 1.0));
    float grid = smoothstep(0.003, 0.0, abs(fract(r * 5.0) - 0.5) - 0.49) * 0.06 + smoothstep(0.003, 0.0, abs(fract(a * 1.909) - 0.5) - 0.49) * 0.04 * step(0.1, r);
    col += ringCol * grid;
    col += ringCol * 0.015;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
