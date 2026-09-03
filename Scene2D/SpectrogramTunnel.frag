#version 330 core
out vec4 fragColor;
/**
 * @file SpectrogramTunnel.frag
 * @brief SPECTROGRAM TUNNEL: the tunnel IS the music.  The host's scrolling
 * spectrogram (texSpectro: 32 log-spaced bands across, ~20 s of history down,
 * a ring) is rolled into a tube -- frequency runs around the wall, bass at
 * the top and bottom, treble along the sides, mirrored so the tube is
 * symmetric -- and history runs down the tunnel.  You fly through the last
 * eight seconds of what you are hearing: every note is a bump on the wall,
 * every kick a ring that rushes past.
 *
 * The flight comes from the spectrogram sliding through the tube (spectroHead
 * is continuous), plus a slow forward drift; nothing here depends on absolute
 * time, so it holds for hours.
 *
 * Audio Reactivity:
 *   texSpectro     -> wall relief and light (the picture itself)
 *   audioMelodyPitch -> a bright travelling ring at the melody's band
 *   audioKick      -> the tube breathes outward for a beat
 *   audioSwell     -> fog thickness (loud builds close in, quiet opens up)
 *   audioBarPhase  -> gentle roll of the whole tube
 *
 * Per-activation variety: twistP (wall twist per unit depth), speedP (drift),
 *                         glowP (relief light), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D texSpectro;   // 32 bands across (x), ~20 s history down (y), ring
uniform float spectroHead;      // T coordinate of "now", continuous
uniform float spectroFill;      // 0..1 how much history exists yet
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioBarPhase;
uniform float audioMelodyPitch;
uniform float audioChromaHue;
uniform float audioValence;

uniform float twistP;
uniform float speedP;
uniform float glowP;
uniform float hueP;

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

// Spectrogram energy at band b (0..1 across the 32 bands) and age (0 = now,
// 1 = the oldest row).  The head trails the write position on purpose; we
// never sample closer than that.
float spec(float b, float age)
{
    float x = clamp(b, 0.0, 1.0) * (31.0 / 32.0) + 0.5 / 32.0;
    float y = fract(spectroHead - age);
    return texture(texSpectro, vec2(x, y)).r;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float tw  = (twistP > 0.001) ? twistP : 0.6;
    float spd = (speedP > 0.01) ? speedP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;
    float hue = (hueP > 0.001) ? hueP : 0.0;

    // Gentle roll of the whole tube with the bar; the kick breathes it.
    float roll = sceneAdvance * 0.08;              // a slow steady roll, no bar sway (V7d)
    float ca = cos(roll), sa = sin(roll);
    p = vec2(ca * p.x - sa * p.y, sa * p.x + ca * p.y);
    float r = length(p);
    float theta = atan(p.y, p.x);                    // -pi..pi

    // Classic tube: depth is 1/r.  The near end (large r) is "now".
    float depth = 0.22 / max(r, 0.02);               // 0.2 .. ~11
    // Frequency runs AROUND the tube, mirrored: |theta|/pi is 0 at the right
    // (treble) ... no -- bass belongs on top and bottom, so measure from the
    // horizontal: 0 at the sides, 1 at top/bottom.
    float band = abs(sin(theta));                    // 0 sides .. 1 top/bottom
    band = 1.0 - band;                               // treble sides, bass top/bottom
    // Twist the wall along the depth so the bands spiral.
    float twist = tw * depth * 0.08 + sceneAdvance * 0.05;
    band = fract(band * 0.5 + twist * 0.15) * 2.0;
    band = band > 1.0 ? 2.0 - band : band;           // keep the mirror

    // History along the tunnel: eight seconds of the ~20-second ring, with a
    // slow forward drift on top of the spectrogram's own sliding.
    float age = depth * 0.045 * spd + sceneAdvance * 0.01;
    float e   = spec(band, age);
    float e2  = spec(band, age + 0.01);
    float eNear = spec(band, max(age - 0.01, 0.0));
    e = clamp(e * 1.4, 0.0, 1.0) * min(spectroFill * 4.0, 1.0);

    // Relief: a note is a bump.  Bumps catch light from the tunnel axis.
    float relief = (e2 - eNear) * 6.0;               // slope along depth
    float lit = clamp(0.45 + 0.55 * relief, 0.0, 1.5);

    // Wall colour: the band picks the palette position, energy the brightness.
    vec3 wall = imgPalette(hue * 0.159 + band * 0.45) * (0.30 + 1.6 * e * glw) * lit;
    // Grid of faint band lines so the wall reads as a tube even in silence.
    float lines = 0.5 + 0.5 * cos(band * 32.0 * 3.14159265);
    wall += imgPalette(hue * 0.159 + 0.5) * 0.18 * pow(lines, 6.0);

    // Melody ring: a bright ring travelling at the melody's band.
    float mb = clamp(audioMelodyPitch, 0.0, 1.0);
    float ring = exp(-abs(band - mb) * 18.0) * exp(-abs(fract(age * 6.0) - 0.5) * 6.0);
    wall += imgPalette(hue * 0.159 + 0.85) * ring * 0.8 * (0.5 + audioLevel);

    // Depth fog toward the far end (correct sign: far = fogged).
    float fog = 1.0 - exp(-depth * (0.05 + 0.08 * audioSwell));
    vec3 fogCol = imgPalette(hue * 0.159 + 0.2) * 0.08;
    vec3 col = mix(wall, fogCol, clamp(fog, 0.0, 0.80));

    // A soft core glow at the vanishing point.
    col += imgPalette(hue * 0.159 + 0.7) * 0.25 * exp(-r * 18.0) * (0.6 + 0.8 * audioLevel);

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
