#version 330 core
/**
 * @file EchoSpiral.vert
 * @brief Vertex stage companion to EchoSpiral.frag -- see that file's header for
 * this scene's description.
 */
// EchoSpiral.vert — WHIPPING LIGHT-SNAKES: 20 comet ribbons chase their own
// heads along seeded 3D Lissajous orbits, each ribbon the fading TRAIL of
// its comet (t = age along the trail).  The swarm braids, whips and
// crosses itself; kicks crack the whips (a burst of extra speed makes the
// trails snap taut), a drop scatters the orbits wide for a beat.  The old
// flat log-spiral zoom lived here — this is its spectacular successor.
//   attrA.x = t along the trail (0 head .. 1 tail end)
//   attrA.y = side (ribbon thickness), attrA.w = ribbon index

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioDrop;

out vec4  vCol;
out float vSide;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

// Seeded Lissajous orbit for snake ri at path phase ph.
vec3 orbit(float ri, float ph)
{
    float fa = 1.0 + floor(hash11(ri * 3.1) * 3.0);   // 1..3
    float fb = 2.0 + floor(hash11(ri * 5.7) * 3.0);   // 2..4
    float fc = 1.0 + floor(hash11(ri * 7.3) * 2.0);   // 1..2
    float oa = hash11(ri * 9.1) * 6.2831853;
    float ob = hash11(ri * 11.7) * 6.2831853;
    vec3 amp = vec3(11.0, 7.5, 6.0) * (0.8 + 0.4 * hash11(ri * 13.3))
             * (1.0 + 0.6 * audioDrop);              // drop scatters wide
    return vec3(sin(ph * fa + oa) * amp.x,
                sin(ph * fb + ob) * amp.y,
                sin(ph * fc + oa * 0.5) * amp.z);
}

void main()
{
    float t    = attrA.x;                    // 0 head .. 1 tail
    float side = attrA.y;
    float ri   = attrA.w;

    // Head phase: continuous flight, music-fed; the TRAIL samples the orbit
    // BACKWARD in phase, so the ribbon is the comet's frozen wake.  Kicks
    // add speed through the integrated advance (the whips crack).
    float headPh = time * (0.55 + 0.18 * hash11(ri * 17.9))
                 + audioAdvance * 0.9 + ri * 2.4;
    float trailLen = 1.6 * (0.7 + 0.6 * hash11(ri * 19.3));
    float ph = headPh - t * trailLen;

    vec3 p = orbit(ri, ph);

    // Ribbon thickness: fat glowing head, thin tail; side pushes along a
    // stable normal (perp to the local velocity).
    vec3 vel = orbit(ri, ph + 0.02) - p;
    vec3 nrm = normalize(cross(vel, vec3(0.0, 1.0, 0.35)) + vec3(1e-4));
    float thick = mix(0.55, 0.06, t) * (1.0 + 0.5 * audioKick);
    p += nrm * side * thick;

    // Slow orbit camera around the braid.
    float oa = time * 0.05;
    p.xz = mat2(cos(oa), -sin(oa), sin(oa), cos(oa)) * p.xz;

    vec3 vp = p + vec3(0.0, 0.0, 30.0);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.5)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    // Colour: each snake its own hue around the key; the head burns white.
    vec3 col = hueRot(vec3(1.0, 0.35, 0.7), audioChromaHue + hash11(ri * 23.7) * 2.2);
    col = mix(vec3(1.05, 1.0, 0.95), col, smoothstep(0.0, 0.22, t));
    col *= (1.0 - t * 0.85)                              // trail fades out
         * (0.9 + 0.5 * audioSwell + 0.8 * audioKick + 1.3 * audioDrop);

    vCol  = vec4(col * 2.4, 1.0);
    vSide = side;
}
