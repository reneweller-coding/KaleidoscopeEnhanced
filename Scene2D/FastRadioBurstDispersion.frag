#version 330 core
out vec4 fragColor;
/**
 * @file FastRadioBurstDispersion.frag
 * @brief FAST RADIO BURST DISPERSION: a radio telescope under a sky that is
 * the dynamic spectrum -- frequency up the sky, time across it, the live
 * spectrogram scrolling steadily.  Fast radio bursts arrive as dispersed
 * chirps: a burst that left its galaxy at one instant reaches us high
 * frequencies first, low last, so it draws a sweeping curve (delay ~ DM /
 * f^2) across the sky.  Bursts are launched on the scene clock (each with
 * its own dispersion measure), the kick flashes the dish, the bass hums
 * the receiver glow.  Camera still.
 *
 * Audio Reactivity:
 *   texSpectro   -> the sky itself (live history)
 *   sceneAdvance -> burst launches, scroll (continuous)
 *   audioKick    -> dish flash (light)
 *   audioBass    -> receiver glow (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: dmP (dispersion strength), rateP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform sampler2D texSpectro;   // 32 bands across (x), history down (y), ring
uniform float spectroHead;      // T coordinate of "now", continuous
uniform float spectroFill;      // 0..1 how much history exists yet

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float dmP;
uniform float rateP;
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

float spec(float b, float age)
{
    float x = clamp(b, 0.0, 1.0) * (31.0 / 32.0) + 0.5 / 32.0;
    float y = fract(spectroHead - age);
    return texture(texSpectro, vec2(x, y)).r;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);
    vec2 uv = gl_FragCoord.xy / resolution;

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float dm = 0.35 + 0.65 * clamp(dmP, 0.0, 1.0);
    float rate = 0.6 + 0.8 * clamp(rateP, 0.0, 1.0);
    float clock = sceneAdvance * 0.5 + sceneTime * 0.1;
    float horizon = -0.34;

    // The sky: dynamic spectrum -- frequency up (band by height), time
    // across (right edge = now, left = the past), scrolling with the head.
    float skyT = clamp((p.y - horizon) / (0.5 - horizon), 0.0, 1.0);     // 0 bottom .. 1 top
    float band = skyT;                                                  // low frequencies low in the sky
    float age = (1.0 - uv.x) * 0.9 * max(spectroFill, 0.05);
    float e = spec(band, age);
    vec3 skyCol = mix(vec3(0.02, 0.03, 0.08), imgPalette(hue * 0.159 + 0.55) * 0.9, clamp(e * 1.6, 0.0, 1.0));
    skyCol += imgPalette(hue * 0.159 + 0.9) * pow(clamp(e * 1.6, 0.0, 1.0), 3.0) * 0.6;
    // Round stars through the spectrum where it is quiet.
    vec2 su = p * 90.0; vec2 sc = floor(su); vec2 sf = fract(su) - 0.5;
    vec2 so = vec2(hash21(sc + 1.3), hash21(sc + 5.9)) - 0.5;
    skyCol += vec3(0.7) * smoothstep(0.14, 0.03, length(sf - so * 0.6)) * step(0.985, hash21(sc)) * (1.0 - clamp(e * 2.0, 0.0, 1.0));

    // Bursts: each launched on the clock; its arrival time at frequency f
    // (f = 0.3 + band) is t0 + dm/f^2 ; the sky x axis is time, so the
    // burst is the curve x(band) = xNow - (clockAge(t0) + dm/f^2)*speed.
    vec3 burst = vec3(0.0);
    for (int k = 0; k < 4; ++k)
    {
        float fk = float(k);
        float period = (1.6 + 0.9 * hash11(fk * 3.1)) / rate;
        float ph = fract(clock / period + hash11(fk * 5.3));               // 0 = just launched
        float idx = floor(clock / period + hash11(fk * 5.3));
        float dmk = dm * (0.5 + 0.8 * hash11(fk * 7.7 + idx));
        float f = 0.35 + band;
        float delay = dmk / (f * f) * 0.12;                                // seconds of sky per unit
        float xArr = 1.0 - (ph * 1.4 + delay - dmk * 0.12 / (1.35 * 1.35));   // top of the sky arrives at x = 1 when ph = 0
        float w = 0.006 + 0.004 * band;
        float line = exp(-pow((uv.x - xArr) / w, 2.0));
        float fade = 1.0 - smoothstep(0.55, 0.95, ph);
        vec3 bc = mix(vec3(1.0, 0.9, 0.7), imgPalette(hue * 0.159 + 0.1 + fk * 0.2), 0.5);
        burst += bc * line * fade * (1.2 - 0.5 * band);
    }
    vec3 col = skyCol + burst * step(horizon, p.y) * 1.6;

    // The dish: a parabolic silhouette on the horizon, its feed glowing
    // with the bass, flashing on the kick; the ground is the photo dark.
    float ground = step(p.y, horizon);
    vec3 land = img(vec2(uv.x, (p.y + 0.5) * 0.5)) * (imgPalette(hue * 0.159 + 0.55) * 0.3 + 0.04);
    col = mix(col, land, ground);
    vec2 dc = vec2(0.2, horizon + 0.02);
    vec2 dq = p - dc;
    float dish = step(dq.y, 0.32 * dq.x * dq.x + 0.02) * step(0.0, dq.y - 0.32 * dq.x * dq.x + 0.03) * step(abs(dq.x), 0.36);
    float mast = step(abs(dq.x), 0.006) * step(0.0, dq.y) * step(dq.y, 0.22);
    float feed = exp(-length(dq - vec2(0.0, 0.2)) * 30.0);
    vec3 dishCol = vec3(0.12, 0.13, 0.15) * (0.6 + 0.4 * (dq.x + 0.36)) ;
    col = mix(col, dishCol, max(dish, mast));
    col += imgPalette(hue * 0.159 + 0.1) * feed * (0.3 + 0.9 * clamp(audioBass, 0.0, 1.0) + 2.0 * audioKick);
    // Pedestal.
    col = mix(col, vec3(0.08), step(abs(dq.x), 0.03) * step(dq.y, -0.03) * step(-0.3, dq.y));
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
