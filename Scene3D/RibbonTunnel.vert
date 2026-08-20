#version 330 core
/**
 * @file RibbonTunnel.vert
 * @brief Vertex stage companion to RibbonTunnel.frag -- see that file's header for
 * this scene's description.
 */
// RibbonTunnel.vert — a REAL 3D tunnel of 20 glowing ribbons twisting around
// the flight path, each on its own nested shell (radius 2.5 to 10.6) so the
// tube reads as a depth of layers rather than one hollow wall.  The tube
// weaves through space, the bar phase swings the twist, every kick bulges the
// tunnel just ahead of the camera, drops light all ribbons.  Additive glow, no
// depth test (order-independent).
//   attrA.x = t along the tube, attrA.y = side (-1/+1), attrA.w = ribbon index
//   attrB   = per-ribbon seeds
// True stereo: eyeOff shifts the view; convergence re-centres after proj.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioBarPhase;
uniform float audioKick;
uniform float audioBass;
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

void main()
{
    float t    = attrA.x;                     // 0..1 along the tube
    float side = attrA.y;                     // ribbon cross direction
    float ri   = attrA.w;

    const float L = 160.0;
    float camZ = time * 5.5 + audioAdvance * 14.0;   // noticeably faster flight
    float z    = mod(t * L - camZ, L);        // 0..L ahead of the camera

    // The tube centre weaves HARD through ABSOLUTE space — the slalom curve
    // scrolls past the camera (a weave over relative z is a frozen shape:
    // that static look was exactly the old scene's problem).
    // Long, sweeping curves (the fast weave shook the frame nervously).
    float zAbs = z + camZ;
    vec2 cw = vec2(sin(zAbs * 0.020 + 1.3), cos(zAbs * 0.016)) * 9.0
            + vec2(sin(zAbs * 0.007), cos(zAbs * 0.006 + 2.0)) * 6.0;

    // Ribbon angle around the tube: per-ribbon slot + twist along z + a
    // smooth per-bar swing.
    float ang = ri / 20.0 * 6.2831853
              + z * 0.035
              + 0.5 * sin(6.2831853 * audioBarPhase)
              + time * 0.05 + attrB.x * 6.2831853;

    // NESTED radii: one shared radius drew all 20 ribbons onto a single tube
    // wall, which left the vanishing point and the four corners of the frame
    // empty (the scan measured a third of the picture black).  A golden-ratio
    // spread gives every ribbon its own shell, from a tight one that carries
    // the centre of the view out to wide ones that sweep the edges.
    float rmul = 0.42 + 1.35 * fract(ri * 0.6180339);

    // Radius: swell breathes it, the kick bulges the tunnel just ahead.
    float rad = 6.0 * rmul * (1.0 + 0.10 * audioSwell + 0.06 * audioBass)
              + 1.6 * audioKick * rmul * exp(-abs(z - 14.0) * 0.10);

    vec2 c2 = cw + vec2(cos(ang), sin(ang)) * rad;
    vec2 tangent = vec2(-sin(ang), cos(ang));
    c2 += tangent * side * (0.35 + 0.25 * attrB.y) * (0.6 + 0.5 * rmul);

    // Camera rides the SAME weave slightly ahead of its own position (it
    // flies inside the slalom) and rolls into the curves.
    float camA = camZ + 2.0;
    vec2 camW = vec2(sin(camA * 0.020 + 1.3), cos(camA * 0.016)) * 9.0
              + vec2(sin(camA * 0.007), cos(camA * 0.006 + 2.0)) * 6.0;
    vec3 vp = vec3(c2.x - camW.x, c2.y - camW.y, z);
    float roll = 0.14 * cos(camA * 0.020 + 1.3);          // gentle bank
    vp.xy = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * vp.xy;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.06 * gl_Position.w;   // converge ~20 units out
    if (z < 0.6)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);      // behind camera: clipped

    // Neon colour per ribbon, key-hue drift, distance fog + kick highlight.
    // Bounded hue spread (was a full-circle rainbow across the ribbons)
    vec3 col = hueRot(vec3(0.2, 0.7, 1.0),
                      attrB.z * 0.9 + sin(audioChromaHue) * 0.5);
    float kickGlow = audioKick * exp(-abs(z - 14.0) * 0.10);
    col *= (0.5 + 0.5 * attrB.w)
         * (1.0 + 1.5 * kickGlow + 1.2 * audioDrop);
    // A touch less fog than the old 0.020: with the ribbons spread over nested
    // shells, the far half of the tunnel is what carries the frame's edges,
    // and at 0.020 it had faded to nothing before it got there.
    float fog = exp(-z * 0.016);
    vCol  = vec4(col * fog * 1.15, 1.0);
    vSide = side;
}
