#version 330 core
/**
 * @file CarbonNanotubeChiralityArmchairZigzag.vert
 * @brief Vertex stage companion to CarbonNanotubeChiralityArmchairZigzag.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // x = t [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out float vSide;
out float vRibbonID;
out vec3 vCol;
out float vConductPulse;

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

uniform float tubeRadiusP;
uniform float chiralAngleP;
uniform float ribbonWidthP;

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
    
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // Single-walled carbon nanotubes (SWCNT) -- a crossing NETWORK of them.
    // Nanotubes never grow alone: they form aligned bundles and buckypaper
    // mats.  The 20 ribbons are therefore split into 7 tubes of 3 helical
    // strands each; every tube is longer than the frame is wide and the tubes
    // are laid out on a FRUSTUM ladder (y scaled by the tube's own depth), so
    // the mat crosses the whole picture instead of sitting as one lone pipe.
    float chiralAngle = (chiralAngleP > 0.01 ? chiralAngleP : 0.52359877); // 30 deg default
    float nStrands = 3.0;
    float tubeI  = floor(rIndex / nStrands);          // 0..6
    float strandOffset = mod(rIndex, nStrands) * (6.2831853 / nStrands);

    // Per-TUBE constants (attrB is per-ribbon, so the strands of one tube must
    // derive their shared numbers from the tube index alone).
    float h1 = fract(sin(tubeI * 12.9898 + 4.13) * 43758.5453);
    float h2 = fract(sin(tubeI * 78.2330 + 1.77) * 43758.5453);
    float h3 = fract(sin(tubeI * 39.4250 + 9.31) * 43758.5453);

    const float kTanY = 0.5206;                       // 55 deg vertical FOV
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

    float dz    = 5.0 + h3 * 2.6;                     // depth ladder
    float halfH = dz * kTanY;
    float halfW = halfH * aspect;

    // Tube centre: one rung per tube up the frame, gently drifting
    float cyN = ((tubeI + 0.5) / 7.0) * 2.0 - 1.0;    // -0.857..0.857
    vec3 cellC = vec3((h1 - 0.5) * 0.70 * halfW + 0.10 * halfW * sin(t * 0.40 + tubeI * 1.7),
                      cyN * 1.02 * halfH + 0.07 * halfH * cos(t * 0.33 + tubeI * 2.3),
                      dz);

    // Tube axis: mostly in the picture plane, slowly scissoring, slightly
    // tilted into depth so the mat reads as three-dimensional.
    float ang  = (h2 - 0.5) * 1.10 + 0.13 * sin(t * 0.23 + tubeI * 1.9);
    float tilt = (h3 - 0.5) * 0.50;
    vec3  A = normalize(vec3(cos(ang), sin(ang), tilt));
    vec3  U = normalize(cross(A, vec3(0.0, 0.0, 1.0)));
    vec3  V = cross(A, U);

    float tubeR = halfH * 0.155 * clamp((tubeRadiusP > 0.01 ? tubeRadiusP : 0.75) / 0.75, 0.6, 1.5);
    float tubeL = 2.7 * halfW;                        // longer than the frame
    float sAxis = (tCoord - 0.5) * tubeL;

    // Helical winding at the chiral angle theta_c (0 = zigzag, 30 deg = armchair)
    float phi = sAxis * tan(chiralAngle) * 2.2 + strandOffset + t * 1.5;

    // Hexagonal sp2 carbon bond corrugation ripples
    float hexRipples = sin(sAxis * 9.0) * cos(phi * 6.0) * 0.045 * tubeR;
    float currentR = tubeR + hexRipples;

    vec3 centerLocal = vec3(cos(phi) * currentR, sin(phi) * currentR, sAxis);

    vec3 tangent = normalize(vec3(-sin(phi) * tan(chiralAngle) * 2.2 * tubeR,
                                   cos(phi) * tan(chiralAngle) * 2.2 * tubeR, 1.0));
    vec3 binormal = normalize(cross(tangent, vec3(cos(phi), sin(phi), 0.0)));

    // The quad is ~2.6x the sp2 wall: the fragment stage paints the inner
    // third as the wall and the rest as its metallic sheen, which is screen
    // coverage for free (no extra geometry).
    float width = (ribbonWidthP > 0.001 ? ribbonWidthP : 0.045)
                * clamp(tubeR / 0.75, 0.35, 1.6) * 2.6 * (1.0 + 0.3 * audioSwell);
    vec3 local = centerLocal + binormal * (side * width);

    // Ballistic pi-electron conduction pulse along nanotube axis
    float pulse = exp(-abs(fract(tCoord * 4.0 - t * 3.0 + rIndex * 0.125) - 0.5) * 16.0) * (1.0 + 3.0 * audioKick);
    vConductPulse = pulse;

    vCol = imgPalette(fract(rIndex * 0.125 + tCoord * 0.3 + audioCentroid));

    // Camera Transform (V3)
    vec3 vp = cellC + U * local.x + V * local.y + A * local.z;
    vp.z = max(vp.z, 0.9);
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
