#version 330 core
/**
 * @file AtmosphericEntry.vert
 * @brief Vertex stage companion to AtmosphericEntry.frag -- see that file's
 * header. Staged on `sceneProgress`: the ship starts high and far, pitches
 * over into the descent, and by the end is deep in the glow with the planet
 * filling the frame. That arc has to complete exactly once per scene, which
 * is what sceneProgress gives and `time` cannot.
 *
 * The planet is painted on the sky shell rather than being real geometry
 * (see the .frag): a body big enough to fly INTO would have to be modelled
 * at a scale that breaks the depth range, and none of it would be visible
 * except the bit under the ship anyway.
 */

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform int   meshVertexCount;
uniform float sceneProgress;

uniform float audioKick;
uniform float audioSwell;

uniform float sizeP;
uniform float shakeP;    // how hard the airframe judders once it bites

out vec2  vUV;
out vec3  vNormal;
out vec3  vPos;
out vec3  vLocalPos;
out float vBg;
out float vEntry;        // 0 before contact, 1 deep in the glow -- drives the heating

void main()
{
    vec3 world, n;
    bool isBg = gl_VertexID >= meshVertexCount;

    float t = sceneProgress;
    // Nothing happens for the first fifth: the ship is still in vacuum, and
    // the shot needs that beat of calm or the entry has nothing to contrast
    // against.
    float entry = smoothstep(0.20, 0.95, t);
    vEntry = entry;

    if( !isBg )
    {
        float sz = (sizeP > 0.01 ? sizeP : 1.0);
        // Nose (+Z) forward and DOWN into the descent.
        vec3 p = attrA.xyz, nrm = attrB.xyz;

        // Pitch nose-down as it commits to the descent, then flare slightly
        // at the end -- the classic entry attitude, belly to the airflow.
        float pitch = -0.10 - 0.55 * entry + 0.18 * smoothstep(0.75, 1.0, t);
        float cp = cos(pitch), sp2 = sin(pitch);
        mat3 pitchM = mat3(1.0, 0.0, 0.0,  0.0, cp, sp2,  0.0, -sp2, cp);

        // A slow roll, so we see the lit belly rather than a flat profile.
        float roll = 0.35 + 0.25 * sin(t * 3.0);
        float cr = cos(roll), sr = sin(roll);
        mat3 rollM = mat3(cr, sr, 0.0,  -sr, cr, 0.0,  0.0, 0.0, 1.0);
        mat3 rotM = pitchM * rollM;

        vec3 local = rotM * (p * (46.0 * sz));

        // Airframe judder once the atmosphere bites: high frequency, small
        // amplitude, and gated on `entry` so the vacuum part stays glassy.
        float shake = (shakeP > 0.01 ? shakeP : 1.0) * entry;
        vec3 jitter = vec3(sin(time * 47.0), sin(time * 53.0 + 1.7), sin(time * 41.0 + 3.1))
                    * 0.55 * shake * (0.6 + 0.8 * audioKick);

        world = local + jitter;
        // Comes down and toward us as it descends.
        world.x += -18.0 + 26.0 * entry;
        world.y +=  26.0 - 40.0 * entry;
        world.z += 140.0 - 62.0 * entry;
        n = normalize(rotM * nrm);
        vUV = vec2(attrA.w, attrB.w);
        vLocalPos = p;
    }
    else
    {
        world = attrA.xyz;
        n = attrB.xyz;
        vUV = vec2(0.0);
        vLocalPos = vec3(0.0);
    }

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (isBg) gl_Position.z = gl_Position.w * 0.999999;

    vNormal = n;
    vPos = world;
    vBg = isBg ? 1.0 : 0.0;
}
