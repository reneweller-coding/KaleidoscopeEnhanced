#version 330 core
/**
 * @file BioCell.vert
 * @brief Vertex stage companion to BioCell.frag -- see that file's header for
 * this scene's description.
 */
// BioCell.vert — a journey INSIDE a living cell: the membrane breathes
// around you with the bass, the nucleus pulses like a heart, mitochondria
// glow with the music's energy, filaments span the cytoplasm and vesicles
// sparkle on every onset.  A DROP is a wave of cell division energy.
// 60k points: 20 % membrane, 15 % nucleus, 20 % mitochondria,
// 20 % filaments, 25 % vesicles.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioBass;
uniform float audioLevel;
uniform float audioOnset;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioDrop;
uniform float audioKick;

out vec4 vCol;

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

    vec3  world;
    vec3  col;
    float glow = 1.0;

    // Kick pressure wave rippling out from the nucleus.
    float kickR = 8.0 + 34.0 * fract(time * 0.6);

    if (r1 < 0.20)
    {
        // ---- Membrane: the breathing wall of the world. ----
        float th = r2 * 6.2831853;
        float ph = acos(2.0 * r3 - 1.0);
        vec3 n = vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th));
        float R = 42.0 * (1.0 + 0.05 * audioBass)
                + sin(th * 8.0 + time * 0.6) * 0.9
                + sin(ph * 11.0 - time * 0.5) * 0.9;
        world = n * R;
        col = hueRot(vec3(0.20, 0.70, 0.65), audioChromaHue * 0.4);
        glow = 0.45 + 0.35 * r4 + 0.30 * audioBass;
    }
    else if (r1 < 0.35)
    {
        // ---- Nucleus: a heart of light with a dense nucleolus. ----
        float th = r2 * 6.2831853;
        float ph = acos(2.0 * r3 - 1.0);
        float rr = (r4 < 0.3) ? 2.2 * pow(fract(r4 * 10.0), 0.5)
                              : 5.5 + 2.2 * pow(fract(r4 * 7.0), 2.0);
        rr *= 1.0 + 0.12 * audioBass + 0.05 * sin(time * 2.2);
        world = vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th)) * rr;
        col = hueRot(vec3(0.85, 0.45, 0.80), audioChromaHue * 0.5);
        glow = (0.5 + 0.5 * audioLevel) * (1.4 - rr * 0.12);
    }
    else if (r1 < 0.55)
    {
        // ---- Mitochondria: 9 glowing capsules adrift in the cytoplasm.
        float m  = floor((r1 - 0.35) * 45.0);
        vec3 Cm = vec3(hash11(m * 3.1) - 0.5,
                       (hash11(m * 5.7) - 0.5) * 0.7,
                       hash11(m * 7.9) - 0.5) * 52.0;
        Cm += vec3(sin(time * 0.13 + m * 2.0),
                   sin(time * 0.17 + m * 4.0),
                   sin(time * 0.11 + m * 6.0)) * 2.5;
        // Capsule: cylinder with hemispheric caps, seeded orientation.
        float ax = hash11(m * 9.3) * 6.2831853;
        vec3 A = vec3(cos(ax), 0.35 * sin(ax * 2.0), sin(ax));
        float u = (r2 - 0.5) * 2.0;
        float th = r3 * 6.2831853;
        vec3 side = normalize(cross(A, vec3(0.0, 1.0, 0.0)));
        vec3 up2  = cross(side, A);
        world = Cm + A * u * 3.2
              + (side * cos(th) + up2 * sin(th)) * 1.3
                * sqrt(max(0.0, 1.0 - abs(u) * abs(u) * 0.6));
        col = hueRot(vec3(1.0, 0.55, 0.20), audioChromaHue * 0.3);
        glow = 0.35 + 0.7 * audioLevel + 0.5 * audioSwell;
    }
    else if (r1 < 0.75)
    {
        // ---- Cytoskeleton filaments: taut light-fibres. ----
        float f = floor((r1 - 0.55) * 90.0);       // 18 fibres
        vec3 P0 = vec3(hash11(f * 2.1) - 0.5, hash11(f * 4.3) - 0.5,
                       hash11(f * 6.5) - 0.5) * 60.0;
        vec3 P1 = vec3(hash11(f * 8.7) - 0.5, hash11(f * 10.9) - 0.5,
                       hash11(f * 12.1) - 0.5) * 60.0;
        float u = r2;
        world = mix(P0, P1, u);
        world += vec3(sin(u * 9.0 + time * 0.8 + f),
                      cos(u * 7.0 + time * 0.6 + f),
                      sin(u * 8.0 - time * 0.7)) * 0.8;
        col = hueRot(vec3(0.35, 0.85, 0.80), audioChromaHue * 0.4);
        glow = (0.22 + 0.30 * r4)
             * (0.7 + 0.6 * sin(u * 30.0 - time * 3.0 + f));  // transport!
    }
    else
    {
        // ---- Vesicles: drifting bubbles that sparkle on onsets. ----
        vec3 P = vec3(r2 - 0.5, (r3 - 0.5) * 0.8, r4 - 0.5) * 66.0;
        P += vec3(sin(time * 0.19 + r4 * 40.0),
                  sin(time * 0.23 + r2 * 40.0),
                  sin(time * 0.15 + r3 * 40.0)) * 2.0;
        world = P;
        col = hueRot(vec3(0.55, 0.75, 1.0), audioChromaHue * 0.5 + r2);
        float spark = (fract(r3 * 23.0) > 0.75) ? audioOnset : 0.0;
        glow = 0.18 + 0.25 * r4 + 1.4 * spark;
    }

    // Kick pressure wave brightens whatever shell it passes.
    glow *= 1.0 + (0.6 * audioKick + 1.4 * audioDrop)
                  * exp(-abs(length(world) - kickR) * 0.15);

    // Camera drifts through the cytoplasm on a slow loop.
    float ca  = time * 0.05;
    vec3 camP = vec3(cos(ca) * 17.0, sin(time * 0.04) * 8.0, sin(ca) * 17.0);
    vec3 fwd  = normalize(-camP + vec3(0.0, 0.0, 0.001));
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
    gl_PointSize = clamp(260.0 * (0.4 + 0.8 * r4) * px / dist, 2.0, 30.0 * px);   // sprite sweep: organelles were 2-px dust

    col *= glow * clamp(1.0 - vp.z / 110.0, 0.0, 1.0);
    vCol = vec4(col * 1.8, 1.0);
}
