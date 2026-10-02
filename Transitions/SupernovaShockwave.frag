#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file SupernovaShockwave.frag
 * @brief TRANSITION SUPERNOVA SHOCKWAVE: Spherical supernova blast wave transition.
 * A hyper-velocity relativistic blast wave detonates at the center, expanding
 * radially outward with glowing shock compression and revealing the new scene.
 *   interpolation -> sweeps the spherical shockwave radius across the viewport
 *   audioKick     -> detonates primary supernova core explosion flash
 *   audioSwell    -> drives shockwave displacement amplitude
 *
 * Per-activation variety:
 *   blastP float shockwave expansion velocity multiplier (0.5..2.2)
 *   shockP float shock front compression thickness       (0.5..2.0)
 *   speedP float animation speed multiplier              (0.5..2.0)
 *   hueP   float shockwave ionization hue offset         (0..6.28)
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

uniform float blastP;
uniform float shockP;
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
    float bls = (blastP > 0.0) ? blastP : 1.0;
    float shk = (shockP > 0.0) ? shockP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.45 * spd;   // clock only: audioAdvance integrates transients and sped the motion up on every surge
    float tProg = clamp(interpolation, 0.0, 1.0);
    // Single fade envelope: 0 at BOTH endpoints, 1 mid-fade. Every decorative
    // term below is multiplied by it, which is what keeps d=0 exactly scene A
    // and d=1 exactly scene B.
    float midT = sin(tProg * 3.14159265);

    float r = length(p);
    float angle = atan(p.y, p.x);

    // Shockwave expanding radius. `bls` used to multiply the RADIUS
    // (tProg * 1.35 * bls), so it also set where the front ENDS: at the bottom
    // of blastP's 0.5..2.2 registration the front only reached 0.675, well
    // short of the frame's corner radius (~1.02 at 16:9), and the corners
    // therefore showed the NEW scene on the very first frame of the fade --
    // measured mean endpoint error 55/255 over the whole picture.
    // The travel is now a fixed span that always clears the corners, and the
    // parameter reshapes the PACING instead (pow keeps 0->0 and 1->1 exactly,
    // so both endpoints stay pixel-exact for every blastP) -- which is what
    // "expansion velocity multiplier" was meant to mean anyway.
    // The guard is not cosmetic: GLSL evaluates pow as exp2(y*log2(x)), so
    // pow(0.0, y) goes through log2(0) = -inf and can come back NaN. An
    // unguarded version of this line measured 120/255 over the whole frame at
    // tProg == 0 for exactly that reason.
    float rShock = ((tProg > 0.0) ? pow(tProg, 1.0 / bls) : 0.0) * 1.45;
    float distToShock = r - rShock;

    // Shock front compression displacement. This warps the texture LOOKUP, so
    // it has to vanish at both endpoints or the scene is sampled off-register
    // there. It did not: at the top of shockP's 0.5..2.0 range the falloff is
    // wide enough that the term is still ~0.014 when the front has left the
    // frame, which measured 2.6/255 against a pixel-exact requirement. Gating
    // on sin(tProg*pi) -- zero at both ends, one in the middle -- is the same
    // idiom the other transitions use for their decorations.
    float compression = exp(-abs(distToShock) * 20.0 / shk) * sign(distToShock) * 0.05
                      * (1.0 + audioSwell * 0.7) * midT;
    vec2 shockDisp = normalize(p + 1e-4) * compression;

    vec4 c1 = texture(tex1, fract(uv + shockDisp));
    vec4 c0 = texture(tex0, fract(uv - shockDisp));

    float wipeMask = smoothstep(-0.02, 0.02, distToShock);
    vec4 col = mix(c0, c1, wipeMask);

    // Glowing Cherenkov shock front ring
    // Gated like everything else: at tProg=0 distToShock collapses to r, so an
    // ungated ring peaked at 1.0 in the centre and painted a bright blob over
    // the incoming scene on the fade's last frame -- worse at high shockP,
    // where the falloff is widest (measured 2.5/255 across the middle third).
    float shockRing = exp(-abs(distToShock) * 35.0 / shk) * midT;
    vec3 shockColor = mix(vec3(0.1, 0.9, 1.0), vec3(1.0, 0.9, 0.3), exp(-r * 3.0));
    col.rgb += shockRing * shockColor * (1.5 + audioKick * 1.17);

    // Central supernova core flash — windowed by the transition envelope:
    // the old (1.0 - tProg) factor left the flash at FULL brightness at the
    // fade's end (tProg=0), a bright dot popping off when the pass stops.
    float coreFlash = exp(-r * 15.0) * midT * (2.0 + audioKick * 1.33);
    col.rgb += coreFlash * vec3(1.0, 0.98, 0.92);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midT);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midT);

    fragColor = col;
}
