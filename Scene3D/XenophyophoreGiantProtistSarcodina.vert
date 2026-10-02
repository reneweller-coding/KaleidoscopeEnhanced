#version 330 core
/**
 * @file XenophyophoreGiantProtistSarcodina.vert
 * @brief Vertex stage companion to XenophyophoreGiantProtistSarcodina.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; ///< x = t [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; ///< 4 seeds in [0,1)

out vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out float vSide;   ///< Which side of a strip (from the vertex stage).
out float vRibbonID;
out vec3 vCol;   ///< Colour (from the vertex stage).
out float vBioPulse;

uniform mat4 projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float branchScaleP;
uniform float ribbonWidthP;

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float tCoord = attrA.x;
    float side   = attrA.y;
    float rIndex = attrA.w;
    
    vSide = side;
    vRibbonID = rIndex;
    vUV = vec2(tCoord, side * 0.5 + 0.5);
    
    float t = time * 0.35 + audioAdvance * 0.3;

    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;
    float scaleV = (branchScaleP > 0.01 ? branchScaleP : 1.0);

    // RETICULOPODIA are a NET, not a star.  Twenty purely radial spokes over
    // "16 sectors" put four ribbons exactly on top of another four and left
    // wide empty wedges between the rest.  Twelve radial veins crossed by eight
    // concentric strands weave an actual reticulate mesh -- which is both what
    // the organism looks like and what carries the frame's outer tiles.
    bool ring = (rIndex > 11.5);

    vec3  centerPos;
    vec3  tangent;
    float taper;

    if (!ring)
    {
        // ---- radial protoplasmic veins ------------------------------------
        // Starting at 0.7 rather than 0.2 keeps twelve additive ribbons from
        // all piling onto one hot point at the centre.
        float branchAngle = rIndex * 0.5235988 + r1 * 0.4;   // 12 sectors
        float branchDist = (0.7 + tCoord * 3.3) * scaleV;

        // Organic meandering of protoplasmic veins -- wide enough now that the
        // veins wander across each other instead of running dead straight.
        float meander = sin(tCoord * 9.0 + rIndex * 1.7 + t * 0.8) * 0.42
                      + sin(tCoord * 3.1 + r2 * 6.2831853 - t * 0.5) * 0.30;
        float phi = branchAngle + meander;

        float zFloor = sin(branchDist * 2.0 - t * 0.5) * 0.15 - 0.5;
        centerPos = vec3(cos(phi) * branchDist, sin(phi) * branchDist, zFloor);
        tangent   = normalize(vec3(cos(phi), sin(phi), 0.1));
        taper     = 1.0 - tCoord * 0.45;
    }
    else
    {
        // ---- concentric reticulate strands --------------------------------
        float k     = (rIndex - 12.0) / 7.0;                 // 0..1 over 8 rings
        float ringR = (0.55 + k * 3.3) * scaleV;
        // r3 is a constant per-ribbon seed, so this only ever puts a CONSTANT
        // factor on the clock.
        float phi   = tCoord * 6.2831853 + r1 * 6.2831853 + t * (0.12 + 0.10 * r3);
        float wob   = sin(phi * (3.0 + floor(r2 * 4.0)) + t * 0.6) * 0.18 * ringR;
        float rr    = ringR + wob;

        float zFloor = sin(rr * 2.0 - t * 0.5) * 0.15 - 0.5;
        centerPos = vec3(cos(phi) * rr, sin(phi) * rr, zFloor);
        tangent   = normalize(vec3(-sin(phi), cos(phi), 0.08));
        // Periodic in tCoord, so the ring's width matches where the strip
        // closes on itself instead of stepping at the seam.
        taper     = 0.85 + 0.15 * sin(tCoord * 6.2831853 * 4.0 + rIndex);
    }

    vec3 binormal = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));

    // Plasma veins, not wireframe: at the configured 0.02..0.1 the strands were
    // a couple of pixels across and the network read as empty space between
    // them.  The fragment stage's pow(1-|side|,2.2) core keeps a wide ribbon
    // reading as a soft translucent tube rather than a flat band.
    float width = (ribbonWidthP > 0.001 ? ribbonWidthP : 0.06)
                * 2.6 * taper * (1.0 + 0.3 * audioSwell);
    vec3 worldPos = centerPos + binormal * (side * width);

    // Bioelectric travelling wave through plasma tubes
    float pulse = exp(-abs(fract(tCoord * 3.0 - t * 1.5 + rIndex * 0.1) - 0.5) * 12.0) * (1.0 + 3.0 * audioKick);
    vBioPulse = pulse;
    
    vCol = imgPalette(fract(rIndex * 0.06 + tCoord * 0.3 + audioCentroid));
    
    // Camera Transform (V3)
    // The abyssal tilt has to be applied to the ORGANISM, about its own centre,
    // BEFORE it is pushed away from the lens.  Rotating the already-translated
    // point swung the camera offset through the same 0.65 rad and threw the
    // whole network off the bottom of the frame: only the crescent between
    // y = 0.7 and y = 3 ever landed inside the picture, which is exactly the
    // sliver the metric scan saw (occ 0.19).
    vec3 vp = worldPos;
    float tilt = 0.65;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);

    vp.z += 5.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    // A widely scaled network reaches behind the lens at the near rim; without
    // this the wrapped-around geometry smears back across the picture.
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
}
