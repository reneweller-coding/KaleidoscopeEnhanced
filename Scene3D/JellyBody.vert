#version 330 core
// JellyBody.vert — a soft ELASTIC body that RINGS after every hit: the
// spring-mass idea seen through modal analysis.  A struck elastic body's
// response is a superposition of damped eigenmodes — and the engine's
// per-instrument onset envelopes (audioKick/Snare/Hat, exponentially
// decaying) ARE those damping envelopes.  Each instrument strikes its own
// mode family at a FIXED ring frequency (anti-flicker: only amplitudes
// vary, the oscillator phases run continuously):
//   KICK  -> the slow l=2 squash-and-stretch (volume-preserving wobble),
//   SNARE -> the l=3 three-lobed flex, rung at a higher pitch,
//   HAT   -> a fine high-order surface shimmer.
// Between hits the body settles into a gentle breathing rest — then the
// next kick SQUASHES it and it visibly rings down.  Sphere grid like
// SpectralOrb; the complement scene: impulse response instead of
// continuous spectral drive.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float sceneSeed;

uniform float audioKick;
uniform float audioSnare;
uniform float audioHat;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioDrop;

out vec3  vNorm;
out vec3  vView;
out float vDefo;
out float vHue;

// Damped modal displacement at direction d.  The envelopes decay host-side;
// cos(w*time) runs free — amplitude-gated ringing, no phase remapping.
float modes(vec3 d, float th, float ph)
{
    float x = d.x, y = d.y, z = d.z;
    float sp = sin(ph);
    float s = 0.0;

    // KICK: l=2 squash (Y20) + a tumbling l=2 partner, slow fat wobble.
    float ringK = cos(time * 9.0)  * 0.65 + cos(time * 6.2 + 1.3) * 0.35;
    s += audioKick * 0.16 * ringK * (3.0 * z * z - 1.0) * 0.5;
    s += audioKick * 0.09 * cos(time * 7.4 + 0.7) * (x * x - y * y);

    // SNARE: l=3 flex, faster ring.
    float ringS = cos(time * 16.0 + sceneSeed * 6.28);
    s += audioSnare * 0.11 * ringS * cos(3.0 * th) * sp * sp * sp;
    s += audioSnare * 0.07 * cos(time * 19.0 + 2.1) * (2.5 * z * z - 1.5) * z;

    // HAT: fine shimmer, high order, quick ring.
    s += audioHat * 0.040 * cos(time * 31.0) * cos(8.0 * th + 1.7) * pow(sp, 6.0);
    s += audioHat * 0.030 * cos(time * 27.0 + 0.9) * cos((10.5) * ph - 0.785);

    // Resting breath so the body never looks dead.
    s += 0.020 * sin(time * 1.1 + sceneSeed * 6.28) * (0.6 + 0.4 * audioSwell);

    return s;
}

vec3 jellyPoint(float u, float v)
{
    float th = u * 6.2831853;
    float ph = v * 3.1415927;
    vec3 d = vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th));

    float ra = time * 0.06;
    d.xz = mat2(cos(ra), -sin(ra), sin(ra), cos(ra)) * d.xz;
    float th2 = atan(d.z, d.x);
    float ph2 = acos(clamp(d.y, -1.0, 1.0));

    float defo = modes(d, th2, ph2);
    vec3 p = d * 8.5 * (1.0 + defo);

    // Volume-preserving squash-and-stretch on the kick: as it flattens in
    // y it bulges in xz (the classic animation principle, physically the
    // incompressibility of a jelly).
    float sq = 1.0 - 0.16 * audioKick * cos(time * 9.0);
    p.y  *= sq;
    p.xz /= sqrt(sq);

    return p;
}

void main()
{
    float u = attrA.x, v = attrA.y;

    vec3 p  = jellyPoint(u, v);
    // dU x dV points outward for this (theta, phi-from-north) mapping.
    vec3 pu = jellyPoint(u + 0.004, v);
    vec3 pv = jellyPoint(u, v + 0.004);
    vec3 nrm = normalize(cross(pu - p, pv - p));

    vec3 vp = p + vec3(0.0, 0.0, 27.0);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    vNorm = nrm;
    // Camera sits at MODEL-space (0,0,-27): vertices are shifted +27 in z
    // and the projection looks down -z — the +27 version put the "eye"
    // BEHIND the body and blew the fresnel term up to 4x (flat white blob).
    vView = normalize(vec3(0.0, 0.0, -27.0) - p);
    vDefo = clamp(abs(length(p) / 8.5 - 1.0) * 5.0, 0.0, 1.0);
    vHue  = audioChromaHue;
}
