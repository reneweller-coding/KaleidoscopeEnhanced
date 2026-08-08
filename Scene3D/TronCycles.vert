#version 120
// TronCycles.vert — light-cycles race across a dark arena, leaving solid
// glowing light WALLS that turn in sharp 90-degree corners.  Each cycle
// runs its own seeded closed circuit (zero net drift — the duel never
// leaves the arena).  Kicks flash the racing heads, a drop ignites every
// wall.  Ribbons 0-7 = cycle walls, 8-19 = the arena floor grid.
//   attrA.x = t along ribbon, attrA.y = side, attrA.w = ribbon index.

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioDrop;

varying vec4  vCol;
varying float vSide;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

// Direction of segment k of a circuit: axes alternate X/Z; the sign
// pattern repeats every 8 segments with zero sum per axis, so every
// circuit is CLOSED (bounded forever, no teleports anywhere).
vec2 segDir(float k)
{
    float k8 = mod(k, 8.0);
    if (mod(k, 2.0) < 0.5)                       // X segment
        return vec2((mod(k8, 4.0) < 2.0) ? 1.0 : -1.0, 0.0);
    else                                         // Z segment
        return vec2(0.0, (k8 < 4.0) ? 1.0 : -1.0);
}

void main()
{
    float t  = attrA.x;
    float sd = attrA.y;
    float ri = attrA.w;
    float r1 = attrB.x, r2 = attrB.y;

    vec3  world;
    vec3  col;
    float bright = 1.0;

    if (ri < 8.0)
    {
        // ---- Light-cycle walls. ----
        float L    = 16.0 + 12.0 * r1;           // segment length
        float sped = 10.0 + 5.0 * r2;
        float sHead = time * sped + audioAdvance * 16.0;
        float trail = 4.5 * L;                   // wall length behind the head
        float s = sHead - (1.0 - t) * trail;

        float n  = floor(s / L);
        float fr = fract(s / L);

        // Walk the (periodic) circuit from its period start to segment n.
        vec2 origin = vec2((hash11(ri * 3.1) - 0.5) * 160.0,
                           (hash11(ri * 7.7) - 0.5) * 160.0);
        float n8   = mod(n, 8.0);
        vec2  posX = origin;
        for (int k = 0; k < 8; ++k)
        {
            if (float(k) >= n8) break;
            posX += segDir(float(k)) * L;
        }
        posX += segDir(n8) * L * fr;

        // Wall: side spans the height.
        world = vec3(posX.x, 1.6 + sd * 1.6, posX.y);

        float head = smoothstep(0.75, 1.0, t);   // brightest at the head
        col = hueRot(vec3(0.15, 0.85, 1.0), ri * 0.85 + audioChromaHue * 0.6);
        bright = (0.30 + 0.55 * t + 1.6 * head * (0.5 + 0.8 * audioKick))
               * (1.0 + 1.3 * audioDrop);
    }
    else
    {
        // ---- Arena floor grid: 6 lines per axis. ----
        float g  = ri - 8.0;
        bool  zl = g >= 6.0;
        float o  = (mod(g, 6.0) - 2.5) * 44.0;
        float a  = (t - 0.5) * 260.0;
        world = zl ? vec3(o + sd * 0.5, 0.0, a)
                   : vec3(a, 0.0, o + sd * 0.5);
        col = vec3(0.10, 0.45, 0.55);
        bright = (0.30 + 0.25 * audioSwell + 0.6 * audioDrop)
               * (1.0 - abs(t - 0.5) * 1.2);
    }

    // Elevated camera slowly circling the arena.
    float ca  = time * 0.05;
    vec3 camP = vec3(cos(ca) * 105.0, 55.0, sin(ca) * 105.0);
    vec3 fwd  = normalize(vec3(0.0, 4.0, 0.0) - camP);
    vec3 rgt  = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3 up   = cross(rgt, fwd);
    vec3 rel  = world - camP;
    vec3 vp   = vec3(dot(rel, rgt), dot(rel, up), dot(rel, fwd));

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.5)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    vCol  = vec4(col * bright * 1.5, 1.0);
    vSide = sd;
}
