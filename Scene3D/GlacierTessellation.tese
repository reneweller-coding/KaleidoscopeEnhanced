#version 400 core
/**
 * @file GlacierTessellation.tese
 * @brief Tessellation-evaluation stage companion to GlacierTessellation.frag -- see that file's header for
 * this scene's description.
 */
// GlacierTessellation.tese — Tessellation Evaluation Stage
layout(quads, fractional_odd_spacing, ccw) in;

in  vec2 tcUV[];
in  vec4 tcSeed[];

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioSubBass;
uniform float audioSwell;
uniform float audioDrop;
uniform float audioSpectrum[32];

uniform float waveHP;
uniform float camHP;
uniform float hueP;

out vec3 vNormal;
out vec3 vWorld;
out vec2 vUV;
out float vCrevasse;

const vec2 EXTENT = vec2(240.0, 320.0);

float glacierHeight(vec2 p, float t, out float crevasse) {
    float wh = (waveHP > 0.0) ? waveHP : 1.0;

    // Mountainous ice cliffs & shelf
    float baseCliff = pow(abs(p.x) / 100.0, 1.8) * 45.0;
    
    // Wave ripples across ice
    float wave1 = sin(p.y * 0.04 - t * 2.0 + p.x * 0.03) * 3.5;
    float wave2 = cos(p.y * 0.02 + t * 1.5 - p.x * 0.05) * 2.5;

    // Crevasses / fault lines
    float crackPattern = sin(p.x * 0.15 + sin(p.y * 0.08) * 3.0);
    crevasse = smoothstep(0.85, 0.98, abs(crackPattern));

    int band = int(clamp(abs(p.x) / 120.0 * 31.0, 0.0, 31.0));
    float h = (baseCliff + wave1 + wave2) * (1.0 + audioSpectrum[band] * 0.8) * wh;
    h -= crevasse * 6.0; // Deep drop into crevasse

    // Glacial surge on sub-bass
    h += audioSubBass * 4.0 * sin(p.y * 0.05 - t * 3.0);
    h += audioKick * 3.0 * crevasse;

    return h;
}

void main() {
    vec2 u0 = mix(tcUV[0], tcUV[1], gl_TessCoord.x);
    vec2 u1 = mix(tcUV[3], tcUV[2], gl_TessCoord.x);
    vec2 uv = mix(u0, u1, gl_TessCoord.y);

    float camZ = time * 7.0 + audioAdvance * 14.0;
    float x = (uv.x - 0.5) * EXTENT.x;
    float zRel = uv.y * EXTENT.y + 2.0;
    float zAbs = zRel + camZ;

    float t = time * 0.3 + audioAdvance * 0.1;
    float crevasseVal;
    float h = glacierHeight(vec2(x, zAbs), t, crevasseVal);

    vec3 worldP = vec3(x, h, zRel);

    // Compute surface normal via finite difference
    const float eps = 0.5;
    float dummy;
    float hX = glacierHeight(vec2(x + eps, zAbs), t, dummy);
    float hZ = glacierHeight(vec2(x, zAbs + eps), t, dummy);
    vec3 n = normalize(vec3((h - hX) / eps, 1.0, (h - hZ) / eps));

    // Camera space
    float camH = (camHP > 0.0) ? camHP : 9.0;
    float swing = sin(time * 0.12) * 15.0;
    vec3 vp = vec3(x - swing, h - camH, zRel);

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vNormal = n;
    vWorld = worldP;
    vUV = uv;
    vCrevasse = crevasseVal;
}
