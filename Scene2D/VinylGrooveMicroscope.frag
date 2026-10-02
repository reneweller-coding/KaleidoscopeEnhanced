#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file VinylGrooveMicroscope.frag
 * @brief VINYL GROOVE MICROSCOPE: the record under a microscope -- the
 * groove walls carved by the waveform (audioWave shapes the wall), the
 * stylus riding in the groove, the groove scrolling past on the scene
 * clock, dust as round motes, the vinyl's black sheen carrying the photo
 * as a rainbow of diffraction.  The kick is a crackle flash, the treble
 * the wall glints, the bass widens the modulation (slow).  Camera fixed
 * over the stylus.
 *
 * Audio Reactivity:
 *   audioWave[64] -> the groove wall shape (light-sized, scrolling)
 *   sceneAdvance  -> the groove scrolls (continuous)
 *   audioKick     -> crackle flash (light)
 *   audioHigh     -> wall glints (light)
 *   audioBass     -> modulation depth (slow)
 *   audioLevel    -> brightness
 *
 * Per-activation variety: pitchP (groove spacing), dustP, hueP.
 */
uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioWave[64];
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float pitchP;   ///< Pitch knob, 0..1.
uniform float dustP;
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

/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

/// The wall modulation at groove position s (scroll coordinate): the
/// waveform sampled by position, so the shape is fixed in the vinyl and
/// scrolls past, plus a slow bass-widened swell.
float wall(float s, float depth)
{
    float f = fract(s * 0.02) * 63.0;
    int i0 = int(floor(f)); int i1 = min(i0 + 1, 63);
    float w = mix(audioWave[i0], audioWave[i1], fract(f));
    return w * depth;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float pitch = 0.22 + 0.1 * clamp(pitchP, 0.0, 1.0);              // groove spacing
    float dust = 0.3 + 0.7 * clamp(dustP, 0.0, 1.0);
    float depth = 0.03 + 0.05 * clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float scroll = sceneAdvance * 1.5 + sceneTime * 0.3;
    // Grooves run diagonally across the field (a curved arc of the record
    // seen at high magnification looks straight); coordinate along = s,
    // across = t.
    vec2 dir = normalize(vec2(1.0, 0.25));
    vec2 nrm = vec2(-dir.y, dir.x);
    float s = dot(p, dir) * 10.0 + scroll;
    float t = dot(p, nrm);
    // Groove index and position across the land/groove period.
    float gi = floor(t / pitch);
    float gt = fract(t / pitch) - 0.5;                                // -0.5 .. 0.5 across a period
    float mod_ = wall(s + gi * 37.0, depth) / pitch;                  // wall offset in period units
    float grooveHalf = 0.22;
    float dWall = abs(gt - mod_) - grooveHalf;                        // <0 inside the groove
    // Vinyl surface: black with a diffraction rainbow (the photo bands),
    // the groove darker with lit walls.
    vec3 vinyl = vec3(0.1, 0.1, 0.12);
    float rainbowT = fract(t * 0.6 + s * 0.02);
    vec3 rainbow = img(vec2(fract(s * 0.01), rainbowT)) * mix(vec3(0.6, 0.7, 1.0), imgPalette(hue * 0.159 + 0.5), 0.4);
    vec3 land = vinyl + rainbow * 0.45 * pow(0.5 + 0.5 * sin(t * 40.0 + s * 0.3), 6.0);
    vec3 grooveFloor = vinyl * 0.6;
    float inGroove = smoothstep(0.02, -0.02, dWall);
    float wallEdge = smoothstep(0.03, 0.0, abs(dWall));
    vec3 col = mix(land, grooveFloor, inGroove);
    // The walls catch the light: a bright rim on one side (the microscope lamp), glinting on the treble.
    float side = step(0.0, gt - mod_);
    col += vec3(0.7, 0.75, 0.85) * wallEdge * (0.4 + 0.6 * side) * (0.7 + 0.9 * hi);
    // Micro-texture along the walls: the waveform as faint ridges.
    col += vec3(0.3) * inGroove * pow(0.5 + 0.5 * sin(s * 3.0), 8.0) * 0.4;
    // The stylus: a dark diamond tip in the centre groove, its shank rising to the top right.
    vec2 tip = vec2(0.0, 0.0);
    vec2 sq = p - tip;
    float diamond = smoothstep(0.0, -0.005, abs(sq.x) * 1.4 + abs(sq.y) - 0.045);
    float shank = smoothstep(0.02, 0.014, abs(dot(sq, vec2(0.6, -0.8)))) * step(0.0, sq.y) * step(sq.y, 0.5) * step(0.0, sq.x);
    col = mix(col, vec3(0.25, 0.25, 0.3) * (0.6 + 0.4 * sq.y), max(diamond, shank));
    col += vec3(1.0) * pow(max(1.0 - length(sq - vec2(0.01, 0.02)) * 40.0, 0.0), 2.0) * 0.5;
    // Dust: round motes on the surface and drifting, crackle flash on the kick.
    vec2 gu = p * 40.0; vec2 gc = floor(gu); vec2 gf = fract(gu) - 0.5;
    vec2 go = vec2(hash21(gc + 1.3), hash21(gc + 5.9)) - 0.5;
    float mote = smoothstep(0.2, 0.08, length(gf - go * 0.6)) * step(1.0 - 0.06 * dust, hash21(gc));
    col = mix(col, vec3(0.7, 0.68, 0.6), mote * 0.8);
    col += vec3(1.0, 0.95, 0.9) * mote * audioKick * 1.5 * step(0.8, hash21(gc + 9.9));
    // The microscope field: a circular vignette.
    col *= smoothstep(0.75, 0.45, length(p * vec2(0.8, 1.0)));
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
