#version 330 core
/**
 * @file MagnetotacticBacteriaChains.vert
 * @brief Vertex stage companion to MagnetotacticBacteriaChains.frag -- see that file's
 * header for this scene's description.
 *
 * The 4900 cubes make 306 chains of 16, but the old layout put chain n at
 * z = (n - 8) * 0.35: chain 300 sat 100 units down the view axis, so all but
 * the first couple of dozen chains were sub-pixel specks strung out into the
 * far dark, and the whole frame carried one small clump (luma 0.017).  The
 * chains are now laid out on a jittered 22 x 14 lattice in FRUSTUM coordinates
 * -- lateral slot, chain length, helix radius and crystal size all scale with
 * depth -- so a chain 30 units back subtends the same angle as one at 4, and
 * the culture fills the whole cell.
 *
 * Filling the cell is not the same as having a picture in it.  Every crystal
 * used to come out at nearly the same level, so the culture measured as an even
 * dark mush (contrast 0.037).  Each chain now carries its own vChainLit -- how
 * deep in the medium it swims times how strongly that cell mineralised -- which
 * spans about 9x from the darkest chain to the brightest, at the ~1-tile scale
 * a chain occupies on screen.
 */

in vec4 attrA; // xyz = cube corner (-0.5..0.5), w = cube index
in vec4 attrB; // 4 seeds in [0,1)

out vec3 vNormal;
out vec3 vCol;
out float vChainID;
out vec3 vLocalPos;
out float vChainLit;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

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

uniform float magnetosomeSizeP;

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

float hsh(float a, float b)
{
    return fract(sin(a * 91.73 + b * 47.31) * 43758.5453);
}

void main()
{
    vec3 corner = attrA.xyz;
    float cIndex = attrA.w;
    vLocalPos = corner;

    // The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
    const float kTanY = 0.5206;
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

    float t = time * 0.4 + audioAdvance * 0.35;

    // Divide cubes into chains of magnetosome crystals
    const float cubesPerChain = 16.0;
    float chainIdx = floor(cIndex / cubesPerChain);          // 0..306
    float magnetosomeIdx = mod(cIndex, cubesPerChain);
    vChainID = chainIdx;

    float h1 = hsh(chainIdx, 1.7);
    float h2 = hsh(chainIdx, 4.3);
    float h3 = hsh(chainIdx, 8.9);
    float h4 = hsh(chainIdx, 15.1);

    // ---- FRUSTUM PLACEMENT ------------------------------------------
    float dz    = 3.6 + h3 * h3 * 26.0;
    float halfH = dz * kTanY;
    float halfW = halfH * aspect;

    float gx = mod(chainIdx, 22.0);
    float gy = floor(chainIdx / 22.0);                        // 0..13
    float fx = ((gx + 0.5) / 22.0 - 0.5) * 2.0 + (h1 - 0.5) * 0.11;
    float fy = ((gy + 0.5) / 14.0 - 0.5) * 2.0 + (h2 - 0.5) * 0.13;
    vec3 ctr = vec3(fx * halfW * 1.06, fy * halfH * 1.06, dz);

    // ---- ONE SWIMMING CHAIN ------------------------------------------
    float chainSeed = chainIdx * 0.45;
    float swimT = t * 0.8 + chainSeed;

    // Each chain aligns with its own local geomagnetic field line, which
    // precesses slowly.  (The old GLOBAL y-rotation had to go: it swings a
    // frustum-placed field right out of the frame.)
    float aA = h1 * 6.2831853 + t * 0.12 * (0.5 + h4);
    vec3 ax = normalize(vec3(cos(aA), sin(aA), 0.30 * (h2 - 0.5)));
    vec3 u1 = normalize(cross(ax, vec3(0.0, 0.0, 1.0)));
    vec3 u2 = cross(ax, u1);

    // Helical swimming path along that field line.
    float helixR = halfH * (0.026 + 0.020 * sin(chainSeed * 2.0) + 0.014 * h4);
    float s      = (magnetosomeIdx - cubesPerChain * 0.5) * halfH * 0.0175;
    float phi    = swimT * 1.5 + chainSeed + magnetosomeIdx * 0.55;

    // Flagellar propulsion: the chain slides along its own axis and wraps.
    float glide = (fract(h3 + t * 0.07) - 0.5) * halfH * 0.30;

    vec3 chainCenter = ctr + ax * (s + glide)
                     + (u1 * cos(phi) + u2 * sin(phi)) * helixR;

    // Magnetite crystal facet size, held to a constant ANGULAR size so a far
    // crystal is still a legible cube instead of a sub-pixel speck.  The
    // 0.03..0.12 preset range is COMPRESSED to 0.80..1.60 of the base: used raw
    // it swings the crystal's screen AREA by 15x, and at its low end the cubes
    // came out under 4 px on a 1080p frame -- below that they average away
    // entirely at measuring resolution and take the scene's whole exposure with
    // them.  Compressed, the crystal never drops under about 6 px.
    float szP = clamp((magnetosomeSizeP > 0.001 ? magnetosomeSizeP : 0.065), 0.03, 0.12);
    float szF = 0.80 + 0.80 * (szP - 0.03) / 0.09;
    float sz  = halfH * 0.0145 * szF * (1.0 + 0.3 * audioSwell);
    vec3 cubePos = chainCenter + corner * sz;

    vNormal = normalize(corner);
    vCol = imgPalette(fract(chainIdx * 0.08 + magnetosomeIdx * 0.03 + audioCentroid));

    // ---- PER-CHAIN LEVEL ---------------------------------------------
    // Culture depth: the far lattice rows sink toward the dark of the medium.
    // Times how strongly this particular cell biomineralised, so neighbouring
    // chains at the same depth are not the same brightness either.  This is the
    // scene's light/dark separation, and a chain is about one measuring tile
    // long, which is exactly the scale the picture was missing.
    float depthFade = clamp(1.0 - dz / 46.0, 0.30, 1.0);
    vChainLit = depthFade * (0.45 + 0.85 * h4);

    vec3 vp = cubePos;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
}
