#version 330 core
out vec4 fragColor;
// Frag-side music pulse (added by the deaf-scene pass: reactivity
// measured ~0 -- the vert-side coupling barely moved any pixels).
uniform float audioLevel;
uniform float audioKick;
// CrystalGrowth.frag — faceted gem faces with luminous edges (depth-tested);
// a drop blows the edges out into a blinding sparkle.
uniform float audioDrop;
in vec4 vCol;
in vec3 vCorner;

void main()
{
    vec3 a = abs(vCorner) * 2.0;
    float e1 = smoothstep(0.78, 0.99, a.x);
    float e2 = smoothstep(0.78, 0.99, a.y);
    float e3 = smoothstep(0.78, 0.99, a.z);
    float edge = clamp(e1 * e2 + e2 * e3 + e1 * e3, 0.0, 1.0);
    vec3 col = vCol.rgb * (0.16 + (1.6 + 2.0 * audioDrop) * edge);
    col *= (0.85 + 0.30 * audioLevel + 0.35 * audioKick);
    fragColor = vec4(col, 1.0);
}
