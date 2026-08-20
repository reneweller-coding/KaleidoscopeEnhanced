#version 330 core
/**
 * @file WormholeMirrorWeave.vert
 * @brief A first-person flight through a wormhole made of 20 glowing ribbons -- unlike the
 * existing RibbonTunnel (ribbons simply distributed evenly around a steady tube), these ribbons
 * are placed with REAL mirror-kaleidoscope symmetry (index-picked wedge + alternating mirror,
 * same construction as ParticleTunnelFlight.vert) and the tube's own radius pulses through
 * periodic pinch points along its length -- a true wormhole throat silhouette, not a steady pipe.
 * Camera flies straight down the tube axis, riding the same weave the ribbons follow.
 *   audioAdvance -> forward flight speed (integrated, jump-free)
 *   audioBass    -> throat pinch depth
 *   audioKick    -> brief radius shockwave near the camera
 *   audioPhase   -> ribbon twist / kaleidoscope spin
 */

in vec4 attrA;   // x = t [0,1] along the tube, y = side (-1/+1), w = ribbon index (0..19)
in vec4 attrB;   // 4 random seeds in [0,1)

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioPhase;
uniform float audioBass;
uniform float audioKick;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioValence;

uniform int   sidesP;     // kaleidoscope wedge count (0 -> 6; 4..8)
uniform float speedP;     // flight speed multiplier (0 -> 1.0; 0.6..1.7)
uniform float pinchP;     // throat pinch depth (0 -> 0.6; 0.4..0.8)
uniform int   throatsP;   // pinch points per tube loop (0 -> 3; 2..5)
uniform float hueP;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

out vec3  vCol;
out float vSide;

const float TUBE_LEN = 40.0;
const float NUM_RIBBONS = 20.0;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float t    = attrA.x;
    float side = attrA.y;
    float ri   = attrA.w;
    vec4 seeds = attrB;

    float sidesV   = (sidesP   < 4) ? 6.0 : float(sidesP);
    float speedV   = (speedP   <= 0.01) ? 1.0 : speedP;
    float pinchV   = (pinchP   <= 0.01) ? 0.6 : pinchP;
    float throatsV = (throatsP < 2) ? 3.0 : float(throatsP);

    // Mirror-kaleidoscope ribbon placement: each ribbon belongs to one of
    // sidesV wedges (picked by index, not randomly), alternating wedges
    // mirrored -- real symmetry, not just even rotational spacing.
    float perWedge = NUM_RIBBONS / sidesV;
    float wedge    = 6.2831853 / sidesV;
    float copy     = mod(floor(ri / perWedge), sidesV);
    float frac     = mod(ri, perWedge) / perWedge;
    float baseAng  = frac * wedge * 0.5;
    float mirrored = (mod(copy, 2.0) < 0.5) ? baseAng : (wedge * 0.5 - baseAng);
    float ang0     = mirrored + copy * wedge;

    float camZ = time * 5.5 * speedV + audioAdvance * 14.0 * speedV;
    float z    = mod(t * TUBE_LEN - camZ, TUBE_LEN);

    // Twist + kaleidoscope spin, integrated.
    float twist = z * 0.05 + audioPhase * 0.3 + time * 0.01;
    float ang   = ang0 + twist;

    // Wormhole throat: radius pulses through periodic pinch points along
    // the tube (a real hourglass silhouette repeating down its length),
    // deepened by the bass and briefly shocked outward on a kick.
    float pinchPhase = z * (6.2831853 * throatsV / TUBE_LEN);
    float throat = 1.0 - pinchV * (1.0 + 0.35 * audioBass) * pow(0.5 + 0.5 * cos(pinchPhase), 3.0);
    // Floor kept well clear of zero: a pinch point that closes down near the
    // camera's own z would bring ribbons close enough to the lens to smear
    // additively across the whole peripheral field of view (a blown-out
    // white wash framing the tunnel instead of a clean throat silhouette).
    float rad = 2.4 * max(throat, 0.34) + audioKick * exp(-z * 0.4) * 0.5;

    vec2 c2 = vec2(cos(ang), sin(ang)) * rad;
    vec2 tangent = vec2(-sin(ang), cos(ang));
    c2 += tangent * side * (0.22 + 0.14 * seeds.y);

    vec3 vp = vec3(c2.x, c2.y, z);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (z < 0.6) gl_Position = vec4(0.0, 0.0, -3.0, 1.0);   // clip segments behind the camera

    vSide = side;
    vec3 col = imgPalette(0.5 + 0.5 * sin(ang0 * sidesV * 0.5 + z * 0.08)) * 1.5;
    col = mix(col, vec3(1.0, 0.9, 0.6), clamp(audioKick * exp(-z * 0.4), 0.0, 1.0));
    if (hueP > 0.001) col = hueRot(col, hueP);
    vCol = col;
}
