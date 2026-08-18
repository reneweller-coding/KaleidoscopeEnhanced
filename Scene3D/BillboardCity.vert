#version 330 core
/**
 * @file BillboardCity.vert
 * @brief Vertex stage companion to BillboardCity.frag -- see that file's header for
 * this scene's description.
 */
// BillboardCity.vert — a night flight down an avenue of glowing photo
// billboards; each screen shows a seeded kaleido-crop of the current image
// and pulses with its own spectrum band.  attrA.xy = corner, attrA.w = index.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioSwell;

out vec2  vUV;
out vec4  vSeed;
out float vBand;
out float vFade;

void main()
{
    float idx = attrA.w;
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    float camZ = time * 4.5 + audioAdvance * 16.0;
    float L    = 3000.0 / 12.5;               // one loop slot per billboard
    float z    = mod(idx * (240.0 / 3000.0) * 12.5 - camZ, 240.0) + 2.0;

    // Billboards flank an open avenue; bigger ones sit further out and up.
    float side = (r1 < 0.5) ? -1.0 : 1.0;
    float lane = 10.0 + r2 * 46.0;
    float h    = -4.0 + r3 * r3 * 40.0;
    vec2  half_ = vec2(3.0 + r4 * 5.0, 2.0 + r4 * 3.2);

    vec3 centre = vec3(side * lane, h, z);

    if (z < 1.2 || z > 110.0)                 // cull outside the visible run
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vUV = vec2(0.0); vSeed = attrB; vBand = 0.0; vFade = 0.0;
        return;
    }

    // Screens face the oncoming camera, slightly angled toward the road.
    float yaw   = -side * 0.35;
    vec3  right = vec3(cos(yaw), 0.0, sin(yaw));
    vec2 corner = (attrA.xy - 0.5) * 2.0 * half_;
    vec3 vp = centre + right * corner.x + vec3(0.0, corner.y, 0.0);

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.06 * gl_Position.w;

    vUV   = attrA.xy;
    vSeed = attrB;
    int band = int(mod(idx, 32.0));
    vBand = audioSpectrum[band];
    vFade = clamp(1.0 - z / 110.0, 0.0, 1.0)
          * (0.75 + 0.5 * audioSwell);
}
