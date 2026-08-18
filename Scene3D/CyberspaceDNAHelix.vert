#version 330 core
/**
 * @file CyberspaceDNAHelix.vert
 * @brief Vertex stage companion to CyberspaceDNAHelix.frag -- see that file's header for
 * this scene's description.
 */
// attrA.x = t along ribbon (0..1), attrA.y = side (-1..+1), attrA.w = ribbon
// id, attrB = per-ribbon seeds (Scene3DShader.cpp GEOM_RIBBON).
in vec4 attrA;
in vec4 attrB;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;
uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioSwell;

out vec3 vPos;
out vec2 vUV;
out float vStrandID;
out float vTranscription;

void main() {
    float ribbonID = attrA.w;
    float tAlong = attrA.x * 20.0; // Travel down DNA macromolecule axis

    float t = time * 0.4 + audioAdvance * 0.2;
    float helixAngle = tAlong + t;

    // Major double-helix backbone strands vs base-pair hydrogen bridge rungs
    float radius = 1.6;
    float isStrandB = (ribbonID >= 10.0) ? 1.0 : 0.0;
    float strandPhase = (isStrandB > 0.5) ? 3.14159265 : 0.0;

    // Unzipping replication fork at center
    float unzip = exp(-pow(tAlong - 10.0, 2.0) * 0.1) * (0.8 + 0.5 * audioSwell);
    float r = radius * (1.0 + unzip);

    float x = r * cos(helixAngle + strandPhase);
    float y = (attrA.x - 0.5) * 8.0;
    float z = r * sin(helixAngle + strandPhase);

    vec3 helixPos = vec3(x, y, z);

    // Ribbon cross-section width
    vec3 tangent = normalize(vec3(-sin(helixAngle + strandPhase), 0.4, cos(helixAngle + strandPhase)));
    vec3 normal = vec3(0.0, 1.0, 0.0);

    float width = (0.06 + 0.03 * sin(tAlong * 4.0)) * (1.0 + audioKick * 0.5);
    vec3 pos = helixPos + normal * (attrA.y * 0.5) * width;

    // Transcription pulse traveling along DNA
    float transPulse = exp(-abs(tAlong - mod(time * 6.0, 20.0)) * 2.0) * (1.0 + audioKick * 2.5);

    vPos = pos;
    vUV = vec2(attrA.x, attrA.y * 0.5 + 0.5);
    vStrandID = ribbonID / 20.0;
    vTranscription = transPulse;

    // Stereoscopic 3D camera projection
    vec3 vp = pos;
    vp.z += 6.0;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
