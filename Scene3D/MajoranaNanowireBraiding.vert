#version 330 core
/**
 * @file MajoranaNanowireBraiding.vert
 * @brief Vertex stage companion to MajoranaNanowireBraiding.frag -- see that file's
 * header for this scene's description.
 *
 * SCREEN FILL: all 20 ribbons used to braid inside ONE bundle 1.3 units across,
 * lying on the view axis 4.5 units out -- a small knot of hair-thin threads in
 * the middle of a black frame (occ 0.31), and half of every wire turned
 * edge-on because the ribbon widened around the wire's own axis instead of
 * across the screen.  The 20 ribbons are now THREE braided bundles standing
 * side by side across the whole picture width, their wire axes running
 * vertically past both the top and bottom edges, plus two wide backdrop bands
 * that keep the superconducting vacuum around them off pure black.
 */

in vec4 attrA; // x = t [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out float vSide;
out float vRibbonID;
out vec3 vCol;
out float vMajoranaZeroMode;
out float vKind;   // 0 = nanowire worldline, 1 = backdrop band

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

uniform float ribbonWidthP;
uniform float braidSpeedP;

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

// House tint: bend a colour toward the photo palette while keeping its
// luminance.  The raw palette was used directly before, so a dark corner of
// the slideshow image handed every wire a near-black worldline.
vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
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
    float vBraid = (braidSpeedP > 0.01 ? braidSpeedP : 1.2);

    vec3  worldPos;
    vec3  col;
    float mzm = 0.0;

    if (rIndex < 17.5)
    {
        // ---- THREE BRAIDED BUNDLES, 3 nanowire PAIRS each -------------
        vKind = 0.0;
        float b    = floor(rIndex / 6.0);            // bundle 0..2
        float sIdx = rIndex - b * 6.0;               // strand 0..5
        float strandPhase = sIdx * 1.04719755 + b * 0.73;

        // The worldline axis runs up the frame and past both edges.
        float yPos = (tCoord - 0.5) * 6.4;

        // Non-Abelian braiding permutations (braid group generators sigma_1, sigma_2)
        float braidTime = yPos * 1.15 + t * vBraid;
        float rBraid = (0.92 + 0.40 * sin(braidTime * 0.5 + strandPhase))
                     * (1.0 + 0.10 * audioSwell);
        float phiBraid = strandPhase + sin(braidTime + strandPhase) * 1.2;

        float bx = (b - 1.0) * 2.75;
        vec3 centerPos = vec3(bx + cos(phiBraid) * rBraid,
                              yPos,
                              sin(phiBraid) * rBraid);

        // Ribbon frame: widen ACROSS THE SCREEN (perpendicular to the wire and
        // to the view axis), so a wire on the far side of the braid stays a
        // drawn line instead of turning edge-on and vanishing.
        vec3 tangent  = normalize(vec3(-sin(phiBraid) * rBraid, 1.0,
                                        cos(phiBraid) * rBraid));
        vec3 binormal = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));

        float width = (ribbonWidthP > 0.001 ? ribbonWidthP : 0.045)
                    * (1.0 + 0.3 * audioSwell) * 2.6;
        worldPos = centerPos + binormal * (side * width);

        // Majorana Zero Mode localized wavepackets at the wire ends
        // (tCoord near 0 and 1 -- now the top and bottom of the frame).
        float endProximity = max(exp(-tCoord * 14.0), exp(-(1.0 - tCoord) * 14.0));
        mzm = endProximity * (1.0 + 3.5 * audioKick);

        // Each PAIR of strands shares a colour: the two halves of one
        // fermion, cyan through violet across the three pairs.
        float pair = floor(sIdx * 0.5);              // 0..2
        vec3 base = mix(vec3(0.30, 0.78, 1.00), vec3(0.72, 0.40, 1.00), pair * 0.5);
        col = palTint(base, fract(rIndex * 0.166 + tCoord * 0.2 + audioCentroid), 0.35);
    }
    else
    {
        // ---- BACKDROP: the superconducting vacuum --------------------
        // Two wide bands covering the whole frame behind the braids, carrying
        // a slow Andreev interference fringe.  Dim by design: it only keeps
        // the space between the wires off pure black.
        vKind = 1.0;
        float bi = rIndex - 18.0;                    // 0 or 1
        float x  = (tCoord - 0.5) * 13.6;
        float yb = (bi - 0.5) * 3.4;
        float wav = 0.22 * sin(x * 0.8 - t * 0.5 + bi * 1.7);
        worldPos = vec3(x, yb + wav + side * 2.0, 1.6);

        float fringe = 0.5 + 0.5 * sin(x * 1.7 - t * 0.9 + bi * 2.2)
                                 * cos(x * 0.6 + t * 0.28);
        col = palTint(vec3(0.34, 0.52, 0.95), fract(0.3 + bi * 0.17 + audioCentroid), 0.35)
            * (0.115 + 0.105 * fringe) * (0.85 + 0.35 * audioSwell);
        mzm = 0.0;
    }

    vMajoranaZeroMode = mzm;
    vCol = col;

    // Camera Transform (V3).  The old full turntable swung the bundle edge-on
    // twice a turn; a shallow sway keeps the braid field facing the camera.
    vec3 vp = worldPos;
    float ra = 0.20 * sin(t * 0.18);
    float c = cos(ra), s = sin(ra);
    vp = vec3(vp.x * c - vp.z * s, vp.y, vp.x * s + vp.z * c);
    vp.z += 4.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
