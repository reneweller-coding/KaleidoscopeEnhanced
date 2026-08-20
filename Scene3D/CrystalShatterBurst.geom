#version 330 core
/**
 * @file CrystalShatterBurst.geom
 * @brief Geometry stage companion to CrystalShatterBurst.frag -- see that file's header for
 * this scene's description.
 *
 * Audio Reactivity:
 *   audioKick     -> explosive outward shard flight + gold tint
 *   audioSubBass  -> extra low-end shove on the fracture
 *   audioAdvance  -> shard tumble phase (pre-integrated, jump-free)
 *   audioSwell    -> camera pushes in
 *   audioSnare    -> snares/claps crack a SECOND subset of shards loose and
 *                    jolt their tumble
 *   audioBuildUp  -> rising EDM tension clenches the geode shut before the drop
 */
// CrystalShatterBurst.geom — Geometry Shader intercepts triangles and violently
// fractures them into floating tetrahedral crystal shards along explosion vectors on beats.
layout(triangles) in;
layout(triangle_strip, max_vertices = 3) out;

in vec3  vObjPos[];
in vec4  vSeeds[];
in float vCubeIndex[];

out vec3  gNormal;
out vec3  gWorld;
out vec4  gCol;
out vec3  gBary;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioSubBass;
uniform float audioHigh;
uniform float audioSwell;
uniform float audioSnare;     // snare / clap onset envelope
uniform float audioBuildUp;   // EDM tension rising toward the drop

uniform float burstP;
uniform float spinP;
uniform float camDistP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

vec3 rotAxis(vec3 v, vec3 axis, float a) {
    float c = cos(a), s = sin(a);
    return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}

void main() {
    float i = vCubeIndex[0];
    vec4 seeds = vSeeds[0];

    float brst = (burstP   > 0.0) ? burstP   : 1.0;
    float spn  = (spinP    > 0.0) ? spinP    : 1.0;
    float cDst = (camDistP > 0.0) ? camDistP : 1.0;
    float hue  = (hueP     > 0.0) ? hueP     : 0.0;

    // Cube grid position in 3D space: 70x70 field arranged into a giant monolithic gemstone
    float gx = mod(i, 70.0) - 34.5;
    float gz = floor(i / 70.0) - 34.5;
    
    // Cluster cubes into a spherical/ellipsoid geometric geode
    float r = sqrt(gx * gx + gz * gz);
    if (r > 32.0) return;

    float geodeY = sin(r * 0.12) * 6.0 + (seeds.y - 0.5) * 3.0;
    vec3 cubeCenter = vec3(gx * 0.45, geodeY, gz * 0.45);

    // Explosive fracture outward displacement on audioKick.  Snares/claps
    // crack a DIFFERENT subset of shards loose (seeds.z decides which drum a
    // shard answers to), so the gem fractures in two interleaved rhythms.
    vec3 explodeDir = normalize(cubeCenter + vec3(0.0, 1.0, 0.0));
    float snareCrack = clamp(audioSnare, 0.0, 1.0) * step(0.5, seeds.z);
    float shardFlight = (audioKick * 6.0 + audioSubBass * 2.5 + snareCrack * 3.5)
                      * brst * (0.5 + 0.5 * seeds.x);

    // An EDM build-up hauls the whole geode back in on itself — the gem
    // clenches shut under the rising tension, then blows apart at the drop.
    shardFlight *= 1.0 - 0.38 * clamp(audioBuildUp, 0.0, 1.0);

    // Shard tumbling rotation (rate stays audio-free; the snare only adds a
    // decaying ANGLE jolt, so the tumble kicks and settles without flicker).
    vec3 spinAxis = normalize(seeds.yzw - 0.5);
    float spinAngle = (time * 3.0 + audioAdvance * 4.0) * spn * seeds.x
                    + snareCrack * 0.9;

    // Center of this triangle face
    vec3 faceCenter = (vObjPos[0] + vObjPos[1] + vObjPos[2]) / 3.0;

    // Shard world position
    vec3 shardCenter = cubeCenter + explodeDir * shardFlight;

    // Camera
    float camAngle = time * 0.15 + audioAdvance * 0.04;
    float camDist = (22.0 * cDst) - audioSwell * 4.0;
    vec3 camPos = vec3(sin(camAngle) * camDist, 10.0 + 3.0 * sin(time * 0.18), cos(camAngle) * camDist);
    vec3 lookTarget = vec3(0.0, 0.0, 0.0);

    vec3 ww = normalize(lookTarget - camPos);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);

    // Facet normal calculation
    vec3 e1 = vObjPos[1] - vObjPos[0];
    vec3 e2 = vObjPos[2] - vObjPos[0];
    vec3 rawNormal = normalize(cross(e1, e2));
    vec3 rotNorm = rotAxis(rawNormal, spinAxis, spinAngle);

    // Facet gem color: Ruby, Sapphire, Emerald, Diamond
    vec3 gemCol = mix(vec3(0.1, 0.7, 1.0), vec3(1.0, 0.1, 0.5), seeds.x);
    gemCol = mix(gemCol, vec3(1.0, 0.85, 0.2), audioKick * 0.8);
    if (hue > 0.001) gemCol = hueRot(gemCol, hue);

    vec3 baryCoords[3] = vec3[3](vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, 1.0));

    // Emit the 3 corners of the shard
    for (int k = 0; k < 3; k++) {
        vec3 cornerRel = vObjPos[k] - faceCenter;
        vec3 rotCorner = rotAxis(cornerRel, spinAxis, spinAngle);
        vec3 worldP = shardCenter + rotAxis(faceCenter, spinAxis, spinAngle) + rotCorner;

        vec3 relP = worldP - camPos;
        vec3 viewP = vec3(dot(relP, uu), dot(relP, vv), dot(relP, ww));
        viewP.x -= eyeOff;

        gl_Position = projM * vec4(viewP.x, viewP.y, -viewP.z, 1.0);
        gl_Position.x += eyeOff * 0.045 * gl_Position.w;

        gNormal = rotNorm;
        gWorld = worldP;
        gCol = vec4(gemCol, 1.0);
        gBary = baryCoords[k];
        EmitVertex();
    }
    EndPrimitive();
}
