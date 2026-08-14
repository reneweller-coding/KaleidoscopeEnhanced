#version 330 core
// Blueprint.vert — wrap the flat grid onto a body that morphs between a torus,
// a sphere and a trefoil-ish knot, driven by the music.

in vec4 attrA;      // xy = grid (u,v)
in vec4 attrB;

out vec3  gObj;
out vec2  gUV;
out float gCell;
out float gMorph;

uniform float audioAdvance;
uniform float audioLevel;
uniform float audioSubBass;
uniform float morphP;

const float PI = 3.14159265;

void main()
{
    float u = attrA.x * 2.0 * PI;       // around the tube's path
    float v = attrA.y * 2.0 * PI;       // around the tube

    // Where in the morph cycle we are.  Two shapes are always blended, so the
    // body is almost never one of the pure forms — which is what makes it read
    // as a designed object rather than a demo of three primitives.
    float m = morphP * (0.5 + 0.5 * sin(audioAdvance * 0.06))
            + 0.12 * audioSubBass;
    m = clamp(m, 0.0, 1.0);

    // Torus.
    float R = 1.35, r = 0.52;
    vec3 torus = vec3((R + r * cos(v)) * cos(u),
                       r * sin(v),
                      (R + r * cos(v)) * sin(u));

    // Trefoil knot: the same tube swept along a knotted path.
    float p = 2.0, q = 3.0;
    float kr = 1.0 + 0.42 * cos(q * u);
    vec3 c = vec3(kr * cos(p * u), 0.42 * sin(q * u), kr * sin(p * u));
    // Frame from the path's own derivative, so the tube does not pinch.
    vec3 dc = vec3(-0.42 * q * sin(q * u) * cos(p * u) - kr * p * sin(p * u),
                    0.42 * q * cos(q * u),
                   -0.42 * q * sin(q * u) * sin(p * u) + kr * p * cos(p * u));
    vec3 T = normalize(dc);
    vec3 N = normalize(cross(T, vec3(0.0, 1.0, 0.0)) + 1e-4);
    vec3 B = cross(T, N);
    vec3 knot = c + 0.34 * (N * cos(v) + B * sin(v));

    gObj   = mix(torus, knot, m);
    gUV    = attrA.xy;
    gCell  = attrA.w;
    gMorph = m;
    gl_Position = vec4(gObj, 1.0);
}
