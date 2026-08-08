#version 120
// SpiralArray.vert — Chew's SPIRAL ARRAY (the MuSA.RT idea): the 12 pitch
// classes wound along a helix of FIFTHS (a quarter turn + a small rise per
// fifth, so 12 fifths = 3 full turns), and the music's CENTER OF EFFECT —
// the chroma-weighted centroid of the sounding pitches — travels through
// the helix as a bright comet.  Stable keys keep the comet resting between
// their pitches; a key CHANGE sends it on a visible journey to a new
// neighbourhood.  The engine's global feedback trails paint its path for
// free.  Point budget (60k): helix wire 18k, 12 node clouds x 2.6k = 31.2k,
// comet 10.8k.

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;
uniform float sceneSeed;

uniform float audioChroma[12];
uniform float audioChromaHue;
uniform float audioSwell;
uniform float audioKick;
uniform float audioOnset;
uniform float audioDrop;
uniform float audioDownbeat;

varying vec4 vCol;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

// Position along the helix by CONTINUOUS fifths index f (0..12): quarter
// turn per fifth, rising; radius chosen so the coil reads clearly.
vec3 helixPos(float f)
{
    float a = f * 1.5707963;             // pi/2 per fifth -> 3 turns
    float y = (f - 5.5) * 2.05;          // centred vertically
    return vec3(cos(a) * 7.5, y, sin(a) * 7.5);
}

// Pitch class i (0..11) -> its fifths index (i*7 mod 12).
float fifthsIndex(float pc) { return mod(pc * 7.0, 12.0); }

void main()
{
    float idx = attrA.w;
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // ---- Center of effect: chroma-weighted centroid over the 12 nodes ----
    // (computed per-vertex — 12 adds — so no host state is needed).
    vec3  ce = vec3(0.0);
    float wsum = 1e-4;
    for (int i = 0; i < 12; ++i)
    {
        float w = audioChroma[i];
        w = w * w;                        // sharpen: the KEY notes dominate
        ce += helixPos(fifthsIndex(float(i))) * w;
        wsum += w;
    }
    ce /= wsum;

    vec3  world;
    vec3  col;
    float bright;
    float sizeMul = 1.0;

    if (idx < 18000.0)
    {
        // ---- Helix wire: dim skeleton of the tonal space ----
        float t = idx / 18000.0;          // 0..1 -> fifths 0..12 (wraps)
        float f = t * 12.0;
        world = helixPos(f) + vec3(r1 - 0.5, r2 - 0.5, r3 - 0.5) * 0.22;
        col = hueRot(vec3(0.30, 0.45, 0.70), audioChromaHue * 0.4);
        bright = 0.10 + 0.10 * audioSwell;
        sizeMul = 0.5;
    }
    else if (idx < 49200.0)
    {
        // ---- 12 pitch-class node clouds ----
        float node = floor((idx - 18000.0) / 2600.0);
        node = min(node, 11.0);
        float e = audioChroma[int(node)] * 4.0;

        vec3 c3 = helixPos(fifthsIndex(node));
        float u = r1 * 6.2831853, v = acos(2.0 * r2 - 1.0);
        float rad = (0.42 + 0.85 * e) * pow(r3, 0.6);
        world = c3 + vec3(sin(v) * cos(u), cos(v), sin(v) * sin(u)) * rad;

        col = hueRot(vec3(1.0, 0.40, 0.25),
                     node / 12.0 * 3.1415927 + audioChromaHue);
        bright = (0.16 + 2.4 * e) * (0.8 + 0.4 * audioSwell);
        sizeMul = 0.85 + 0.8 * e;
    }
    else
    {
        // ---- The comet: a dense glow cloud at the center of effect ----
        float u = r1 * 6.2831853, v = acos(2.0 * r2 - 1.0);
        float rad = 0.85 * pow(r3, 0.75) * (1.0 + 0.35 * audioKick);
        world = ce + vec3(sin(v) * cos(u), cos(v), sin(v) * sin(u)) * rad;

        // White-hot core with the key's hue at the halo.
        vec3 halo = hueRot(vec3(1.0, 0.65, 0.30), audioChromaHue);
        col = mix(vec3(1.05, 1.0, 0.95), halo, pow(r3, 0.5));
        bright = (1.6 + 1.2 * audioOnset + 2.0 * audioDrop)
               * (0.85 + 0.35 * audioDownbeat);
        sizeMul = 1.25;
    }

    // Slow orbit of the whole tonal space.
    float oa = time * 0.05;
    world.xz = mat2(cos(oa), -sin(oa), sin(oa), cos(oa)) * world.xz;
    float tilt = 0.28 + 0.08 * sin(time * 0.037 + sceneSeed * 6.28);
    world.yz = mat2(cos(tilt), -sin(tilt), sin(tilt), cos(tilt)) * world.yz;

    vec3 vp = world + vec3(0.0, 0.0, 30.0);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.5)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(110.0 * sizeMul * (0.5 + 0.5 * r4) * px / dist,
                         1.5, 13.0 * px);

    vCol = vec4(col * bright * 2.8, 1.0);
}
