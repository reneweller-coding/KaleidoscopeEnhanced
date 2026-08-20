#version 330 core
/**
 * @file PhotonicChiralMetamaterialGyroidHelix.vert
 * @brief Vertex stage companion to PhotonicChiralMetamaterialGyroidHelix.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // x = t [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out float vSide;
out float vRibbonID;
out vec3 vCol;
out float vChiralPulse;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;
uniform vec2 resolution;

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

uniform float helixRadiusP;
uniform float ribbonWidthP;
uniform float pitchTurnsP;

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
    float tCoord = attrA.x;
    float side   = attrA.y;
    float rIndex = attrA.w;
    
    vSide = side;
    vRibbonID = rIndex;
    vUV = vec2(tCoord, side * 0.5 + 0.5);
    
    // Base rate raised from 0.35: every mover in this scene is geared DOWN off
    // this clock (tumble 0.31t, lattice breath 0.61t, screw 1.5t), so at 0.35 the
    // fastest full-lattice motion was 0.11 rad/s and the array read as a still
    // life (measured motion 0.0048, under the static threshold). Still a
    // per-activation constant coefficient on `time`, so anti-flicker safe.
    float t = time * 0.58 + audioAdvance * 0.3;

    // ---- 3D chiral metamaterial micro-helix ARRAY ------------------------
    // One helix is a motif; a metamaterial is a LATTICE of them.  The 20
    // ribbons are laid out on a 5 x 4 grid in FRUSTUM coordinates (x/y scaled
    // by each cell's own depth), so the array covers the whole picture at
    // every distance instead of bunching into one central knot.
    const float kTanY = 0.5206;                    // 55 deg vertical FOV
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

    float gx = mod(rIndex, 5.0);
    float gy = floor(rIndex / 5.0);
    // > 1.0 so the outer ranks straddle the frame edge: no empty border
    float nx = (((gx + 0.5) / 5.0) * 2.0 - 1.0) * 1.26;
    float ny = (((gy + 0.5) / 4.0) * 2.0 - 1.0) * 1.36;
    // slow lattice breathing -- continuous, no wrap, rate from the accumulator
    nx += 0.055 * sin(t * 0.61 + rIndex * 1.13);
    ny += 0.050 * cos(t * 0.47 + rIndex * 2.07);

    float dz    = 4.6 + attrB.z * 2.4;             // parallax layers
    float halfH = dz * kTanY;
    float halfW = halfH * aspect;
    vec3  cellC = vec3(nx * halfW, ny * halfH, dz);

    float hRad = (helixRadiusP > 0.01 ? helixRadiusP : 0.65);
    // Coil radius/length up from 0.21/0.95: with 20 fixed ribbons the only way to
    // raise coverage is to make each helix bigger. The array reached barely a
    // quarter of the frame's tiles before (measured occ 0.26).
    float R    = halfH * 0.30 * clamp(hRad / 0.65, 0.7, 1.6);   // coil radius
    float L    = halfH * 1.30;                                  // coil length

    float nTurns = (pitchTurnsP > 0.01 ? pitchTurnsP : 6.0);
    float phi = tCoord * nTurns * 6.2831853 + rIndex * 0.7853982 + t * 1.5;

    vec3 centerPos = vec3(cos(phi) * R, sin(phi) * R, (tCoord - 0.5) * L);

    vec3 tangent = normalize(vec3(-sin(phi) * R * nTurns * 6.2831853,
                                   cos(phi) * R * nTurns * 6.2831853, L));
    vec3 binormal = normalize(cross(tangent, vec3(cos(phi), sin(phi), 0.0)));

    // The quad is ~4.5x the metal ribbon: the fragment stage paints the inner
    // fifth as the ribbon and the rest as a soft plasmonic bloom, which is
    // screen coverage for free (no extra geometry). Widened from 2.8x -- the
    // bloom is the only thing that can fill the gaps between 20 thin springs.
    float width = (ribbonWidthP > 0.001 ? ribbonWidthP : 0.045)
                * clamp(R / 0.65, 0.6, 1.8) * 4.5 * (1.0 + 0.3 * audioSwell);
    vec3 worldPos = centerPos + binormal * (side * width);

    // Each micro-helix tumbles on its own two axes -> the array is never still
    float ax = 0.50 * sin(t * 0.31 + rIndex * 0.73);
    float ay = 0.50 * cos(t * 0.27 + rIndex * 1.31);
    float ca = cos(ax), sa = sin(ax);
    worldPos = vec3(worldPos.x,
                    worldPos.y * ca - worldPos.z * sa,
                    worldPos.y * sa + worldPos.z * ca);
    float cb = cos(ay), sb = sin(ay);
    worldPos = vec3(worldPos.x * cb + worldPos.z * sb,
                    worldPos.y,
                   -worldPos.x * sb + worldPos.z * cb);

    // Circular dichroism optical activity pulse
    float pulse = exp(-abs(fract(tCoord * 3.0 - t * 2.5 + rIndex * 0.166) - 0.5) * 16.0) * (1.0 + 3.0 * audioKick);
    vChiralPulse = pulse;

    vCol = imgPalette(fract(rIndex * 0.166 + tCoord * 0.3 + audioCentroid));

    // Camera Transform (V3)
    vec3 vp = cellC + worldPos;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
