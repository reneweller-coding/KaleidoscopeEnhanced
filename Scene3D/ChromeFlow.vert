#version 330 core
// ChromeFlow.vert — a sheet of liquid chrome: broad, slow undulations,
// mirror-bright sheen bands gliding across the metal.  The bass leans on
// the wave weight; everything else is pure patience.
// attrA.x/.y span the sheet.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioBass;
uniform float audioSwell;
uniform float audioAdvance;

out vec2  vUV;
out vec3  vNrm;
out float vDist;

void main()
{
    float u = attrA.x, w = attrA.y;

    float x = (u - 0.5) * 130.0;
    float z = 6.0 + w * 110.0;

    // Four wave trains: two broad rollers plus two short chops — liquid
    // chrome needs CURVATURE, or the mirror has nothing to bend.
    float ph = time * 0.35 + audioAdvance * 0.3;
    float wgt = 1.0 + 1.2 * audioBass + 0.5 * audioSwell;
    float h  = sin(x * 0.045 + z * 0.030 + ph)        * 2.6
             + sin(x * 0.020 - z * 0.050 + ph * 0.6)  * 3.4
             + sin(x * 0.130 + z * 0.095 - ph * 1.7)  * 0.85
             + sin(x * 0.075 - z * 0.160 + ph * 1.2)  * 1.1;
    h *= wgt;

    // Analytic normal from the derivatives (for the mirror in the frag).
    float dhx = (cos(x * 0.045 + z * 0.030 + ph)       * 0.045 * 2.6
               + cos(x * 0.020 - z * 0.050 + ph * 0.6) * 0.020 * 3.4
               + cos(x * 0.130 + z * 0.095 - ph * 1.7) * 0.130 * 0.85
               + cos(x * 0.075 - z * 0.160 + ph * 1.2) * 0.075 * 1.1) * wgt;
    float dhz = (cos(x * 0.045 + z * 0.030 + ph)       * 0.030 * 2.6
               - cos(x * 0.020 - z * 0.050 + ph * 0.6) * 0.050 * 3.4
               + cos(x * 0.130 + z * 0.095 - ph * 1.7) * 0.095 * 0.85
               - cos(x * 0.075 - z * 0.160 + ph * 1.2) * 0.160 * 1.1) * wgt;

    vec3 vp = vec3(x, h - 8.0, z);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    vUV   = vec2(u, w);
    vNrm  = normalize(vec3(-dhx, 1.0, -dhz));
    vDist = z;
}
