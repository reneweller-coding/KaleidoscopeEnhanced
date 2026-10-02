#version 330 core
/**
 * @file SpinGlassFrustrationLattice.vert
 * @brief Vertex stage companion to SpinGlassFrustrationLattice.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; ///< xyz = base coord, w = point index
in vec4 attrB; ///< 4 hash seeds in [0,1)

out vec3 vCol;   ///< Colour (from the vertex stage).
out float vFrustration;
out float vPointSize;

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

uniform float kagomePitchP;
uniform float pointSizeP;
uniform float pointGainP;

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
    float pIndex = attrA.w;
    vec4 seeds   = attrB;

    float t = time * 0.35 + audioAdvance * 0.3;

    // Geometrically frustrated 3D Kagome / Pyrochlore spin-glass lattice
    float nx = 240.0;
    float ix = mod(pIndex, nx);
    float iy = floor(pIndex / nx);

    float spacing = (kagomePitchP > 0.001 ? kagomePitchP : 0.024);

    // Triangles sharing vertices: Kagome lattice topology
    float triMod = mod(ix + iy, 3.0);
    vec2 kagomeP = vec2(
        (ix - nx * 0.5) * spacing * 1.7320508 + triMod * 0.01,
        (iy - 125.0) * spacing * 1.5
    );

    // Frustrated spin orientations undergoing thermal Glauber dynamics
    float spinState = sin(pIndex * 37.19 + t * 1.5) * cos(pIndex * 13.45 - t * 1.2);
    float frustration = abs(sin(spinState * 3.14159265 + audioPhase));
    vFrustration = frustration;

    // Spin ice 3D depth layer
    float zCoord = (seeds.z - 0.5) * 1.4 + spinState * 0.15;

    vec3 worldPos = vec3(kagomeP, zCoord);

    vCol = imgPalette(fract(pIndex * 0.0001 + frustration * 0.35 + audioCentroid));

    // Camera Transform (V3)
    vec3 vp = worldPos;
    vp.z += 4.5;
    vp.x -= eyeOff;

    // Perspective tilt
    float tilt = 0.55;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    // Point Sprite size (V8c: cap 10-18px)
    float baseSize = (pointSizeP > 1.0 ? pointSizeP : 12.0);
    // Fewer, bigger: at full density every site was sub-pixel and the
    // lattice integrated into grey noise.  Two sites in three are
    // dropped; the survivors carry the picture.
    if (mod(pIndex, 3.0) > 0.5) { gl_Position = vec4(0.0, 0.0, -3.0, 1.0); }
    gl_PointSize = clamp(baseSize * (3.2 / max(gl_Position.w * 0.25, 0.5)), 5.0, 40.0);
    vPointSize = gl_PointSize;
}
