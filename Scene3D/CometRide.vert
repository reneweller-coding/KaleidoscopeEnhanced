#version 120
// CometRide.vert — flying in formation with a comet: a tumbling icy
// nucleus, geysers venting on every kick, a straight blue ion tail and a
// curved white dust tail streaming a hundred units behind, stars sliding
// past.  A DROP is a major outburst that floods the whole tail.
// 60k points: 10 % nucleus, 15 % jets, 55 % tails, 20 % stars.

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioDrop;

varying vec4 vCol;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

void main()
{
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // The comet flies down -Z; the camera holds formation beside it.  The
    // tail sweeps LATERALLY across the frame so it stays visible.
    vec3 tailDir = normalize(vec3(0.80, 0.28, 0.55));

    vec3  world;
    vec3  col;
    float glow = 1.0;

    if (r1 < 0.10)
    {
        // ---- Nucleus: lumpy tumbling snowball. ----
        float th = r2 * 6.2831853;
        float ph = acos(2.0 * r3 - 1.0);
        vec3 n = vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th));
        float lump = 0.75 + 0.45 * hash11(floor(th * 3.0) * 9.0
                                          + floor(ph * 3.0));
        float ra = time * 0.15;
        n.xy = mat2(cos(ra), -sin(ra), sin(ra), cos(ra)) * n.xy;
        world = n * 3.2 * lump;
        float lit = clamp(dot(n, -tailDir), 0.1, 1.0);
        col = vec3(0.80, 0.88, 0.95) * (0.25 + 0.9 * lit);
        glow = 0.9;
    }
    else if (r1 < 0.25)
    {
        // ---- Geysers: 4 vents blasting on the kick. ----
        float v   = floor(r2 * 4.0);
        float ang = v * 1.57 + 0.7;
        vec3 vent = vec3(cos(ang) * 2.6, sin(ang) * 2.6, 0.0);
        float d = fract(r3 * 9.0 + time * (0.25 + 0.15 * r4));
        world = vent + normalize(vent + vec3(0.0, 0.0, -0.4))
                       * d * (4.0 + 3.0 * r4)
              + (vec3(r4, fract(r2 * 7.0), r3) - 0.5) * d * 2.0;
        col  = vec3(0.7, 0.85, 1.0);
        glow = (0.10 + 1.4 * audioKick + 2.0 * audioDrop)
             * (1.0 - d) * 1.2;
    }
    else if (r1 < 0.80)
    {
        // ---- The tails. ----
        float s = pow(r2, 1.6);                     // 0 head .. 1 far tail
        float d = s * 130.0;
        bool ion = (r3 < 0.4);
        vec3 spread = (vec3(fract(r3 * 13.0), fract(r4 * 17.0),
                            fract(r2 * 23.0)) - 0.5)
                    * (1.5 + d * (ion ? 0.10 : 0.22));
        vec3 curve = ion ? vec3(0.0)
                         : vec3(0.9, 0.45, 0.0) * d * d * 0.0035;
        world = tailDir * d + spread + curve;
        world.x += sin(d * 0.15 + time * 0.7) * (ion ? 0.8 : 0.3);

        col = ion ? hueRot(vec3(0.25, 0.55, 1.0), audioChromaHue * 0.3)
                  : vec3(0.85, 0.82, 0.75);
        glow = (0.45 + 0.5 * audioSwell + 1.6 * audioDrop)
             * exp(-s * 1.6) * (0.4 + 0.6 * r4) * 1.9;
    }
    else
    {
        // ---- Stars streaming past (they carry the sense of speed). ----
        float L = 240.0;
        float z = mod(r2 * L + time * 14.0 + audioAdvance * 30.0, L) - 60.0;
        float ang = r3 * 6.2831853;
        float rad = 14.0 + 60.0 * pow(r4, 1.5);
        world = vec3(cos(ang) * rad, sin(ang) * rad, z);
        col  = vec3(0.8, 0.84, 1.0);
        glow = (0.15 + 0.4 * fract(r2 * 31.0)) *
               smoothstep(-55.0, -20.0, z) * smoothstep(180.0, 100.0, z);
    }

    // Camera beside and slightly above the nucleus, gently breathing.
    vec3 camP = vec3(10.0 + sin(time * 0.10) * 2.0,
                     6.0 + sin(time * 0.13) * 1.5,
                     -14.0);
    vec3 fwd  = normalize(vec3(0.0, 0.0, 8.0) - camP);
    vec3 rgt  = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3 up   = cross(rgt, fwd);
    vec3 rel  = world - camP;
    vec3 vp   = vec3(dot(rel, rgt), dot(rel, up), dot(rel, fwd));

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(105.0 * (0.4 + 0.8 * r4) * px / dist, 1.5, 15.0 * px);

    col *= glow * clamp(1.0 - vp.z / 180.0, 0.0, 1.0);
    vCol = vec4(col * 2.8, 1.0);
}
