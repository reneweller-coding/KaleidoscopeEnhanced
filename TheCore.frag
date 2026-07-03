// TheCore.frag
// -----------------------------------------------------------------------
// Adapted from "The Core" by @kishimisu (2023) — https://www.shadertoy.com/view/cdy3Dd
// Original licensed CC BY-NC-SA 4.0 (attribution kept per the licence).
//
// A glowing warm "core" seen down a twisting, domain-repeating tunnel of tubes.
// Adapted to our engine: image-forward (the picture colours the glow + drifts as
// a faint nebula), audio-reactive & jump-free (tunnel scroll via audioAdvance,
// twist via audioPhase; beats brighten; centroid/valence grade).
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

mat2 rotm(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }

void main()
{
    vec2  c = resolution;
    vec2  o = 2.0 * gl_FragCoord.xy - c;
    float m    = time * 0.5;
    float mAdv = m + audioAdvance * 0.5;         // tunnel scroll (jump-free)

    vec4  O = vec4(0.0);
    float t = 0.0, d;
    for (int e = 0; e < 100; e++)
    {
        vec3 r = t * normalize(vec3(abs(o / c.y), 1.0));   // mirrored ray
        d = length(r - vec3(0.0, 0.0, 15.0)) - 1.0;        // the core sphere
        O += vec4(0.2, 0.1, 0.04, 0.0) / (1.0 + max(d, -0.09) / 0.1);

        r.z += mAdv;
        float ang = sin(r.z) * sin(m) * 0.3 + audioPhase * 0.05;
        r.xy = fract(r.xy * rotm(ang)) - 0.5;              // twist + fold into tubes
        t += d = min(d, length(r.xy) - 0.1);

        O += 0.032 * smoothstep(0.0, 1.0,
                 cos(t * 0.1 * (sin(m) + 20.0)
                     + vec4(0.0, 1.0, 2.0, 0.0) * (0.15 + length(r.xy) * 2.0) - m) - 0.6)
             / (1.0 + d) / exp(t * 0.1);
    }

    vec3 col = max(O.rgb, 0.0);
    col = col / (1.0 + 0.3 * col);                // soft highlight knee (no white-out)
    col *= 1.0 + 0.6 * audioBeat + 0.3 * audioOnset;

    // Mood grade.
    col *= mix(vec3(0.70, 0.85, 1.25), vec3(1.30, 1.05, 0.70), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.6 * audioValence);

    // Image-forward: the picture colours the glow + drifts as a faint nebula.
    vec2 uv  = gl_FragCoord.xy / resolution;
    vec3 pic = img(fract(abs(uv * 2.0 - 1.0)));
    col *= mix(vec3(1.0), pic * 1.6, 0.35);
    col += pic * 0.05 * (0.4 + 0.6 * audioLevel);

    gl_FragColor = vec4(col, 1.0);
}
