#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file CosmicStringLensing.frag
 * @brief TRANSITION COSMIC STRING LENSING: Relativistic topological cosmic string deficit angle.
 * A 1D GUT-scale cosmic string passes across spacetime, cutting a conical deficit angle
 * (Delta_theta = 8 pi G mu) that duplicates and shears the image into dual wedge copies,
 * fusing smoothly into the incoming scene.
 *   interpolation -> sweeps cosmic string position across the cosmological horizon
 *   audioKick     -> flashes relativistic cosmic string core mass-energy density
 *   audioSwell    -> widens conical spacetime deficit angle
 *
 * Per-activation variety:
 *   tensionP float cosmic string tension G*mu scale     (0.5..2.2)
 *   deficitP float angular wedge shear magnitude        (0.5..2.0)
 *   speedP   float animation speed multiplier           (0.5..2.0)
 *   hueP     float GUT string core emission hue offset  (0..6.28)
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

uniform float tensionP;
uniform float deficitP;
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
    float tns = (tensionP > 0.0) ? tensionP : 1.0;
    float dfc = (deficitP > 0.0) ? deficitP : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.45 * spd;   // clock only: audioAdvance integrates transients and sped the motion up on every surge
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Cosmic string position moving across the frame
    float stringX = mix(-1.2, 1.2, tProg);
    float distToString = p.x - stringX;

    // Conical metric deficit angle jump: Delta_theta = 8 pi G mu
    float deficitAngle = 0.05 * tns * dfc * midTransition * (1.0 + audioSwell * 0.7);
    float wedgeOffset = sign(distToString) * deficitAngle;

    vec2 warpUV = uv + vec2(wedgeOffset, 0.0);

    vec4 c1 = texture(tex1, fract(warpUV));
    vec4 c0 = texture(tex0, fract(warpUV));

    float wipeMask = smoothstep(-0.02, 0.02, distToString);
    vec4 col = mix(c0, c1, wipeMask);

    // Glowing 1D cosmic string core line
    float stringCore = exp(-abs(distToString) * 35.0) * midTransition;
    vec3 coreColor = mix(vec3(0.2, 0.9, 1.0), vec3(1.0, 0.98, 0.9), stringCore);
    col.rgb += stringCore * coreColor * (1.6 + audioKick * 1.17);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}
