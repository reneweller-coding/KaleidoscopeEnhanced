#version 330 core
out vec4 fragColor;
/**
 * @file Portal.frag
 * @brief Portal: the new scene opens along the OLD scene's real depth -
 * near geometry peels away first, a glowing rim rides the depth threshold
 * (3D scenes only; falls back to a linear mix without valid depth).
 *
 * Scene TRANSITION shader (Transitions/): blends the outgoing scene
 * (tex0) into the incoming one (tex1) over one cross-fade.
 * interpolation: 1 = old scene fully visible .. 0 = new scene.
 * Extracted from the former FxPlain.frag 28-style library.
 */
uniform vec2 resolution;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform sampler2D texDepth0;   // scene depth of the OLD effect
uniform vec2  depthValid;      // x: does tex0 hold real 3D depth?
uniform vec2  nearFar;         // shared scene clip planes (linearisation)

const float PI = 3.14159265358979;

float hashT(vec2 p2)
{
    return fract(sin(dot(p2, vec2(127.1, 311.7))) * 43758.5453);
}

// Smooth 2D value noise.
float noise2T(vec2 q)
{
    vec2 i = floor(q), f = fract(q);
    f = f * f * (3.0 - 2.0 * f);
    float a = hashT(i), b = hashT(i + vec2(1.0, 0.0));
    float c = hashT(i + vec2(0.0, 1.0)), e = hashT(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, e, f.x), f.y);
}

vec4 blend4(vec4 a, vec4 b, float w) { return mix(a, b, clamp(w, 0.0, 1.0)); }

void main()
{
    vec2  p   = gl_FragCoord.xy / resolution;
    float d   = 1.0 - interpolation;          // transition progress 0..1
    float mid = sin(PI * d);                  // 0 at both ends, 1 mid-transition
    float aspect = resolution.x / resolution.y;

    vec4 c0 = texture(tex0, p);
    vec4 c1 = texture(tex1, p);
    if (depthValid.x < 0.5) { fragColor = blend4(c0, c1, d); return; }
    // Normalised LINEAR depth of the old scene (depth buffers are not
    // linear - comparing raw z would dump the whole scene in one bucket).
    float zn  = nearFar.x, zf = nearFar.y;
    float zr  = texture(texDepth0, p).r;
    float lin = zn * zf / max(zf - zr * (zf - zn), 1e-4);
    float ln  = clamp((lin - zn) / max(zf - zn, 1e-4), 0.0, 1.0);
    // Threshold sweeps from below the near plane to beyond the far plane:
    // identity guaranteed at both fade ends, near geometry peels first.
    float sw = d * d * 1.6 - 0.2;
    float ew = 0.06 + 0.10 * d;
    float nz = (noise2T(p * vec2(9.0 * aspect, 9.0) + d * 3.0) - 0.5) * ew;
    float wOld = smoothstep(sw - ew, sw + ew, ln + nz);
    vec4 col = mix(c1, c0, wOld);
    // Glowing rim rides the moving threshold (the portal's energy edge).
    float rim = exp(-abs(ln + nz - sw) / max(ew, 1e-4));
    col.rgb += vec3(0.45, 0.75, 1.35) * rim * 0.40 * mid;
    fragColor = col;
}
