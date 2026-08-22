#version 330 core
/**
 * @file ParticleTunnelFlight.vert
 * @brief 60,000 points arranged as rings around a long recycling tunnel, folded into a real
 * mirror-kaleidoscope cross-section (sidesP wedges, alternating copies mirrored) instead of a
 * plain circular tube -- genuine 3D depth/parallax through a kaleidoscopic tunnel, unlike the
 * fragment-shader 2D folds and raymarched tunnels already in the catalogue. The camera flies
 * straight down +Z at an audio-integrated speed; each point's fixed identity Z position is
 * wrapped modulo the tunnel length relative to the camera, so points recycle seamlessly into an
 * infinite flight instead of ever running out.
 *   audioAdvance -> forward flight speed (integrated, jump-free)
 *   audioPhase   -> cross-section spin
 *   audioKick    -> radial shockwave pulse + brief brightness flash
 *   audioSwell   -> tunnel radius breathes
 *   audioSubBass -> lateral camera sway strength
 */

in vec4 attrA;   // .w = point index
in vec4 attrB;   // 4 random seeds in [0,1)

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioPhase;
uniform float audioKick;
uniform float audioSwell;
uniform float audioSubBass;
uniform float audioHigh;

uniform int   sidesP;      // kaleidoscope wedge count (0 -> 6; 4..10)
uniform float speedP;      // flight speed multiplier (0 -> 1.0; 0.6..1.8)
uniform float radiusP;     // tunnel radius (0 -> 3.2; 2.4..4.2)
uniform float hueP;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioChromaHue;
uniform float audioValence;

out vec4  vCol;
out float vLife;

const float N = 60000.0;
const float TUNNEL_LEN = 40.0;
const float NUM_RINGS  = 48.0;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

// IMG-PALETTE (house standard): see Tools/SHADER_AUTHORING.md V8b.
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
    float idx  = attrA.w;
    vec4 seeds = attrB;

    float sidesV  = (sidesP < 4) ? 6.0 : float(sidesP);
    float speedV  = (speedP  <= 0.01) ? 1.0 : speedP;
    float radiusV = (radiusP <= 0.01) ? 3.2 : radiusP;

    // Ring-clustered longitudinal placement: a discrete ring index (a classic
    // "rings rushing past" cadence) plus a small per-point jitter within it,
    // rather than a uniform random smear along the tunnel's length.
    float ringIdx = floor(seeds.z * NUM_RINGS);
    float ringZ   = (ringIdx + 0.5) / NUM_RINGS * TUNNEL_LEN;
    float baseZ   = ringZ + (seeds.w - 0.5) * (TUNNEL_LEN / NUM_RINGS) * 0.7;

    // Mirror-kaleidoscope cross-section: each point belongs to one of sidesV
    // wedges (picked by point index, not randomly, so the wedge population is
    // even); its angle within the wedge comes from seeds.x, and alternating
    // wedges are mirrored -- real 3D mirror symmetry, not a fragment fold.
    float wedge  = 6.2831853 / sidesV;
    float copy   = mod(floor(idx / (N / sidesV)), sidesV);
    float baseAng = seeds.x * wedge * 0.5;
    float mirrored = (mod(copy, 2.0) < 0.5) ? baseAng : (wedge * 0.5 - baseAng);
    float ang = mirrored + copy * wedge;

    // Flower-petal radius ripple (angular, mirrors the fold) + longitudinal
    // ring pulse travelling down the tunnel, both audio-breathing.
    float petals = sin(ang * sidesV) * 0.5 + 0.5;
    float ringPulse = sin(baseZ * 0.8 - audioAdvance * 1.4) * 0.5 + 0.5;
    float rad = radiusV * (1.0 + 0.55 * audioSwell)
              * (0.72 + 0.18 * petals + 0.10 * ringPulse)
              + seeds.y * 0.35;

    // Kick shockwave: a brief radial pulse that expands outward from the
    // camera's current position, strongest near it and fading with distance.
    float camZflight = time * 1.6 * speedV + audioAdvance * 2.2 * speedV;
    float relZ = mod(baseZ - camZflight, TUNNEL_LEN);
    float shock = audioKick * exp(-relZ * 0.35);
    rad += shock * 0.6;

    // Cross-section spin: integrated audio phase, jump-free.
    float spin = audioPhase * 0.5 + time * 0.03;
    float ca = cos(spin), sa = sin(spin);
    vec2 xy = vec2(cos(ang) * rad, sin(ang) * rad);
    xy = mat2(ca, -sa, sa, ca) * xy;

    // Camera sways gently side to side (integrated), so the flight feels
    // alive instead of a dead-straight rail.
    vec2 sway = vec2(sin(audioAdvance * 0.35), cos(audioAdvance * 0.27)) * (0.4 + 0.5 * audioSubBass);

    // Camera stays at view-space origin looking down +Z; relZ (already in
    // [0, TUNNEL_LEN)) is the point's distance ahead of the camera. A base
    // offset keeps the nearest ring safely beyond the near plane.
    vec3 vp = vec3(xy - sway, relZ + 1.4);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    // Point sprite size by depth and shock -- capped low (V8c): 60,000
    // additive sprites integrate area, not just gain.
    float pSize = (2.5 + shock * 5.0 + audioHigh * 1.5) * (26.0 / max(vp.z, 1.0));   // sprite sweep
    gl_PointSize = clamp(pSize, 1.0, 30.0);

    vec3 baseCol = imgPalette(0.5 + 0.5 * sin(ang * sidesV * 0.5 + relZ * 0.1)) * 2.0;
    baseCol = mix(baseCol, vec3(1.0, 0.92, 0.55), clamp(shock * 1.5, 0.0, 1.0));
    if (hueP > 0.001) baseCol = hueRot(baseCol, hueP);

    vCol  = vec4(baseCol, 1.0);
    vLife = shock;
}
