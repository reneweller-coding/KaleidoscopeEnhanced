#version 330 core
out vec4 fragColor;
/**
 * @file InterchangeLightTrails.frag
 * @brief INTERCHANGE LIGHT TRAILS: a motorway interchange at night from
 * straight above, as in a long exposure -- the ramps loop and cross in
 * great curves over each other, a cloverleaf around the centre, and along
 * every lane the traffic has left streams of light: white headlights on
 * the lanes coming one way, red tail lights on the lanes going the other,
 * pulses of brighter light travelling along the streams as the cars flow.
 * Orange sodium lamps glow on the verges; the dark land between.  The
 * camera hangs still.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> the brightness of the lanes, band by band (light)
 *   audioSwell        -> the sodium glow (slow)
 *   audioLevel        -> brightness
 *   sceneTime / sceneAdvance -> the traffic flowing (continuous)
 *
 * Per-activation variety: loopsP (how many loops), hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioSwell;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float loopsP;
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

float gT, gPx;
float gBand[8];
vec3 gCol;

// One carriageway with two directions, given as a signed distance d across
// it and an arc length s along it.  Lanes: 3 each way.
void road(float d, float s, float id)
{
    float hw = 0.022;                                           // half width of the carriageway
    if (abs(d) > hw + 0.03) return;
    // Asphalt with verge.
    float on = smoothstep(hw + gPx, hw - gPx, abs(d));
    gCol = mix(gCol, vec3(0.03, 0.03, 0.035), on);
    // Sodium lamps along the verge: warm pools.
    float lampS = fract(s * 12.0);
    float lampGlow = exp(-pow((abs(d) - hw - 0.004) / 0.012, 2.0)) * exp(-pow((lampS - 0.5) / 0.25, 2.0));
    gCol += vec3(1.0, 0.55, 0.15) * lampGlow * 0.1;
    // The light streams: each lane a thin line, white one way, red the other.
    for (int l = 0; l < 6; ++l) {
        float fl = float(l);
        float lane = -hw + (fl + 0.5) * (2.0 * hw / 6.0);
        float dd = abs(d - lane);
        float w = 0.0012 + gPx * 0.7;
        float line = exp(-dd * dd / (w * w));
        bool fwd = l >= 3;
        vec3 c = fwd ? vec3(1.0, 0.95, 0.85) : vec3(1.0, 0.12, 0.08);
        // Pulses flowing along the lane: bunches of cars.
        float dir = fwd ? 1.0 : -1.0;
        float flow = s * 6.0 - dir * gT * 0.25 + fl * 1.7 + id * 3.1;
        float pulse = 0.5 + 0.5 * noise2(vec2(flow, fl + id * 7.0));
        float b = gBand[int(mod(fl + id * 3.0, 8.0))];
        pulse = smoothstep(0.3, 0.8, pulse);
        gCol += c * line * (0.12 + 1.1 * pulse * pulse) * (0.6 + 0.9 * b);
    }
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    gT = sceneTime + sceneAdvance * 0.4;
    gPx = 1.0 / resolution.y;
    for (int i = 0; i < 8; ++i)
        gBand[i] = clamp((audioSpectrum[i * 4] + audioSpectrum[i * 4 + 1] + audioSpectrum[i * 4 + 2] + audioSpectrum[i * 4 + 3]) * (0.35 + 0.1 * float(i)), 0.0, 1.0);

    // The land at night: dark fields, a faint sodium haze.
    gCol = vec3(0.012, 0.014, 0.012) * (0.8 + 0.4 * noise2(p * 8.0));
    gCol += vec3(0.25, 0.13, 0.04) * exp(-length(p) * 2.5) * (0.08 + 0.1 * swell);

    // The two motorways crossing: one straight, one gently curving.
    road(p.y - 0.02 * sin(p.x * 1.5), p.x, 0.0);
    road(p.x * 0.97 + p.y * 0.24, p.y, 1.0);
    // Cloverleaf loops in the four quadrants between them.
    int nL = 2 + int(clamp(loopsP, 0.0, 1.0) * 2.99);
    for (int q = 0; q < 4; ++q) {
        if (q >= nL + (nL == 2 ? 0 : 1)) break;
        float fq = float(q);
        vec2 sg = vec2((q == 0 || q == 3) ? 1.0 : -1.0, (q < 2) ? 1.0 : -1.0);
        vec2 c = sg * vec2(0.16, 0.14);
        float R = 0.1;
        vec2 dq = p - c;
        float a = atan(dq.y, dq.x);
        road(length(dq) - R, a * R, 2.0 + fq);
    }
    // Slip roads: long gentle curves joining the carriageways.
    road(length(p - vec2(0.7, -0.55)) - 0.62, atan(p.y + 0.55, p.x - 0.7) * 0.62, 6.0);
    road(length(p - vec2(-0.72, 0.6)) - 0.64, atan(p.y - 0.6, p.x + 0.72) * 0.64, 7.0);

    vec3 col = gCol;
    col = mix(col, col * imgPalette(0.08 + hueP * 0.159) * 1.3, 0.06);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
