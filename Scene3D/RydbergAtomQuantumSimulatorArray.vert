#version 330 core
/**
 * @file RydbergAtomQuantumSimulatorArray.vert
 * @brief Vertex stage companion to RydbergAtomQuantumSimulatorArray.frag -- see that file's
 * header for this scene's description.
 *
 * SCREEN FILL: the tweezer array used to be a tiny cube -- 39^3 sites at a
 * 0.015..0.04 pitch, i.e. barely +-0.6..1.7 world units, seen from 4.5 units
 * away -- so 60000 atoms all piled into one small central disc and 83% of the
 * frame was black (occ 0.17) while that disc stacked ~20 sprites deep.  It is
 * now a WIDE SLAB of tweezer planes, +-5.6 across but only +-1.6 deep, which
 * overflows both frame edges at every depth it occupies; the fragment stage
 * carries the matching exposure rebalance.
 */

in vec4 attrA; // xyz = position seed, w = pointID
in vec4 attrB; // 4 seeds in [0,1)

out vec3 vCol;
out float vBlockade;
out float vPointSize;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;

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

uniform float arrayPitchP;
uniform float pointSizeP;
uniform float blockadeRadP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
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
    float pId = attrA.w;
    vec4 seeds = attrB;
    
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // Optical tweezer 3D Rydberg atom array (simple cubic grid with quantum fluctuations)
    float pitch = (arrayPitchP > 0.01 ? arrayPitchP : 0.028);

    const float nSide = 39.0;               // 39^3 = 59319 of the 60000 points
    if (pId >= nSide * nSide * nSide) {
        // Leftover points of the host's fixed 60000-point buffer: park them
        // outside the clip volume rather than letting mod() stack duplicates
        // on top of the first tweezer plane.
        vCol = vec3(0.0);
        vBlockade = 0.0;
        vPointSize = 1.0;
        gl_PointSize = 1.0;
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        return;
    }

    float ix = mod(pId, nSide);
    float iy = mod(floor(pId / nSide), nSide);
    float iz = floor(pId / (nSide * nSide));

    // arrayPitchP still sets the tweezer spacing, but as a RELATIVE scale of a
    // slab that always overflows the frame: even the tightest pitch keeps the
    // half-width at 4.6 against a 4.17 frame half-width.  The DEPTH extent is
    // deliberately not scaled -- a deeper slab would push its near plane of
    // tweezers through the projection's 0.5 near plane.
    float pScale = 0.82 + 0.50 * clamp((pitch - 0.015) / 0.025, 0.0, 1.0);
    vec3  ext    = vec3(5.6 * pScale, 5.6 * pScale, 1.6);

    vec3 unit = (vec3(ix, iy, iz) + 0.5) / nSide - 0.5;   // [-0.5, +0.5]^3
    vec3 gridPos = unit * 2.0 * ext;

    // Quantum zero-point motion in optical tweezers (scaled with the array)
    vec3 jitter = (seeds.xyz - 0.5) * 0.11;
    vec3 worldPos = gridPos + jitter;

    // Rydberg blockade radius (R_b): collective excitation wave propagating through atom array
    float r = length(gridPos);
    float rBlockade = (blockadeRadP > 0.01 ? blockadeRadP : 0.4);
    float blockadePhase = sin(r * (1.6 + 3.2 * rBlockade) - t * 4.0 + audioPhase);
    float isRydbergExcited = smoothstep(0.3, 0.9, blockadePhase);
    vBlockade = isRydbergExcited;

    // Point size capped to 8-16px (V8c)
    float psMax = (pointSizeP > 0.01 ? pointSizeP : 12.0);
    gl_PointSize = clamp(psMax * (0.8 + 0.4 * isRydbergExcited), 8.0, 16.0);
    vPointSize = gl_PointSize;

    vCol = imgPalette(fract(r * 0.14 + pId * 0.0001 + audioCentroid * 0.35));

    // Camera Transform (V3)
    vec3 vp = worldPos;

    // In-plane roll: keeps the wide slab of tweezer planes facing the camera at
    // all times.  The old yaw about the vertical would have swung this slab
    // edge-on twice a turn and emptied the frame again.
    float ra = t * 0.15;
    float cr = cos(ra), sr = sin(ra);
    vp = vec3(vp.x * cr - vp.y * sr, vp.x * sr + vp.y * cr, vp.z);

    // A shallow yaw wobble restores the 3D read without ever swinging the near
    // face of the slab through the near plane.
    float ya = 0.16 * sin(t * 0.11);
    float cy = cos(ya), sy = sin(ya);
    vp = vec3(vp.x * cy - vp.z * sy, vp.y, vp.x * sy + vp.z * cy);

    vp.z += 4.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
