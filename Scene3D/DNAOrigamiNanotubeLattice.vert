#version 330 core
/**
 * @file DNAOrigamiNanotubeLattice.vert
 * @brief Vertex stage companion to DNAOrigamiNanotubeLattice.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // x = t [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out float vSide;
out float vRibbonID;
out vec3 vCol;
out float vFluorPulse;
out float vDepthShade;

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
uniform float helixTurnsP;
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

    float t = time * 0.35 + audioAdvance * 0.3;

    // ---- A LATTICE of DNA origami bundles ------------------------------
    // The scene is called a lattice, but it used to build ONE bundle in the
    // middle of the frame.  Each of the 20 ribbons is cut into two independent
    // STRANDS (tapered to nothing at the cut, so the quad that bridges them is
    // degenerate and invisible), giving 40 strands = ten 4-helix bundles on a
    // slowly turning ring lattice.
    float piece = min(floor(tCoord * 2.0), 1.0);       // which half of the ribbon
    float lt    = tCoord * 2.0 - piece;                // 0..1 along this strand
    float sIdx  = rIndex * 2.0 + piece;                // 0..39 strands
    float tubeI = floor(sIdx * 0.25);                  // 0..9 bundles
    float hIdx  = mod(sIdx, 4.0);                      // helix within the bundle

    vUV = vec2(lt, side * 0.5 + 0.5);

    // Taper AND fade both ends of a strand: this is what hides the bridging
    // quad between piece 0 and piece 1 (zero width, zero light).
    float endFade = smoothstep(0.0, 0.05, lt) * smoothstep(1.0, 0.95, lt);

    const float kTanY = 0.5206;                        // 55 deg vertical FOV
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

    // Lattice site: an outer ring of six, an inner ring of three, one centre.
    // The outer ring stops at 0.80 of the frustum half-extent, not 1.00: a
    // bundle centred exactly ON the frame border throws half of its own light
    // off-screen, which is coverage paid for and then thrown away.
    float ringA, ringR;
    if (tubeI < 6.0)      { ringA = tubeI * 1.04719755;                 ringR = 0.80; }
    else if (tubeI < 9.0) { ringA = (tubeI - 6.0) * 2.0943951 + 1.0472; ringR = 0.40; }
    else                  { ringA = 0.0;                                ringR = 0.0;  }
    ringA += t * 0.16;                                 // the crystal turns slowly
    vec2 site = vec2(cos(ringA), sin(ringA)) * ringR;

    // Each bundle sits at its OWN depth in the culture.  Because the site is in
    // frustum coordinates and every length below is scaled by ang = dz/6, the
    // bundle keeps its screen position and its angular size whatever depth it
    // gets -- so the depth buys light/dark separation (see vDepthShade) without
    // costing any screen coverage.
    float dz    = 4.2 + 5.2 * fract(tubeI * 0.618);
    float ang   = dz / 6.0;
    float halfH = dz * kTanY;
    float halfW = halfH * aspect;
    vec3  cellC = vec3(site.x * halfW, site.y * halfH, dz);

    // Each bundle is tilted off the view axis so it SWEEPS across the frame as
    // it recedes instead of collapsing into a ring seen end-on.  The tilt
    // direction follows the bundle's own lattice angle, so the crystal splays
    // outward and the ten bundles between them reach every corner.
    float axA = 0.52 + 0.18 * sin(t * 0.13) + ringA;
    vec3  A = normalize(vec3(cos(axA) * 0.62, sin(axA) * 0.62, 1.0));
    vec3  U = normalize(cross(A, vec3(0.0, 0.0, 1.0)));
    vec3  V = cross(A, U);

    float rB    = 0.30 * clamp((tubeRadiusP > 0.01 ? tubeRadiusP : 0.65) / 0.65, 0.7, 1.5) * ang;
    float tubeL = 7.8 * ang;
    float sAx   = (lt - 0.5) * tubeL;

    // DNA helical twist along the bundle axis.  Dividing by ang keeps the
    // number of turns per strand fixed, so a far bundle is not a finer,
    // sub-pixel corkscrew than a near one.
    float turns = (helixTurnsP > 0.01 ? helixTurnsP : 8.0);
    float twistK = turns * 0.09 / ang;
    float helixAngle = sAx * twistK + hIdx * 1.5707963 + t * 1.2;

    // Each duplex also wraps its own small double-helix path
    float dh = rB * 0.22;
    vec3 local = vec3(cos(helixAngle) * rB + cos(helixAngle * 4.0) * dh,
                      sin(helixAngle) * rB + sin(helixAngle * 4.0) * dh,
                      sAx);

    vec3 tangent = normalize(vec3(-sin(helixAngle) * rB * twistK,
                                   cos(helixAngle) * rB * twistK, 1.0));
    vec3 binormal = normalize(cross(tangent, vec3(cos(helixAngle), sin(helixAngle), 0.0)));

    // ribbonWidthP is compressed into 0.040..0.072 rather than used raw: at its
    // 0.02 end a raw value makes the backbone ~5 px wide in a 720p recording,
    // which is thin enough to average away to nothing at measuring resolution
    // and takes the whole scene's brightness with it.
    float wBase = 0.030 + 0.52 * clamp((ribbonWidthP > 0.001 ? ribbonWidthP : 0.05), 0.02, 0.08);
    float width = wBase * clamp(rB / (0.35 * ang), 0.5, 1.8) * 1.9 * ang
                * (1.0 + 0.3 * audioSwell) * endFade;
    local += binormal * (side * width);

    // Fluorescent dye fluorophore tagging pulses along DNA origami scaffold
    float pulse = exp(-abs(fract(lt * 12.0 - t * 2.0 + sIdx * 0.1) - 0.5) * 16.0) * (1.0 + 3.0 * audioKick);
    vFluorPulse = pulse * endFade;

    vCol = imgPalette(fract(sIdx * 0.083 + lt * 0.25 + audioCentroid)) * endFade;

    // Camera Transform (V3)
    vec3 vp = cellC + U * local.x + V * local.y + A * local.z;
    vp.z = max(vp.z, 0.9);
    vp.x -= eyeOff;

    // Depth shading: the near bundles of the crystal are lit, the far ones sink
    // into the medium.  This is the scene's light/dark separation -- without it
    // every strand lands in the same luminance bucket and the frame reads flat
    // however much of it is covered.
    vDepthShade = clamp(6.4 / vp.z, 0.30, 1.45);

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
