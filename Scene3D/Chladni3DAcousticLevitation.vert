#version 330 core
/**
 * @file Chladni3DAcousticLevitation.vert
 * @brief Vertex stage companion to Chladni3DAcousticLevitation.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xyz = cube corner (-0.5..0.5), w = cube index
in vec4 attrB; // 4 seeds in [0,1)

out vec3 vNormal;
out vec3 vCol;
out float vAcousticNode;
out vec3 vLocalPos;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;
uniform vec2 resolution;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioChromaHue;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float nodeDensityP;
uniform float particleSizeP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

// Smooth Gor'kov clustering: a monotone warp of one axis that pulls particles
// toward the pressure NODES of cos(k*x + ph) (the zeros at pi/2 + n*pi) and
// away from the antinodes.  Deliberately NOT a snap-to-nearest-node -- a snap
// makes a particle jump a whole node spacing the instant the drifting phase
// crosses a cell boundary.  a < 0.5 keeps the map invertible, so particles
// never cross each other.
float gorkovClump(float x, float k, float ph, float a)
{
    return x + a * sin(2.0 * (k * x + ph)) / k;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

void main()
{
    vec3 corner = attrA.xyz;
    float cIndex = attrA.w;
    vLocalPos = corner;
    
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // 3D acoustic standing wave pressure field in ultrasonic levitation chamber
    // P(x,y,z) = cos(nx*x)*cos(ny*y)*cos(nz*z)
    float kNodes = (nodeDensityP > 0.01 ? nodeDensityP : 3.0);

    // ---- the levitation CHAMBER, sized to the view frustum ---------------
    // The old build hung every particle on one small sphere in the middle of
    // the picture.  A multi-emitter array traps particles throughout its whole
    // working volume, so the seeds are now spread in FRUSTUM coordinates
    // (x,y scaled by each particle's own depth): the trap field then covers
    // the frame evenly at every distance instead of clustering centrally.
    const float kTanY = 0.5206;                      // 55 deg vertical FOV
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

    float pSeed = cIndex / 4900.0;
    float h1 = attrB.x, h2 = attrB.y, h3 = attrB.z, h4 = attrB.w;

    float dz    = 3.4 + h3 * 6.0;                    // chamber depth 3.4 .. 9.4
    float halfH = dz * kTanY;
    float halfW = halfH * aspect;

    // 2.6 rather than 2.0: the chamber still reaches past all four edges when
    // the preset camera rig yaws/rolls, and the surplus keeps the on-screen
    // particle count (and therefore the exposure) in a sane band.
    vec3 baseP = vec3((h1 - 0.5) * 2.6 * halfW,
                      (h2 - 0.5) * 2.6 * halfH,
                      0.0);
    // slow chamber-wide drift so the trap field is never frozen
    baseP.x += 0.35 * sin(t * 0.31 + pSeed * 41.0);
    baseP.y += 0.30 * cos(t * 0.27 + pSeed * 57.0);

    // Acoustic Gor'kov radiation force gathers the particles onto the nodal
    // surfaces of the standing wave; the trap phases creep, so the whole
    // lattice breathes and the clusters migrate from node to node.
    float phX =  t * 0.50, phY = -t * 0.40, phZ = t * 0.30;
    baseP.x = gorkovClump(baseP.x, kNodes, phX, 0.42);
    baseP.y = gorkovClump(baseP.y, kNodes, phY, 0.42);
    float zLocal = gorkovClump((h4 - 0.5) * 1.6, kNodes, phZ, 0.42);

    float gorkovX = cos(baseP.x * kNodes + phX);
    float gorkovY = cos(baseP.y * kNodes + phY);
    float gorkovZ = cos(zLocal   * kNodes + phZ);
    float pressureNode = gorkovX * gorkovY * gorkovZ;
    vAcousticNode = pressureNode;

    // Acoustic levitation trapped cluster position (still jittering in its trap)
    vec3 trapPos = vec3(baseP.xy, zLocal) + vec3(gorkovX, gorkovY, gorkovZ) * 0.12;

    // Microparticle cube size -- proportional to depth, so a far cluster is
    // still the same handful of pixels as a near one and no part of the
    // chamber thins out into invisible specks.
    float pSize = clamp((particleSizeP > 0.001 ? particleSizeP : 0.055), 0.03, 0.07);
    float sz = pSize * (dz / 5.5) * (1.0 + 0.3 * audioSwell);
    vec3 cubePos = trapPos + corner * sz;

    vNormal = normalize(corner);
    vCol = imgPalette(fract(pSeed * 7.0 + pressureNode * 0.3 + audioCentroid));

    // Camera Transform (V3)
    vec3 vp = cubePos;

    // Gentle chamber parallax (a full spin would swing the wide trap volume
    // out of the frustum and empty the picture again).
    float a = 0.16 * sin(t * 0.20);
    float c = cos(a), s = sin(a);
    vp = vec3(vp.x * c - vp.z * s, vp.y, vp.x * s + vp.z * c);
    vp.z += dz;
    vp.z = max(vp.z, 0.9);
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
