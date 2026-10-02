#version 330 core
/**
 * @file LuttingerLiquidSpinChargeSeparation.vert
 * @brief Vertex stage companion to LuttingerLiquidSpinChargeSeparation.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; ///< x = t [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; ///< 4 seeds in [0,1)

out vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out float vSide;   ///< Which side of a strip (from the vertex stage).
out float vRibbonID;
out vec3 vCol;   ///< Colour (from the vertex stage).
out float vHolon;
out float vSpinon;

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

uniform float ribbonWidthP;
uniform float speedRatioP;

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
    
    float t = time * 0.4 + audioAdvance * 0.35;
    
    // 1D Quantum wire trajectory along spiral cylinder
    float phi = tCoord * 6.2831853 * 3.0;
    float wireRadius = 1.3 + 0.4 * sin(rIndex * 0.6 + audioPhase);
    
    // Spinon velocity vs Holon velocity (Spin-charge separation: v_holon != v_spinon)
    float ratio = (speedRatioP > 0.01 ? speedRatioP : 1.8);
    float holonPhase = sin(tCoord * 16.0 - t * 3.0 * ratio + rIndex * 0.3);
    float spinonPhase = sin(tCoord * 16.0 - t * 3.0 + rIndex * 0.3);
    
    vHolon = holonPhase * 0.5 + 0.5;
    vSpinon = spinonPhase * 0.5 + 0.5;
    
    // Spatial displacement of quantum wire from collective wave modes
    float zPos = (tCoord * 5.0 - 2.5) + holonPhase * 0.15;
    float rMod = wireRadius + spinonPhase * 0.18;
    
    vec3 centerPos = vec3(
        cos(phi + rIndex * 0.5) * rMod,
        sin(phi + rIndex * 0.5) * rMod,
        zPos
    );
    
    vec3 tangent = normalize(vec3(-sin(phi), cos(phi), 0.35));
    vec3 binormal = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));
    
    float width = (ribbonWidthP > 0.001 ? ribbonWidthP : 0.05) * (1.0 + 0.3 * audioSwell);
    vec3 worldPos = centerPos + binormal * (side * width);
    
    // Color mapping: Holon mode (charge) vs Spinon mode (spin)
    vec3 colHolon = imgPalette(fract(vHolon * 0.5 + audioCentroid));
    vec3 colSpinon = imgPalette(fract(vSpinon * 0.5 + 0.5 + audioCentroid));
    vCol = mix(colHolon, colSpinon, 0.5);
    
    // Camera Transform (V3)
    vec3 vp = worldPos;
    
    // Smooth 3D rotation
    float c = cos(t * 0.15), s = sin(t * 0.15);
    vp = vec3(vp.x * c - vp.z * s, vp.y, vp.x * s + vp.z * c);
    vp.z += 4.8;
    vp.x -= eyeOff;
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
