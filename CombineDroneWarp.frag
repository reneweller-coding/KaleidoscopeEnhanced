// CombineDroneWarp.frag
// -----------------------------------------------------------------------
// The first AMBIENT-reactive combine pass: a slow, round, liquid domain warp
// of the combined frame (research: harmonic/sustained material -> soft, curved
// forms; loudness swell -> gentle expansion).
//   audioSwell   -> warp amplitude + a slow looming zoom breathe;
//   audioAmbient -> overall engagement (in beat music it stays nearly plain,
//                   so it can safely sit in any preset);
//   audioPhase   -> slow jump-free drift of the warp field.
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioSwell;
uniform float audioAmbient;

float hash21(vec2 p)
{
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}
float vnoise(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main()
{
    vec2 p = gl_FragCoord.xy / resolution;

    // Engagement: fully liquid in drones, nearly plain in beat music.
    float amt = (0.15 + 0.85 * audioAmbient) * (0.010 + 0.035 * audioSwell);

    // Slow, round warp field (two noise octaves, drifting with audioPhase).
    float t = time * 0.03 + audioPhase * 0.10;
    vec2 w;
    w.x = vnoise(p * 3.0 + vec2(0.0, t)) - 0.5
        + 0.5 * (vnoise(p * 6.0 + vec2(3.7, -t * 0.7)) - 0.5);
    w.y = vnoise(p * 3.0 + vec2(5.2, t * 0.8)) - 0.5
        + 0.5 * (vnoise(p * 6.0 + vec2(8.1, t * 0.6)) - 0.5);

    // Gentle looming breathe with the swell.
    vec2 c = p - 0.5;
    c /= (1.0 + 0.020 * audioSwell * audioAmbient);
    vec2 uv = c + 0.5 + w * amt;

    gl_FragColor = interpolation * texture2D(tex0, uv)
                 + (1.0 - interpolation) * texture2D(tex1, uv);
}
