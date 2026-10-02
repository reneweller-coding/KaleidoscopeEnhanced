#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file Tesseract4DRotation.frag
 * @brief TRANSITION TESSERACT 4D ROTATION: 4D hypercube rotation & W-axis slice transition.
 * The image is embedded as a 3D hyperplane in 4D Euclidean space. Double
 * rotations in XW and YZ planes rotate Universe 1 into the 4th dimension and
 * project Universe 2 onto the 3D screen.
 *   interpolation -> sweeps 4D hyper-rotation angle from 0 to pi/2
 *   audioKick     -> flashes 4D tesseract edge boundary vertices
 *
 * Per-activation variety:
 *   rot4DP float 4D rotation angle velocity ratio (0.5..2.2)
 *   sliceP float W-axis slicing plane displacement (0.5..2.0)
 *   speedP float animation speed multiplier       (0.5..2.0)
 *   hueP   float 4D wireframe hue offset          (0..6.28)
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< slow loudness swell: the only envelope allowed to shape geometry
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioFlux;   ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float rot4DP;
uniform float sliceP;
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float r4d = (rot4DP > 0.0) ? rot4DP : 1.0;
    float slc = (sliceP > 0.0) ? sliceP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.0691 * spd;   // clock rate measured down to about 1.2/255 of change per frame (PresetEditor --transprofile); it spun many times that and read as frantic
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // 4D point (x, y, z, w) where z = 0, w = 0 initially
    float angleXW = tProg * 1.5707963 * r4d; // 0 to 90 degrees
    float angleYZ = tProg * 1.5707963 * r4d + t * 0.5;

    // Rotate in X-W plane
    float xNew = p.x * cos(angleXW);
    float wNew = p.x * sin(angleXW);

    // Rotate in Y-Z plane
    float yNew = p.y * cos(angleYZ);
    float zNew = p.y * sin(angleYZ);

    // 4D perspective projection back to 2D: (x, y) / (2 - w).
    // audioBass undulates the hyper-volume projection perspective -- how hard
    // the 4th coordinate w foreshortens.  midTransition gates it back to the
    // base 0.5 at both fade endpoints, and warpUV is blended in by
    // midTransition there as well, so the frame is exactly tex0 / tex1.
    float perspW = 0.5;   // constant: an envelope on a scale re-lays the whole pattern (speed pass 14.09.2026)
    float d4D = max(1.8 - wNew * perspW, 0.4);
    vec2 pProj = vec2(xNew, yNew) / d4D;

    vec2 warpUV = (pProj * resolution.y + 0.5 * resolution) / resolution;

    vec4 c1 = texture(tex1, fract(mix(uv, warpUV, midTransition)));
    vec4 c0 = texture(tex0, fract(mix(warpUV, uv, 1.0 - midTransition)));

    vec4 col = mix(c1, c0, tProg);

    // Tesseract 4D hypercube wireframe edge glow -- genuinely thin lines
    // (smoothstep window on the sine peak; any pow() of |sin| still leaves
    // wide bands) and gentle gain: the old 1.2+kick*3 turned the whole frame
    // into a glowing grid with the scene gone underneath.
    float wireEdge = max(abs(sin(p.x * 12.0 * slc)), abs(sin(p.y * 12.0 * slc)));
    float wireGlow = smoothstep(0.985, 1.0, wireEdge) * midTransition;
    col.rgb += wireGlow * vec3(0.2, 0.9, 1.0) * (0.3 + audioKick * 0.4);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}
