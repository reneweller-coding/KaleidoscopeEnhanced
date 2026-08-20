#version 330 core
/**
 * @file TeslaLightningTree.vert
 * @brief attrA.xyz = world pos, attrA.w = heat
 * attrB.w = boltSeed (GEOM_INDIRECT, 8-float layout)
 *
 * Audio Reactivity (geometry; see the .frag header for the plasma shading):
 *   audioAdvance -> camera orbit around the trunk (pre-integrated)
 *   audioKick    -> bolt heat and thickness (in the .comp generator)
 *   audioHigh    -> stepped-leader jitter (in the .comp generator)
 *   audioSnare   -> RETURN STROKE: snares, claps and vocal hits are the
 *                   discharge.  Each one both flares the bolt tree outward
 *                   and drives its ionisation heat up, so the tree fires on
 *                   the backbeat instead of only on the kick
 *   audioTrebRel -> STEPPED-LEADER WANDER: the treble register's instant /
 *                   slow-average ratio (MilkDrop's treb_att idiom, ~1.0 =
 *                   "as loud as usual") pushes the arcs off their straight
 *                   path through a smooth spatial field.  Self-normalising,
 *                   so a quiet acoustic track wanders as much as a loud one
 *
 * NOTE: the compute generator (TeslaLightningTree.comp) is a SEPARATE program
 * and only receives the small hand-picked uniform set in
 * Scene3DShader::runGenerator(), so audioSnare / audioTrebRel have to be
 * applied here on the baked geometry instead.
 */
in vec4 attrA;
in vec4 attrB;

uniform mat4 projM;
uniform float eyeOff;
uniform float audioAdvance;
uniform float time;
uniform float audioKick;
uniform float audioSnare;
uniform float audioTrebRel;

out vec3 vPos;
out float vHeat;
out float vBoltID;

void main() {
    vec3 worldP = attrA.xyz;

    // RETURN STROKE on the backbeat: a snare/clap flares the whole discharge
    // tree outward as its channel ionises.
    float sn = clamp(audioSnare, 0.0, 1.0);
    worldP.xz *= 1.0 + 0.30 * sn;

    // STEPPED-LEADER WANDER driven by the treble register's instant/slow
    // ratio (~1.0 = as loud as usual, so this self-normalises to any mix).
    // A SMOOTH spatial field, not a per-vertex hash -- a hash here would tear
    // the two-triangle bolt ribbons apart.
    float tp = clamp(audioTrebRel - 1.0, -1.0, 1.0);
    vec3 wob = vec3(sin(worldP.y * 5.3 + worldP.z * 3.1),
                    sin(worldP.z * 4.7 + worldP.x * 5.9),
                    sin(worldP.x * 4.1 + worldP.y * 6.3));
    worldP += wob * (0.22 * tp);

    vPos = worldP;
    // The stroke also drives the channel's ionisation heat.  Bounded, and the
    // .frag's tonemap still caps whatever comes out of it.
    vHeat = attrA.w * (1.0 + 0.55 * sn);
    vBoltID = attrB.w;

    // Stereoscopic 3D camera projection
    // ORBIT (user feedback): the camera circles the structure
    vec3 vp = worldP;
    float oyaw = time * 0.15 + audioAdvance * 0.07;
    float ocy = cos(oyaw), osy = sin(oyaw);
    vp.xz = mat2(ocy, -osy, osy, ocy) * vp.xz;
    float opit = -0.12 + 0.10 * sin(time * 0.11);
    float opc = cos(opit), ops = sin(opit);
    vp.yz = mat2(opc, -ops, ops, opc) * vp.yz;
    vp.z += 6.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
