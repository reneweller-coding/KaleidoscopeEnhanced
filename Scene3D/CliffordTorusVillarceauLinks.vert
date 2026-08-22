#version 330 core
/**
 * @file CliffordTorusVillarceauLinks.vert
 * @brief Vertex stage companion to CliffordTorusVillarceauLinks.frag -- see that file's header for
 * this scene's description.
 *
 * The 4900 units used to be 0.05-wide cubes on a 2.8-radius torus, i.e. ~6 px
 * specks scattered over a mostly black frame (occ 0.21).  They are now large
 * enough to close into a SOLID stereographic surface, the torus reaches past
 * the top and bottom edges, and one unit in seven is pulled off the surface to
 * become a far-field dust mote placed in FRUSTUM coordinates, so the corners
 * the donut can never reach still carry something.
 */
layout(location = 0) in vec4 attrA;
layout(location = 1) in vec4 attrB;

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

uniform float torusP;
uniform float linkP;
uniform float speedP;
uniform float hueP;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vTexCoord;
out float vIndex;
out float vDust;

float hsh(float a, float b)
{
    return fract(sin(a * 91.73 + b * 47.31) * 43758.5453);
}

void main() {
    float trs = (torusP > 0.0) ? torusP : 1.0;
    float lnk = (linkP  > 0.0) ? linkP  : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;

    // The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
    const float kTanY = 0.5206;
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

    // The engine draws NON-instanced (glDrawArrays), so gl_InstanceID is
    // always 0 -- every unit would collapse onto one spot.  Scene3DShader
    // packs the per-unit index into attrA.w instead (see buildGeometry).
    int cubeIndex = int(attrA.w);
    float ci = float(cubeIndex);
    vIndex = ci / 4900.0;

    // Cube corner local vertex
    vec3 cubeCorner = attrA.xyz;
    vNormal = attrB.xyz;
    vTexCoord = attrA.xy * 0.5 + 0.5;

    float t = time * 0.35 * spd + audioAdvance * 0.18;

    vec3 vp;

    if (hsh(ci, 2.13) < 0.14)
    {
        // ---- 4D DUST -------------------------------------------------
        // A seventh of the units, scattered through the frustum from behind
        // the torus out to the far dark.  Placed in FRUSTUM coordinates -- x
        // and y scaled by depth -- so the field stays even across the picture
        // however deep a mote sits.
        float d1 = hsh(ci, 5.31);
        float d2 = hsh(ci, 9.77);
        float d3 = hsh(ci, 13.9);
        float d4 = hsh(ci, 21.4);

        float dz = 14.0 + d3 * 74.0;
        // 2.0 would fit the frustum exactly; 2.4 so the field still reaches
        // past all four edges when the preset camera rig rolls and yaws.
        float open = 2.4;
        float ph = d1 * 6.2831853 + t * 0.09;

        // A mote sized as a fraction of its own depth stays a legible ~4 px
        // speck at any distance; below that it averages away to nothing.
        float dScale = dz * 0.0042 * (0.60 + 0.80 * d4) * (1.0 + 0.25 * audioSwell);

        vec3 centre = vec3((d1 - 0.5) * open * dz * kTanY * aspect + 0.9 * cos(ph),
                           (d2 - 0.5) * open * dz * kTanY          + 0.9 * sin(ph * 0.83),
                           dz);
        vWorldPos = centre;
        vDust = 1.0;

        vp = centre + cubeCorner * dScale;
    }
    else
    {
        // ---- THE STEREOGRAPHIC TORUS ---------------------------------
        // 4D Clifford Torus parameters: (u, v) on S3
        float u = float(cubeIndex % 70) / 70.0 * 6.2831853;
        float v = float(cubeIndex / 70) / 70.0 * 6.2831853;

        // 4D coordinates on S3: (cos u, sin u, cos v, sin v) / sqrt(2)
        float rot4D = t * 0.5 * lnk;
        vec4 p4D = vec4(cos(u), sin(u), cos(v + rot4D), sin(v + rot4D)) * 0.7071;

        // Stereographic projection from 4D to 3D: P_3D = (x, y, z) / (1 - w)
        float denom = max(1.0 - p4D.w * 0.65, 0.2);
        // The stereographic blow-up already multiplies the radius by up to
        // 1.85 and the camera sits 9 units back, so the overall scale is a
        // BOUNDED function of torusP: at the top of its 0.5..2.0 range the
        // outer rim reaches 7.1 and still clears the near plane, instead of
        // 13.7 -- which would have put half the donut behind the lens.
        float sizeK = 3.0 * (0.72 + 0.28 * clamp(trs, 0.5, 2.0));
        vec3 torusCenter = p4D.xyz / denom * sizeK;

        // Cube size: big enough that neighbouring units on the 70 x 70 lattice
        // OVERLAP into a continuous surface.
        float cubeScale = (0.145 + 0.045 * sin(u * 3.0 + t * 2.0))
                        * (1.0 + min(audioKick * 0.8, 1.0));
        vWorldPos = torusCenter + cubeCorner * cubeScale;
        vDust = 0.0;

        vp = vWorldPos;
        vp.z += 7.2;   // outside the torus, close enough to fill
    }

    // Camera transform: projM expects NEGATIVE view-space z (clip-w = -z_view),
    // so push the scene away along +z and negate.  eyeOff is the stereo shift.
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
}
