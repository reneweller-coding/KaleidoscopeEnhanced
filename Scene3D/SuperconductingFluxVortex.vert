#version 330 core
/**
 * @file SuperconductingFluxVortex.vert
 * @brief Vertex stage companion to SuperconductingFluxVortex.frag -- see that file's header for
 * this scene's description.
 *
 * Two kinds of primitive arrive from the compute stage, told apart by
 * attrA.w: the flux-tube ribbons (attrA.w = the vortex index, >= 0) and the
 * Meissner haze motes (attrA.w = -1, attrA.xyz carrying seeds instead of a
 * position).  The haze is placed here rather than in the compute stage
 * because only this stage knows the frame's aspect ratio, and the whole point
 * of the haze is that it is laid out in FRUSTUM coordinates -- x and y scaled
 * by depth -- so it stays evenly spread over the picture at every distance
 * instead of bunching into a box in the middle of a black frame.
 */
// SuperconductingFluxVortex.vert

layout(location = 0) in vec4 attrA; // xyz = pos (or haze seeds), w = vortexID / -1
layout(location = 1) in vec4 attrB; // x = seed, y = u, zw = uv

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

out vec4  vColor;
out vec2  vTexCoord;
out float vHaze;

void main() {
    vTexCoord = attrB.zw;

    // Superconducting quantum colors: Cyan (Flux line), Electric Violet
    // (Cooper pairs), Neon Emerald (expelled Meissner field)
    vec3 fluxCyan     = vec3(0.0, 0.9, 1.0);
    vec3 cooperViolet = vec3(0.7, 0.15, 1.0);
    vec3 meissnerGreen= vec3(0.1, 1.0, 0.5);

    vec3 vp;

    if (attrA.w < -0.5)
    {
        // ---- MEISSNER HAZE ---------------------------------------------
        // The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
        const float kTanY = 0.5206;
        float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

        float hx = attrA.x, hy = attrA.y, hz = attrA.z, hs = attrB.x;

        // Kept behind the whole slab (whose deepest point sits near 30), so a
        // near mote can never punch an opaque dim disc through the lattice.
        float dz = 33.0 + hz * 80.0;
        float ph = hx * 6.2831853 + time * 0.05 + audioAdvance * 0.04;

        // 2.0 would fit the frustum exactly; 2.3 so the field still reaches
        // past all four edges when the preset camera rig rolls and yaws.
        float open = 2.3;
        vec3 c = vec3((hx - 0.5) * open * dz * kTanY * aspect + 1.8 * cos(ph),
                      (hy - 0.5) * open * dz * kTanY          + 1.8 * sin(ph * 0.79),
                      dz);

        // A mote must stay a legible blob at any distance: the size grows with
        // depth so its ON-SCREEN size stays roughly constant.
        float sz = (0.030 + 0.045 * hs) * dz;
        vec2  corner = attrB.zw * 2.0 - 1.0;
        vp = c + vec3(corner * sz, 0.0);

        float b = fract(hs * 7.31 + hx * 3.17);
        vec3 hcol = mix(vec3(0.0, 0.55, 0.85), meissnerGreen, hs);
        hcol *= (0.07 + 0.16 * b) * (0.75 + 0.5 * audioSwell)
              * clamp(1.0 - dz / 135.0, 0.0, 1.0);

        vColor = vec4(min(hcol, vec3(1.0)), 1.0);
        vHaze  = 1.0;
    }
    else
    {
        // ---- FLUX-TUBE RIBBON ------------------------------------------
        vec3 pos = attrA.xyz;
        float vortexID = attrA.w;

        // 3D rotation of superconductor slab
        float rotY = time * 0.25 + audioPhase * 0.1;
        float cy = cos(rotY), sy = sin(rotY);
        pos.xz = vec2(pos.x * cy - pos.z * sy, pos.x * sy + pos.z * cy);

        vec3 col = mix(fluxCyan, cooperViolet, sin(vortexID * 0.3 + time) * 0.5 + 0.5);
        col = mix(col, meissnerGreen, exp(-abs(pos.z) * 0.35) * (0.5 + 1.0 * audioKick));

        vColor = vec4(min(col * (0.8 + 0.6 * audioLevel), vec3(1.35)), 1.0);
        vHaze  = 0.0;

        // Camera pulled back to hold the widened slab, and to keep its near
        // edge clear of the eye plane while the slab turns edge-on.
        vp = pos;
        vp.z += 17.0;
    }

    // Stereo 3D camera projection
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
}
