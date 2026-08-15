#version 330 core
// PlasmaVortexGrid.vert — 220x120 heightfield grid deformed into a swirling
// relativistic energy whirlpool with Bessel wave harmonics and glowing grid lines.
//   attrA.xy = u/v, attrA.w = cell index
//   attrB    = per-cell seeds
// True stereo: eyeOff shifts view; convergence re-centres after proj.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioHigh;
uniform float audioSwell;
uniform float audioDrop;
uniform float audioSpectrum[32];

uniform float depthP;
uniform float rippleP;
uniform float glowP;
uniform float hueP;

out vec3 vWorld;
out vec2 vUV;
out vec4 vCol;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float u = attrA.x;
    float v = attrA.y;

    float dpth = (depthP  > 0.0) ? depthP  : 1.0;
    float rpl  = (rippleP > 0.0) ? rippleP : 1.0;
    float glw  = (glowP   > 0.0) ? glowP   : 1.0;
    float hue  = (hueP    > 0.0) ? hueP    : 0.0;

    // Convert u,v to radial coordinates centered on grid
    float x = (u - 0.5) * 80.0;
    float z = (v - 0.5) * 80.0;
    float r = sqrt(x * x + z * z);
    float a = atan(z, x);

    // Relativistic vortex rotation (differential angular velocity)
    float vortexSpin = (6.0 / (r + 2.0)) * (time * 1.5 + audioAdvance * 2.0);
    float twistedA = a + vortexSpin;

    // Gravitational funnel depth
    float funnel = - (18.0 * dpth) / (r * 0.25 + 1.2) - audioSubBass * 4.0;

    // Bessel wave ripples propagating outwards
    float ripplePhase = r * (0.6 * rpl) - time * 4.0 - audioAdvance * 2.0;
    int band = int(clamp(r / 40.0 * 31.0, 0.0, 31.0));
    float waveH = sin(ripplePhase) * (1.5 + audioSpectrum[band] * 2.5);

    // Shockwave tsunami from audioKick
    float shock = sin(r * 0.8 - fract(time * 2.0) * 20.0) * exp(-r * 0.08) * audioKick * 3.5;

    float finalH = funnel + waveH + shock;

    // Swirled x, z coordinates
    float swirledX = cos(twistedA) * r;
    float swirledZ = sin(twistedA) * r;

    vec3 worldP = vec3(swirledX, finalH, swirledZ);

    // Camera banking around and looking into the funnel
    float camAngle = time * 0.15 + audioAdvance * 0.05;
    float camDist = 32.0 - audioSwell * 6.0;
    vec3 camPos = vec3(sin(camAngle) * camDist, 18.0 + 4.0 * sin(time * 0.2), cos(camAngle) * camDist);
    vec3 lookTarget = vec3(0.0, -6.0, 0.0);

    vec3 ww = normalize(lookTarget - camPos);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);

    vec3 relP = worldP - camPos;
    vec3 viewP = vec3(dot(relP, uu), dot(relP, vv), dot(relP, ww));

    viewP.x -= eyeOff;
    gl_Position = projM * vec4(viewP.x, viewP.y, -viewP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vWorld = worldP;
    vUV = attrA.xy;

    // Color gradient from fiery center to electric violet rim
    vec3 vortexCol = mix(vec3(1.0, 0.2, 0.05), vec3(0.05, 0.8, 1.0), clamp(r / 35.0, 0.0, 1.0));
    vortexCol = mix(vortexCol, vec3(0.9, 0.1, 1.0), sin(twistedA * 3.0) * 0.5 + 0.5);

    if (hue > 0.001) vortexCol = hueRot(vortexCol, hue);

    vCol = vec4(vortexCol * glw, 1.0);
}
