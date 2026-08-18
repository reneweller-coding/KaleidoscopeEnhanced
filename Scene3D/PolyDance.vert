#version 330 core
/**
 * @file PolyDance.vert
 * @brief Vertex stage companion to PolyDance.frag -- see that file's header for
 * this scene's description.
 */
// PolyDance.vert — nested platonic constellations: cubes sit on the
// vertices of three slowly counter-rotating spherical shells (fibonacci
// lattices), each shell breathing with its own register.  A dignified,
// geometric dance — nothing ever snaps.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
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

void main()
{
    float idx = attrA.w;
    float r4  = attrB.w;

    // Shell 0: 24 nodes, shell 1: 60, shell 2: 150; leftover cubes hide.
    float shell, node, count;
    if      (idx < 24.0)  { shell = 0.0; node = idx;          count = 24.0;  }
    else if (idx < 84.0)  { shell = 1.0; node = idx - 24.0;   count = 60.0;  }
    else if (idx < 234.0) { shell = 2.0; node = idx - 84.0;   count = 150.0; }
    else
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vCol = vec4(0.0); vCorner = attrA.xyz;
        return;
    }

    // Fibonacci sphere placement.
    float ga = 2.39996323;
    float fy = 1.0 - 2.0 * (node + 0.5) / count;
    float fr = sqrt(1.0 - fy * fy);
    float th = node * ga;
    vec3 n = vec3(cos(th) * fr, fy, sin(th) * fr);

    float lvl = (shell < 0.5) ? audioBass
              : (shell < 1.5) ? audioMid : audioHigh;
    float R = (7.0 + shell * 5.5) * (1.0 + 0.10 * lvl);

    // Shells counter-rotate at stately rates around tilted axes.
    float dir = (mod(shell, 2.0) < 0.5) ? 1.0 : -1.0;
    float ra  = time * (0.10 - shell * 0.022) * dir;
    float rb  = time * 0.045 * dir + shell * 1.3;
    n.xz = mat2(cos(ra), -sin(ra), sin(ra), cos(ra)) * n.xz;
    n.xy = mat2(cos(rb), -sin(rb), sin(rb), cos(rb)) * n.xy;

    vec3 centre = n * R;

    // Cube size per shell, gently pulsing with its register.
    float s = (1.5 - shell * 0.35) * (1.0 + 0.35 * lvl);

    // Cubes keep facing outward (aligned to the shell normal-ish frame).
    vec3 up  = abs(n.y) > 0.93 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 tx  = normalize(cross(up, n));
    vec3 ty  = cross(n, tx);
    vec3 c   = attrA.xyz;
    vec3 world = centre + (tx * c.x + ty * c.y + n * c.z) * s;

    vec3 vp = world + vec3(0.0, 0.0, 38.0);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    // Shell hues sit a musical third apart and follow the key.
    vec3 col = hueRot(vec3(0.9, 0.45, 0.30),
                      audioChromaHue + shell * 1.05 + r4 * 0.15);
    col *= (0.5 + 1.4 * lvl + 0.3 * audioSwell);
    col *= clamp(1.0 - vp.z / 95.0, 0.15, 1.0);

    vCol    = vec4(col * 1.5, 1.0);
    vCorner = attrA.xyz;
}
