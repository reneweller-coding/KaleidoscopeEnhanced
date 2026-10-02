#version 330 core
/**
 * @file SandDuneBarchanMigration.vert
 * @brief Vertex stage companion to SandDuneBarchanMigration.frag -- see that file's header for
 * this scene's description.
 *
 * Audio Reactivity (geometry; see the .frag header for the shading side):
 *   audioAdvance -> slow downwind migration of the barchan field
 *   audioBass    -> swell of the crescent dune bodies
 *   audioHigh    -> saltation-ripple amplitude
 *   audioZCR     -> SAND GRAIN: the noisiness of the signal is the wind.  A
 *                   clean tone leaves the slip faces smooth; broadband, hissy
 *                   material rakes the whole field into wind ripples -- both
 *                   in the height field AND in the normal, so the ripples
 *                   actually catch the low sun instead of only bumping the
 *                   silhouette
 */
layout(location = 0) in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
layout(location = 1) in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioFlux;   ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioZCR;

uniform float duneP;
uniform float rippleP;
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

out vec3 vWorldPos;   ///< World position (from the vertex stage).
out vec3 vNormal;   ///< Surface normal (from the vertex stage).
out vec2 vTexCoord;   ///< Texture coordinate (from the vertex stage).

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float dne = (duneP   > 0.0) ? duneP   : 1.0;
    float rpl = (rippleP > 0.0) ? rippleP : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;

    // Scene3DShader supplies attrA.xy in [0,1] for grid/quads geometry;
    // this shader's math assumes a centred [-1,1] domain, so remap it here
    // (otherwise everything lands in one quadrant, off to the side).
    vec2 gridUV = attrA.xy * 2.0 - 1.0;   // [-1,1]
    vTexCoord = gridUV * 0.5 + 0.5;

    float t = time * 0.35 * spd + audioAdvance * 0.18;

    // ---- THE FIELD REACHES THE HORIZON -----------------------------------
    // The grid used to be a flat 7x7 patch: from this camera it filled the
    // bottom half of the frame and stopped dead at the middle of the picture,
    // with everything above it black (the scan measured 58 % of the tiles
    // empty).  The patch is now a perspective CARPET -- depth sampled
    // non-linearly so the rows stay dense where they are seen from close up,
    // and the row width growing with distance to match the frustum, so the
    // sand runs off all four edges of the frame.
    float depth01 = attrA.y;                                  // 0 near .. 1 far
    float zw    = mix(-4.5, 38.0, pow(depth01, 1.6));
    float halfW = mix( 5.0, 40.0, pow(depth01, 1.2));
    vec2  ground = vec2(gridUV.x * halfW, zw);

    // Barchan crescent dune profile: crescent horns pointing downwind
    vec2 p = ground + vec2(t * 0.4, 0.0);
    float crescentY = p.y - sin(p.x * 2.0) * 0.4;
    // Distant dunes grow a little to hold their own against the perspective
    // squash, so the far field reads as a dune sea and not as a flat plain.
    float farGain = 1.0 + 0.75 * depth01;
    float duneHeight = max(0.0, sin(p.x * 2.0 * dne) * cos(crescentY * 2.0))
                     * 1.2 * farGain * (1.0 + 0.3 * audioBass);

    // Wind saltation ripples along the windward slope.  The ZERO-CROSSING
    // RATE is the wind: a clean tone leaves the slip faces smooth, hissy
    // broadband material rakes the sand into grain.  Only the AMPLITUDE is
    // audio-driven -- the 35.0 spatial frequency multiplies p.x, which
    // carries the migration time, and must stay a constant.
    // The ripples fade out with distance: at 35 cycles per unit the far rows
    // are far past what 120 grid rows can sample, and left in they would boil
    // into moire instead of grain.
    float ripFade = exp(-max(zw, 0.0) * 0.16);
    float ripAmp  = (0.70 + audioHigh * 0.8 + 1.10 * clamp(audioZCR, 0.0, 1.0))
                  * ripFade;
    float ripPh   = p.x * 35.0 * rpl + p.y * 15.0;
    float ripples = sin(ripPh) * 0.04 * ripAmp;
    duneHeight += ripples;

    vec3 pos = vec3(ground.x, duneHeight - 0.5, ground.y);
    vWorldPos = pos;

    // Normal estimation.  The ripple slope goes in too, otherwise the grain
    // exists only in the silhouette -- from this near-overhead camera it has
    // to tilt the surface to be seen at all.
    vNormal = normalize(vec3(-cos(p.x * 2.0) * 0.4 - 0.25 * ripAmp * cos(ripPh),
                             1.0,
                             -sin(crescentY * 2.0) * 0.4));

    // Camera transform: this surface lies in the XZ plane, so pitch it down
    // first (otherwise it is seen edge-on), then push away along +z and negate
    // -- projM expects NEGATIVE view-space z (clip-w = -z_view).
    // The pitch is steeper than the old -0.5: it puts the horizon just above
    // the top edge, so the dune sea covers the frame with no sky gap.
    vec3 vp = pos;
    vp.y -= 1.5;
    float camTilt = -0.62;
    float cosT = cos(camTilt), sinT = sin(camTilt);
    vp = vec3(vp.x, vp.y * cosT - vp.z * sinT, vp.y * sinT + vp.z * cosT);
    vp.z += 7.0;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
