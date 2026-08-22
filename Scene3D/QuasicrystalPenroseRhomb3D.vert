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

    // TRUE cut-and-project quasicrystal, replacing the golden-angle ball
    // (which recorded as formless mush -- a random ball has no lattice order
    // to read).  6D hypercubic lattice points (digits base 4; 4096 of the
    // 4900 cubes) are projected through the icosahedral star basis, and only
    // points whose PERPENDICULAR-space image falls inside the acceptance
    // window survive.  The survivors form an aperiodic icosahedral lattice
    // with visible 5-fold axes -- which is what the scene's name promises.
    float nn = cIndex;
    float d0 = mod(nn, 4.0) - 1.5;  nn = floor(nn / 4.0);
    float d1 = mod(nn, 4.0) - 1.5;  nn = floor(nn / 4.0);
    float d2 = mod(nn, 4.0) - 1.5;  nn = floor(nn / 4.0);
    float d3 = mod(nn, 4.0) - 1.5;  nn = floor(nn / 4.0);
    float d4 = mod(nn, 4.0) - 1.5;  nn = floor(nn / 4.0);
    float d5 = mod(nn, 4.0) - 1.5;

    vec3 e0 = normalize(vec3(0.0,  1.0,  tau));
    vec3 e1 = normalize(vec3(0.0, -1.0,  tau));
    vec3 e2 = normalize(vec3( 1.0,  tau,  0.0));
    vec3 e3 = normalize(vec3(-1.0,  tau,  0.0));
    vec3 e4 = normalize(vec3( tau,  0.0,  1.0));
    vec3 e5 = normalize(vec3( tau,  0.0, -1.0));
    float sig = -1.0 / tau;
    vec3 f0 = normalize(vec3(0.0,  1.0,  sig));
    vec3 f1 = normalize(vec3(0.0, -1.0,  sig));
    vec3 f2 = normalize(vec3( 1.0,  sig,  0.0));
    vec3 f3 = normalize(vec3(-1.0,  sig,  0.0));
    vec3 f4 = normalize(vec3( sig,  0.0,  1.0));
    vec3 f5 = normalize(vec3( sig,  0.0, -1.0));

    vec3 par  = d0*e0 + d1*e1 + d2*e2 + d3*e3 + d4*e4 + d5*e5;
    vec3 perp = d0*f0 + d1*f1 + d2*f2 + d3*f3 + d4*f4 + d5*f5;

    float win = 1.40;
    if (cIndex >= 4096.0 || dot(perp, perp) > win * win) {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vCol = vec3(0.0); vNormal = vec3(0.0, 0.0, 1.0);
        vLocalPos = corner; vQuasiShell = 0.0;
        return;
    }

    float spread = (quasiScaleP > 0.01 ? (0.66 + 0.14 * quasiScaleP) : 0.78);
    vec3 quasiPos = par * spread;
    vQuasiShell = length(quasiPos);

    // Rhombohedral rhombohedron cube scaling.  Spread over the full lattice the
    // rhombs also have to be big enough to read: as a bare multiple of
    // cubeSizeP the small end (0.03 -> 0.051) was a 10-pixel speck, so the
    // preset now sets an offset above a floor that always reads.
    float sz = (cubeSizeP > 0.001 ? (0.10 + 0.85 * cubeSizeP) : 0.16)
             * (1.0 + 0.3 * audioSwell);
    vec3 cubePos = quasiPos + corner * sz;

    vNormal = normalize(corner);
    // Perp-space coordinate as the palette key: constant per cube (no
    // whole-lattice flicker -- the old raw audioCentroid term repainted
    // every cube every analysis block), aperiodically varied across the
    // lattice, and physically meaningful (it IS the 6D phase).
    vCol = imgPalette(fract(0.13 + vQuasiShell * 0.22
                            + dot(perp, vec3(0.171, 0.223, 0.281))));

    // Camera Transform (V3)
    vec3 vp = cubePos;

    // 3D rotation
    float c = cos(t * 0.2), s = sin(t * 0.2);
    vp = vec3(vp.x * c - vp.z * s, vp.y, vp.x * s + vp.z * c);
    vp.z += 6.6;

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
