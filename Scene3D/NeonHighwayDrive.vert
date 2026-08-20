#version 330 core
/**
 * @file NeonHighwayDrive.vert
 * @brief A genuine ground-plane "driving" effect -- undulating terrain either side of a flattened
 * road strip, with roadside pylons periodically spiking out of the heightfield -- rather than the
 * tube/tunnel raymarch flythroughs already in the catalogue. The camera itself stays put; the
 * height and pylon functions are phase-scrolled by the integrated drive distance instead (the
 * same "treadmill" trick a scrolling texture uses), so the road reads as endless and the pylons
 * as rushing past, without ever having to translate or recycle the mesh itself.
 *   audioAdvance -> forward drive speed (integrated, jump-free)
 *   audioBass    -> terrain undulation depth
 *   audioKick    -> pylon flash + brief height pulse
 *   audioHigh    -> road-surface shimmer ripple
 */

in vec4 attrA;   // .xy = cell UV [0,1] for geom=grid
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioBass;
uniform float audioKick;
uniform float audioHigh;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioValence;

uniform float speedP;      // drive speed multiplier (0 -> 1.0; 0.6..1.7)
uniform float pylonP;      // pylon height multiplier (0 -> 1.0; 0.6..1.6)
uniform float terrainP;    // terrain undulation depth (0 -> 1.0; 0.5..1.5)
uniform float hueP;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

out vec3  vWorldPos;
out vec3  vNormal;
out float vRoadMask;
out float vPylonGlow;
out vec3  vTint;

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
    float speedV   = (speedP   <= 0.01) ? 1.0 : speedP;
    float pylonV   = (pylonP   <= 0.01) ? 1.0 : pylonP;
    float terrainV = (terrainP <= 0.01) ? 1.0 : terrainP;

    // Scene3DShader supplies attrA.xy in [0,1] for geom="grid"; remap to a
    // centred domain (Tools/SHADER_AUTHORING.md V2).
    vec2 gridUV = attrA.xy * 2.0 - 1.0;

    float worldX = gridUV.x * 9.0;
    float worldZ = gridUV.y * 15.0;

    // Integrated forward drive: the mesh itself never moves, but the height
    // and pylon functions are scrolled by it, so the road reads as endless.
    float drive = time * 1.1 * speedV + audioAdvance * 1.6 * speedV;
    float scrolledZ = worldZ + drive;

    // Flattened road strip either side of x=0.
    float roadHalfW = 2.4;
    float roadMask  = 1.0 - smoothstep(roadHalfW * 0.55, roadHalfW, abs(worldX));

    // Rolling terrain either side of the road.
    float terrain = sin(worldX * 0.35 + scrolledZ * 0.08) * 0.9
                  + sin(worldX * 0.9  - scrolledZ * 0.14) * 0.35;
    terrain *= terrainV * (1.0 + 0.35 * audioBass);

    // Road-surface shimmer (subtle, so it still reads as a road not dunes).
    float shimmer = sin(worldX * 6.0 + scrolledZ * 2.5) * 0.02 * (1.0 + audioHigh * 1.5);

    // Roadside pylon lane: a periodic sharp spike along Z, only near the
    // lane band either side of the road -- rushes past as scrolledZ advances.
    float pylonOffsetX = roadHalfW + 1.0;
    float laneDist = abs(abs(worldX) - pylonOffsetX);
    float laneMask = smoothstep(0.5, 0.0, laneDist);
    float pylonSpacing = 5.5;
    float zPhase = mod(scrolledZ, pylonSpacing) / pylonSpacing;   // 0..1
    float pylonShape = pow(max(0.0, cos(zPhase * 6.2831853)), 10.0);
    float kickPulse = 1.0 + audioKick * 0.6;
    float pylonHeight = laneMask * pylonShape * 5.0 * pylonV * kickPulse;

    float height = mix(terrain, 0.0, roadMask) + shimmer + pylonHeight;

    vec3 pos = vec3(worldX, height - 1.0, worldZ);
    vWorldPos = pos;

    // Normal from the analytic slope (finite-difference-free, matches the
    // terrain/pylon height function's own gradient direction).
    float dHdx = (mix(cos(worldX * 0.35 + scrolledZ * 0.08) * 0.315
                     + cos(worldX * 0.9  - scrolledZ * 0.14) * 0.315,
                       0.0, roadMask)) * terrainV;
    vNormal = normalize(vec3(-dHdx, 1.0, -0.15));

    // Camera: low, close to the road surface, looking forward with a
    // shallow downward tilt -- a driving view, not a bird's-eye dune view.
    vec3 vp = pos;
    vp.y -= 0.55;
    float camTilt = -0.16;
    float cosT = cos(camTilt), sinT = sin(camTilt);
    vp = vec3(vp.x, vp.y * cosT - vp.z * sinT, vp.y * sinT + vp.z * cosT);
    vp.z += 9.5 - audioSwell * 1.2;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vRoadMask  = roadMask;
    vPylonGlow = clamp(pylonHeight * 0.3 + audioKick * laneMask * 0.5, 0.0, 1.5);

    vec3 tint = imgPalette(0.5 + 0.5 * sin(worldX * 0.2 + scrolledZ * 0.05)) * 1.2;
    if (hueP > 0.001) tint = hueRot(tint, hueP);
    vTint = tint;
}
