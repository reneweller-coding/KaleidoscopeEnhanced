#version 330 core
/**
 * @file QuasicrystalPenroseRhomb3D.vert
 * @brief Vertex stage companion to QuasicrystalPenroseRhomb3D.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xyz = cube corner (-0.5..0.5), w = cube index
in vec4 attrB; // 4 seeds in [0,1)

out vec3 vNormal;
out vec3 vCol;
out float vQuasiShell;
out vec3 vLocalPos;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioChromaHue;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float quasiScaleP;
uniform float cubeSizeP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

void main()
{
    vec3 corner = attrA.xyz;
    float cIndex = attrA.w;
    vLocalPos = corner;
    
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // 3D icosahedral quasicrystal: projection of 6D hypercubic lattice onto 3D physical space
    // 6 icosahedral basis vectors along 5-fold axes: (0, +-1, +-tau), etc. (Golden ratio tau = 1.6180339887)
    float tau = 1.6180339887;
    // geom="cubes" hands this stage 4900 cubes (see Scene3DShader::build-
    // Geometry), not 256.  With the old count every index past 255 drove
    // acos() past -1, which returns a NaN -- gl_Position went NaN and the
    // primitive was silently dropped, so NINETEEN TWENTIETHS of the lattice
    // never drew at all.  That, not the exposure, is why the frame measured
    // occ 0.18 on a mostly black picture.
    const float totalCubes = 4900.0;
    float seed = cIndex / totalCubes;

    // Golden spiral shell distribution
    float n = cIndex + 1.0;
    float goldenAngle = 2.39996323; // pi * (3 - sqrt(5))
    // 2.9, not 1.8: at 4.5 units out the frustum is 4.7 units high, so the old
    // radius left the lattice sitting well inside the picture with black all
    // round it.  quasiScaleP is now an OFFSET on that radius rather than a
    // multiplier of it: as a multiplier its low end (1.0) still shrank the
    // lattice back to a 1.9-unit ball covering barely half the frame width,
    // which is the case the occ measurement caught.
    float r = sqrt(n / totalCubes)
            * (quasiScaleP > 0.01 ? (2.40 + 0.55 * quasiScaleP) : 2.95);
    float theta = n * goldenAngle + t * 0.4;
    float phi = acos(clamp(1.0 - 2.0 * n / totalCubes, -1.0, 1.0));

    // Icosahedral symmetry modulation on radial positions
    float icosMod = 1.0 + 0.18 * (pow(sin(theta * 5.0), 2.0) * pow(sin(phi * 3.0), 2.0));
    r *= icosMod;
    vQuasiShell = r;

    vec3 quasiPos = vec3(
        r * sin(phi) * cos(theta),
        r * sin(phi) * sin(theta),
        r * cos(phi)
    );

    // Rhombohedral rhombohedron cube scaling.  Spread over the full lattice the
    // rhombs also have to be big enough to read: as a bare multiple of
    // cubeSizeP the small end (0.03 -> 0.051) was a 10-pixel speck, so the
    // preset now sets an offset above a floor that always reads.
    float sz = (cubeSizeP > 0.001 ? (0.075 + 0.85 * cubeSizeP) : 0.11)
             * (1.0 + 0.3 * audioSwell);
    vec3 cubePos = quasiPos + corner * sz;
    
    vNormal = normalize(corner);
    vCol = imgPalette(fract(seed + r * 0.25 + audioCentroid));
    
    // Camera Transform (V3)
    vec3 vp = cubePos;
    
    // 3D rotation
    float c = cos(t * 0.2), s = sin(t * 0.2);
    vp = vec3(vp.x * c - vp.z * s, vp.y, vp.x * s + vp.z * c);
    vp.z += 5.4;

    // A 16:9 frame is 1.78x wider than it is tall, so a spherical lattice that
    // fills it vertically still leaves the sides bare.  Applied in VIEW space,
    // AFTER the turntable, so the wide axis can never rotate into depth and let
    // the margins go empty again.
    vp.x *= 1.42;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    // The lattice now reaches within a couple of units of the lens; anything
    // that crosses the near plane would smear a wedge across the frame.
    if (vp.z < 0.5)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
}
