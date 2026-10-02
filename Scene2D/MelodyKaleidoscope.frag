#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file MelodyKaleidoscope.frag
 * @brief MELODY KALEIDOSCOPE: the mirrored motif is the melody itself.  The
 * last eight seconds of pitch (audioMelody, 96 samples at 80 ms) are drawn
 * as a glowing contour -- age along the wedge, pitch across it -- and folded
 * n-way, so every phrase becomes an ornament that ages outward through the
 * mirror.  The contour is thick where the melody was loud and thin where it
 * was quiet, and the photo shows through it as the light behind stained
 * glass.  Fold count fixed, rotation on the scene clock; the only thing
 * that changes fast is what was sung.
 *
 * Audio Reactivity:
 *   audioMelody[96] / audioMelodyHead -> the contour (the point)
 *   audioMelodyPitch -> colour of the newest segment (light)
 *   sceneAdvance     -> rotation (continuous)
 *   audioKick        -> the centre flashes (light)
 *   audioLevel       -> brightness
 *
 * Per-activation variety: sidesP (fold count), widthP (contour width), hueP.
 */
uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioMelody[96];
uniform float audioMelodyHead;
uniform float audioMelodyPitch;   ///< Pitch of the melody, 0..1 over the tracked range.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float sidesP;
uniform float widthP;   ///< Width knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/// Melody sample k steps into the past (0 = newest).
float melodyAgo(int k)
{
    int head = int(audioMelodyHead * 96.0 + 0.5);
    int i = int(mod(float(head - 1 - k + 192), 96.0));
    return audioMelody[i];
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float n   = floor((sidesP > 1.5 ? sidesP : 6.0) + 0.5);
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float w   = 0.03 + 0.04 * clamp(widthP, 0.0, 1.0);

    float r = length(p);
    float a = atan(p.y, p.x) + sceneAdvance * 0.1;
    float sector = 6.2831853 / n;
    float loc = mod(a, sector);
    float mir = abs(loc - sector * 0.5) / (sector * 0.5);   // 0 (seam) .. 1 (wedge centre)

    // The contour: age runs outward (centre = now), pitch runs across the
    // wedge.  The contour's distance is measured against the sampled pitch
    // at this age, interpolated between neighbours.
    float age = clamp(r / 0.9, 0.0, 0.999) * 95.0;
    int k0 = int(age);
    float f = age - float(k0);
    float m0 = melodyAgo(k0), m1 = melodyAgo(min(k0 + 1, 95));
    float pitch = mix(m0, m1, f);
    float across = mir;                                       // pitch axis
    float d = abs(across - clamp(pitch, 0.0, 1.0));
    float contour = exp(-d * d / (w * w));
    float halo = exp(-d * 8.0) * 0.35;

    // Colour by age and by the newest pitch; photo as the light behind.
    vec3 lineCol = imgPalette(hue * 0.159 + 0.1 + 0.4 * (age / 95.0));
    vec3 newCol  = imgPalette(hue * 0.159 + 0.6 + 0.3 * clamp(audioMelodyPitch, 0.0, 1.0));
    lineCol = mix(newCol, lineCol, smoothstep(0.0, 8.0, age));
    vec2 uv = fract(vec2(mir * 0.6 + sceneAdvance * 0.01, r * 0.5));
    vec3 glass = img(uv) * lineCol * 1.6;
    vec3 col = glass * contour * (0.8 + 0.6 * audioLevel) + lineCol * halo;
    // The dark field between: a dim photo so the ornament has a ground.
    col += img(fract(uv + 0.5)) * imgPalette(hue * 0.159 + 0.6) * 0.12;
    // Seams and centre.
    float seam = exp(-min(loc, sector - loc) * 50.0) * 0.2;
    col += imgPalette(hue * 0.159 + 0.9) * seam;
    col += newCol * exp(-r * 10.0) * (0.5 + 1.5 * audioKick);
    col *= 0.85 + 0.35 * audioSwell;
    col *= 1.0 - 0.5 * smoothstep(0.85, 1.15, r);

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
