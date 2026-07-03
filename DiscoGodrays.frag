// DiscoGodrays.frag
// -----------------------------------------------------------------------
// Adapted from "Disco Godrays" by @kishimisu (2023) — https://www.shadertoy.com/view/Dt33RS
// Original licensed CC BY-NC-SA 4.0 (attribution kept per the licence).
//
// Kaleidoscopic volumetric "godrays": a densely-sampled raymarch through a
// mirror-ball fold of a tube + sphere, giving fans of coloured light.
// Adapted to our engine:
//   * Shadertoy -> ours (gl_FragCoord/resolution/time, GLSL 1.20; round() ->
//     floor(x+.5); the blue-noise channel -> a cheap hash; the mat2(cos vec4)
//     trick -> a proper rotation).
//   * IMAGE-FORWARD: the source image colours the rays and drifts as a faint nebula.
//   * Audio-reactive & JUMP-FREE: the disco spin uses audioPhase (never time*audio);
//     beats/onsets brighten; centroid/valence grade the palette.
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioBeat;
uniform float audioOnset;
uniform float audioLevel;
uniform float audioCentroid;
uniform float audioValence;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

void main()
{
    vec2  F = gl_FragCoord.xy;
    vec3  R = vec3(resolution.x, resolution.y, 1.0);
    float t = 0.0, d = 0.3, l = 0.0;
    float k = time * 0.3 + audioPhase * 0.15;    // disco spin (jump-free)

    vec4 O = vec4(0.0);
    for (int i = 0; i < 60; i++)
    {
        if (d <= 0.01) break;

        vec3 p = R - vec3(F + F, R.y);
        p = t / length(p) * p - 2.0 / R;

        // Kaleidoscopic angular folds (mirror-ball facets).
        float a1 = floor((atan(p.z, p.x) + k) / 0.3 + 0.5) * 0.3 - k;
        p.zx = p.zx * rot(a1);
        float a2 = floor((atan(p.y, p.x) + k) / 0.3 + 0.5) * 0.3 - k;
        p.yx = p.yx * rot(a2);

        float dt = length(p.yz) - 0.05;          // thin glowing tube (radial ray)
        l = length(p) - 1.15;                     // sphere shell (glow volume)

        vec4 disco = cos(k - t + vec4(0.0, 0.5, 1.0, 0.0));
        vec4 glow  = disco * smoothstep(1.0, 0.0, dt / 0.045)    // thin ray halo
                   * disco * smoothstep(1.0, 0.0, l);
        O += glow * 1.1 + 0.0015;

        float noise = hash(F + float(i)) * 0.06; // step jitter (was blue noise)
        d = min(max(l, -dt), 0.1 + noise);        // dense sampling for godrays
        t -= d;
    }
    O *= exp(t * 0.1);

    vec3 col = max(O.rgb, 0.0);
    col *= 1.0 + 0.6 * audioBeat + 0.4 * audioOnset;      // beat glow

    // Mood grade.
    col *= mix(vec3(0.70, 0.85, 1.25), vec3(1.30, 1.05, 0.70), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.6 * audioValence);

    // Image-forward: the picture colours the rays + drifts as a faint nebula.
    vec2 uv  = gl_FragCoord.xy / resolution;
    vec3 pic = img(fract(abs(uv * 2.0 - 1.0)));
    col *= mix(vec3(1.0), pic * 1.7, 0.4);
    col += pic * 0.05 * (0.4 + 0.6 * audioLevel);

    gl_FragColor = vec4(col, 1.0);
}
