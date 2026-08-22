#version 330 core
/**
 * @file CrystalGrowth.vert
 * @brief Vertex stage companion to CrystalGrowth.frag -- see that file's header for
 * this scene's description.
 */
// CrystalGrowth.vert — a cluster of crystal branches grows outward from a
// central hub; each branch is only as long as the music's BUILD-UP tension
// allows (a slow ambient drift keeps it alive without music), and a DROP
// snaps the whole formation into a blinding ice-white flash before it
// settles back to its resting glow.  70 branches x 70 segments = 4900 cubes.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float cubeBudget;    // FPS detail budget: <1 -> drop every 2nd cube

uniform float audioAdvance;
uniform float audioBuildUp;
uniform float audioDrop;
uniform float audioSwell;
uniform float audioChromaHue;

out vec4 vCol;
out vec3 vCorner;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

void main()
{
    float idx = attrA.w;

    // FPS budget: below full detail, every 2nd cube collapses.
    if (cubeBudget < 0.75 && mod(idx, 2.0) > 0.5)
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vCol = vec4(0.0); vCorner = attrA.xyz;
        return;
    }

    const float SEGS = 70.0;
    float b = floor(idx / SEGS);              // branch 0..69
    float s = mod(idx, SEGS) / SEGS;          // 0 root .. 1 tip

    float h1 = hash11(b * 3.1 + 0.4);
    float h2 = hash11(b * 5.7 + 1.9);
    float h3 = hash11(b * 7.3 + 2.6);
    float h4 = hash11(b * 9.1 + 3.3);

    // How far this branch is allowed to grow right now: a healthy resting
    // cluster (visible without any build-up at all) that blooms further
    // toward full length as tension rises, and flares on the drop.
    float grow = clamp(0.55 + 0.10 * sin(time * 0.06 + h1 * 6.28)
                       + 0.35 * audioBuildUp + 0.20 * audioDrop, 0.0, 1.0);

    // Cull the ungrown tail of the branch cleanly (whole cube, no partial
    // popping): everything past `grow` collapses to a degenerate point.
    if (s > grow + 0.02)
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vCol = vec4(0.0); vCorner = attrA.xyz;
        return;
    }

    // Branch direction: fixed outward lean (upward-biased) plus a gentle
    // S-curve that grows more pronounced toward the tip (organic, not a
    // straight spike).
    vec3 dir0 = normalize(vec3(h1 - 0.5, 0.35 + 0.55 * h2, h3 - 0.5));
    float branchLen = 9.0 + 7.0 * h4;
    vec3 along = dir0 * s * branchLen;
    vec3 perp  = normalize(cross(dir0, vec3(0.0, 1.0, 0.0) + vec3(0.001)));
    vec3 up2   = cross(perp, dir0);
    float curve = sin(s * 3.0 + h1 * 6.28) * s * s * 1.6;
    vec3 world = along + perp * curve + up2 * curve * 0.5;

    // Slow overall rotation of the whole cluster.
    float ra = time * 0.05;
    world.xz = mat2(cos(ra), -sin(ra), sin(ra), cos(ra)) * world.xz;

    // Facet: thick hexagonal-ish prism at the root, tapering to a point,
    // oriented along the branch direction.
    float thick = mix(1.0, 0.12, s);
    vec3 c = attrA.xyz;
    vec3 facet = perp * c.x * thick + up2 * c.y * thick
               + dir0 * c.z * (branchLen / SEGS) * 0.65;
    world += facet;

    // User feedback: the crystal sat tiny in the frame — dolly in.
    vec3 vp = world + vec3(0.0, -1.0, 10.5);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    // Colour: cool gem family per branch, flashing ice-white on the drop.
    vec3 col = hueRot(vec3(0.35, 0.55, 0.95), audioChromaHue * 0.5 + h2 * 2.0);
    col = mix(col, vec3(1.0, 1.0, 1.05), audioDrop);
    col *= (0.35 + 0.55 * (1.0 - s)) * (0.8 + 0.5 * audioSwell)
         * clamp(1.0 - vp.z / 90.0, 0.15, 1.0);

    vCol    = vec4(col * (1.9 + 1.6 * audioDrop), 1.0);
    vCorner = attrA.xyz;
}
