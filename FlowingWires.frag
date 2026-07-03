// FlowingWires.frag
// -----------------------------------------------------------------------
// Adapted from "Flowing Wires" by @kishimisu (2023) — https://www.shadertoy.com/view/DsBczR
// Original licensed CC BY-NC-SA 4.0 (attribution kept per the licence).
//
// A 3D truchet pattern raymarched into interlocking glowing wire loops.
// Adapted to our engine:
//   * Shadertoy -> ours (gl_FragCoord/resolution/time, GLSL 1.20; round() -> floor(x+.5),
//     the mat2(cos(a+vec4(0,33,11,0))) trick -> a proper rotation).
//   * IMAGE-FORWARD: the source image colours the glow and drifts through as a
//     faint nebula.
//   * Audio-reactive & JUMP-FREE: forward travel from the host-integrated
//     audioAdvance, spin from audioPhase (never time*audio); beats/onsets brighten
//     the wires, centroid/valence grade the palette.
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

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }

// Distance to one truchet wire loop + accumulate its glow into O.  Returns the
// distance (used by the raymarcher).
float wire(vec3 p, float t, float T, inout vec4 O)
{
    vec3 q = p;
    q.xy += 0.5;
    float d = length(vec2(length(q.xy) - 0.5, q.z)) - 0.01;   // torus
    float ang = floor((atan(q.y, q.x) - T) * 3.8 + 0.5) / 3.8 + T;  // truchet snap
    q.yx = rot(ang) * q.yx;
    q.x -= 0.5;
    O += (sin(t + T) * 0.1 + 0.1) * (1.0 + cos(t + T * 0.5 + vec4(0.0, 1.0, 2.0, 0.0)))
         / (0.5 + pow(length(q) * 50.0, 1.3));
    return d;
}

void main()
{
    vec2  R = resolution;
    vec2  F = 2.0 * gl_FragCoord.xy - R;         // centred pixel coords
    float T = time;
    float trav = time + audioAdvance * 3.0;      // forward travel (jump-free)

    vec4  O = vec4(0.0);
    float t = 0.0;
    for (int i = 0; i < 28; i++)
    {
        vec3 p = t * normalize(vec3(rot(t * 0.1) * F, R.y));
        p.zx = rot(T / 4.0 + audioPhase * 0.05) * p.zx;   // camera spin
        p.zy = rot(T / 3.0) * p.zy;
        p.x += trav;                                       // fly forward
        vec3 pf = fract(p) - 0.5;
        float d1 = wire(pf, t, T, O);
        float d2 = wire(vec3(-pf.y, pf.z, pf.x), t, T, O);
        float d3 = wire(-vec3(pf.z, pf.x, pf.y), t, T, O);
        t += min(min(d1, d2), d3);
    }

    vec3 col = O.rgb;
    col *= 1.0 + 0.6 * audioBeat + 0.4 * audioOnset;       // beat glow

    // Mood grade.
    col *= mix(vec3(0.70, 0.85, 1.25), vec3(1.30, 1.05, 0.70), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.6 * audioValence);

    // Image-forward: the picture colours the wires + drifts as a faint nebula.
    vec3 pic = img(fract(abs(F) / R));
    col *= mix(vec3(1.0), pic * 1.7, 0.45);
    col += pic * 0.05 * (0.5 + 0.5 * audioLevel);
    col *= 0.9 + 0.5 * audioLevel;

    gl_FragColor = vec4(col, 1.0);
}
