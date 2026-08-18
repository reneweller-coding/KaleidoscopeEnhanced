#version 330 core
out vec4 fragColor;
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
uniform float audioCentroid;   // brightness of the material -> warp fineness

// Per-activation variety (re-rolled each activation; 0 = default):
uniform float warpScaleP;  // warp field scale     (0 -> 3.0; 2 = broad billows, 5 = fine ripples)
uniform float warpAmtP;    // warp amount multiplier (0 -> 1.0; 0.5 = calm, 1.8 = molten)
uniform float driftP;      // warp field drift speed (0 -> 1.0; 0.5 = glacial, 2 = flowing)

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

    // Per-activation character (constant during the scene).  The warp field's
    // scale additionally follows the spectral centroid a little: bright airy
    // material -> finer ripples, dark material -> broad billows (timbre->shape).
    float scaleV = ((warpScaleP <= 0.01) ? 3.0 : warpScaleP)
                 * (1.0 + 0.25 * (audioCentroid - 0.5));
    float amtV   = (warpAmtP <= 0.01) ? 1.0 : warpAmtP;
    float driftV = (driftP   <= 0.01) ? 1.0 : driftP;

    // Engagement: fully liquid in drones, nearly plain in beat music.
    float amt = (0.15 + 0.85 * audioAmbient) * (0.010 + 0.035 * audioSwell) * amtV;

    // Slow, round warp field (two noise octaves, drifting with audioPhase).
    float t = (time * 0.03 + audioPhase * 0.10) * driftV;
    vec2 w;
    w.x = vnoise(p * scaleV + vec2(0.0, t)) - 0.5
        + 0.5 * (vnoise(p * scaleV * 2.0 + vec2(3.7, -t * 0.7)) - 0.5);
    w.y = vnoise(p * scaleV + vec2(5.2, t * 0.8)) - 0.5
        + 0.5 * (vnoise(p * scaleV * 2.0 + vec2(8.1, t * 0.6)) - 0.5);

    // Gentle looming breathe with the swell.
    vec2 c = p - 0.5;
    c /= (1.0 + 0.020 * audioSwell * audioAmbient);
    vec2 uv = c + 0.5 + w * amt;

    fragColor = interpolation * texture(tex0, uv)
                 + (1.0 - interpolation) * texture(tex1, uv);
}
