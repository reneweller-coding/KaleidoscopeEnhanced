#version 330 core
/**
 * @file StrangeAttractor.vert
 * @brief Vertex stage companion to StrangeAttractor.frag -- see that file's header for
 * this scene's description.
 */
// StrangeAttractor.vert — 600 trajectories x 100 steps on a CHAOTIC
// ATTRACTOR: each vertex (trajectory, step) Euler-integrates its `step`
// count of iterations (<= 100, so chaotic divergence stays bounded and the
// shape evolves smoothly) from a seeded start.  The activation's sceneSeed
// picks the dynamical system — Lorenz, Thomas, Aizawa or Halvorsen — so
// the scene returns as four entirely different chaotic beings: butterfly
// wings, soft knots, ribbed shells, looping bands.  Audio breathes through
// the parameters gently (smoothed features only — chaos amplifies, so the
// inputs must be slow), speed of travel along the trajectories rides the
// music's advance, velocity magnitude paints the colour.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;
uniform float sceneSeed;

uniform float audioSwell;
uniform float audioCentroid;
uniform float audioKick;
uniform float audioChromaHue;
uniform float audioDrop;
uniform float audioAdvance;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioValence;

out vec4 vCol;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

// One Euler step of the chosen system (sys 0..3).
vec3 field(vec3 p, float sys)
{
    if (sys < 0.5)          // Lorenz (sigma 10, beta 8/3; rho breathes)
    {
        float rho = 26.0 + 6.0 * audioSwell;
        return vec3(10.0 * (p.y - p.x),
                    p.x * (rho - p.z) - p.y,
                    p.x * p.y - 2.6667 * p.z);
    }
    else if (sys < 1.5)     // Thomas (cyclically symmetric, soft knots)
    {
        float b = 0.19 + 0.05 * audioCentroid;
        return vec3(sin(p.y) - b * p.x,
                    sin(p.z) - b * p.y,
                    sin(p.x) - b * p.z) * 6.0;
    }
    else if (sys < 2.5)     // Aizawa (ribbed shell)
    {
        float a = 0.95, b = 0.7, c = 0.6 + 0.1 * audioSwell;
        float d = 3.5, e = 0.25, f = 0.1;
        return vec3((p.z - b) * p.x - d * p.y,
                    d * p.x + (p.z - b) * p.y,
                    c + a * p.z - p.z * p.z * p.z / 3.0
                      - (p.x * p.x + p.y * p.y) * (1.0 + e * p.z)
                      + f * p.z * p.x * p.x * p.x) * 1.6;
    }
    else                    // Halvorsen (looping bands)
    {
        float a = 1.4 + 0.25 * audioCentroid;
        return vec3(-a * p.x - 4.0 * p.y - 4.0 * p.z - p.y * p.y,
                    -a * p.y - 4.0 * p.z - 4.0 * p.x - p.z * p.z,
                    -a * p.z - 4.0 * p.x - 4.0 * p.y - p.x * p.x) * 0.9;
    }
}

void main()
{
    float idx  = attrA.w;
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    const float STEPS = 100.0;
    float traj = floor(idx / STEPS);          // 0..599
    float stp  = mod(idx, STEPS);             // 0..99 along the trajectory

    float sys = floor(mod(sceneSeed * 7.9, 4.0));

    // Trajectory start: seeded cloud near the attractor; the whole cloud
    // slides slowly along the flow via the advance phase (the swarm keeps
    // travelling instead of freezing).
    vec3 p = vec3(hash11(traj * 3.1) - 0.5,
                  hash11(traj * 5.7) - 0.5,
                  hash11(traj * 7.3) - 0.5) * 6.0;
    if (sys < 0.5) p.z += 24.0;               // Lorenz sits high in z

    float dt = 0.0045;
    float lead = mod(audioAdvance * 2.0 + hash11(traj * 9.7) * STEPS, STEPS);
    float nSteps = stp + lead;

    vec3 vel = vec3(0.0);
    for (int i = 0; i < 200; ++i)
    {
        if (float(i) >= nSteps) break;
        vel = field(p, sys);
        p  += vel * dt;
    }

    // Normalise the very different system scales into one view box.
    vec3 world = p;
    if (sys < 0.5)      world = (p - vec3(0.0, 0.0, 25.0)) * 0.42;
    else if (sys < 1.5) world = p * 2.4;
    else if (sys < 2.5) world = p * 5.0;
    else                world = p * 1.05;

    float oa = time * 0.055;
    world.xz = mat2(cos(oa), -sin(oa), sin(oa), cos(oa)) * world.xz;
    float tilt = 0.35;
    world.yz = mat2(cos(tilt), -sin(tilt), sin(tilt), cos(tilt)) * world.yz;

    // ORBIT (user feedback): the camera circles the attractor
    vec3 vp = world;
    float yaw = time * 0.16 + audioAdvance * 0.08;
    float cy = cos(yaw), sy = sin(yaw);
    vp.xz = mat2(cy, -sy, sy, cy) * vp.xz;
    float pit = 0.30 * sin(time * 0.12);
    float pc2 = cos(pit), ps2 = sin(pit);
    vp.yz = mat2(pc2, -ps2, ps2, pc2) * vp.yz;
    vp += vec3(0.0, 0.0, 30.0);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.5)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(95.0 * (0.5 + 0.5 * r4) * px / dist, 1.5, 10.0 * px);

    // Velocity magnitude -> colour heat; the head of each trajectory glows.
    float sp = clamp(length(vel) * 0.05, 0.0, 1.0);
    float head = smoothstep(70.0, 99.0, stp);
    vec3 col = imgPalette(0.30 * sp + traj * 0.0003) * 1.4;
    col *= (0.35 + 0.85 * sp + 0.9 * head)
         * (0.8 + 0.4 * audioSwell + 0.3 * audioKick + 0.9 * audioDrop);

    vCol = vec4(col * 2.9, 1.0);
}
