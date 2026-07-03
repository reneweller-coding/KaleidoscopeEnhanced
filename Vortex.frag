// Vortex.frag
// -----------------------------------------------------------------------
// Adapted from "Vortex" by @kishimisu (2024) — https://www.shadertoy.com/view/MX33Dr
// Original licensed CC BY-NC-SA 4.0 (attribution kept per the licence).
//
// A kaleidoscopic raymarched vortex/tunnel.  Reconstructed from the code-golfed
// original and adapted to our engine: image-forward (the picture colours the
// vortex + drifts as a faint nebula), audio-reactive & jump-free (forward travel
// via audioAdvance, spin via audioPhase; beats brighten; centroid/valence grade).
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioAdvance;
uniform float audioPhase;
uniform float audioBeat;
uniform float audioOnset;
uniform float audioLevel;
uniform float audioCentroid;
uniform float audioValence;

// Original's mat2(cos(vec4(0,11,33,0)+a)) ≈ a proper rotation by a.
mat2 rotv(float a) { return mat2(cos(a), sin(a), -sin(a), cos(a)); }
vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }

// Colour from a slowly-drifting crop of the picture, indexed by a scalar so the
// palette comes from the image and keeps changing over time + with the harmony.
vec3 imgPal(float x)
{
    vec2 cc = vec2(0.5) + 0.32 * vec2(cos(time * 0.045 + audioPhase * 0.12),
                                      sin(time * 0.033 + audioPhase * 0.09));
    return img(fract(cc + 0.24 * vec2(cos(x), sin(x * 1.31))));
}

// Hue rotation around the luminance axis (keeps brightness + saturation).
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    vec2  Res = resolution;
    float r    = time;
    float adv  = time + audioAdvance * 2.0;      // forward scroll (jump-free)
    vec4  O = vec4(0.0);
    float t = 0.1, x = 0.0;

    for (int e = 0; e < 40; e++)
    {
        // Ray position (screen coord rotated over time + gentle audio spin).
        vec3 o = t * normalize(vec3((2.0 * gl_FragCoord.xy - Res)
                                    * rotv(r * 0.15 + audioPhase * 0.08), Res.y));
        o.y += t * t * 0.09;
        o.z  = mod(o.z + adv, 0.2) - 0.1;
        x    = t * 0.06 - r * 0.2;
        // Kaleidoscopic angular snap (0.314 ≈ π/10 → 20 mirror sectors).
        o.xy = o.xy * rotv(floor((atan(o.y, o.x) - x) / 0.314 + 0.5) * 0.314 + x);
        o.x  = fract(o.xy).x - 0.8;
        t += x = length(o) * 0.5 - 0.014;
        O += (1.0 + cos(t * 0.5 + r + vec4(0.0, 1.0, 2.0, 0.0)))
           * (0.3 + sin(3.0 * t + r * 5.0) / 4.0)
           / (8.0 + x * 4e2);
    }

    vec3 col = max(O.rgb, 0.0);
    col *= 1.0 + 0.5 * audioBeat + 0.3 * audioOnset;

    // Mood grade.
    col *= mix(vec3(0.70, 0.85, 1.25), vec3(1.30, 1.05, 0.70), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.6 * audioValence);

    // Image-forward: picture colours the vortex + faint nebula.
    vec2 uv  = gl_FragCoord.xy / resolution;
    float himg = dot(imgPal(dot(col, vec3(0.333)) * 6.0
                 + length(gl_FragCoord.xy / resolution - 0.5) * 4.0), vec3(0.333));
    col = hueRot(col, (himg - 0.5) * 3.0 + time * 0.05);

    gl_FragColor = vec4(col, 1.0);
}
