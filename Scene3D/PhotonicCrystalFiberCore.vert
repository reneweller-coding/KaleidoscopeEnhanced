#version 330 core
/**
 * @file PhotonicCrystalFiberCore.vert
 * @brief Vertex stage companion to PhotonicCrystalFiberCore.frag -- see that file's header for
 * this scene's description.
 */
layout(location = 0) in vec4 attrA;
layout(location = 1) in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

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

uniform float pcfP;
uniform float coreP;
uniform float speedP;
uniform float hueP;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vTexCoord;
out float vCoreDist;
out float vKind;      // 0 = capillary, 1 = the glass slab behind the lattice

void main() {
    float pcf = (pcfP  > 0.0) ? pcfP  : 1.0;
    float cor = (coreP > 0.0) ? coreP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;

    // The engine draws NON-instanced (glDrawArrays), so gl_InstanceID is
    // always 0 -- every unit would collapse onto one spot.  Scene3DShader
    // packs the per-unit index into attrA.w instead (see buildGeometry).
    int cubeIndex = int(attrA.w);
    vec3 cubeCorner = attrA.xyz;
    vNormal = attrB.xyz;
    vTexCoord = attrA.xy * 0.5 + 0.5;

    float t = time * 0.4 * spd + audioAdvance * 0.2;

    // Cube 0 is spent on the bulk glass BEHIND the lattice.  A photonic
    // crystal fibre is a solid rod with holes in it, but the scene only ever
    // drew the holes -- so the glass between them was black, and a lattice of
    // 5 px specks over a black field is what the "too dark, not filling"
    // measurement was actually looking at.  Big enough to still cover the
    // frame's corners when the slow roll turns it.
    if (cubeIndex == 0)
    {
        vKind = 1.0;
        vCoreDist = 0.0;
        vec3 slab = cubeCorner * vec3(30.0, 30.0, 0.2) + vec3(0.0, 0.0, 6.0);
        vWorldPos = slab;
        vec3 vps = slab;
        float fro0 = time * 0.06;
        vps.xy = mat2(cos(fro0), -sin(fro0), sin(fro0), cos(fro0)) * vps.xy;
        vps.z += 7.0;
        vps.x -= eyeOff;
        gl_Position = projM * vec4(vps.x, vps.y, -vps.z, 1.0);
        gl_Position.x += eyeOff * 0.045 * gl_Position.w;
        return;
    }
    vKind = 0.0;

    // 70x70 hexagonal honeycomb lattice array.  The pitch was 0.08, which put
    // the whole cladding inside a 5.6-unit disc seven units from the camera --
    // under half the frame's width.  pcf still sets the lattice density, but
    // at 30% leverage: at full leverage its 0.5..2.0 preset range swung the
    // lattice between a fifth of the frame and four times its width.
    int li = cubeIndex - 1;
    int row = li / 70;
    int col = li % 70;
    float sp = 0.185 * (0.7 + 0.3 * pcf);
    float x = (float(col) - 34.5 + mod(float(row), 2.0) * 0.5) * sp;
    float y = (float(row) - 34.5) * sp * 0.866;

    // Hollow core radius (central air hole), in step with the new pitch
    float r = length(vec2(x, y));
    vCoreDist = r;
    float isHollow = smoothstep(0.70 * cor, 1.05 * cor, r);

    // Z-axis longitudinal wave
    float z = (float(li % 20) / 20.0 - 0.5) * 4.0;
    float pulse = sin(z * 8.0 - t * 6.0) * (0.10 + 0.09 * audioBass);

    // Capillary walls as a fixed FRACTION of the pitch, so the cladding keeps
    // its density whatever the lattice is scaled to.
    float cubeScale = sp * 0.60 * isHollow * (1.0 + audioKick * 0.5);
    vec3 worldPos = vec3(x, y + pulse, z) + cubeCorner * cubeScale;
    vWorldPos = worldPos;

    // Camera transform: projM expects NEGATIVE view-space z (clip-w = -z_view),
    // so push the scene away along +z and negate.  eyeOff is the stereo shift.
    // Gentle roll around the fiber axis (flight is carried by the light
    // pulses racing down the core, see the frag)
    vec3 vp = worldPos;
    float fro = time * 0.06;
    vp.xy = mat2(cos(fro), -sin(fro), sin(fro), cos(fro)) * vp.xy;
    vp.z += 7.0;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
