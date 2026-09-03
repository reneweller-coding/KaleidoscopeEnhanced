#version 330 core
out vec4 fragColor;
/**
 * @file StereoKaleidoscope.frag
 * @brief STEREO KALEIDOSCOPE: the first kaleidoscope that hears in stereo.
 * The left half of the picture is folded from the left channel's energy, the
 * right half from the right's -- fold count, rotation and zoom differ per
 * side by exactly the stereo difference of the mix.  A mono track gives one
 * symmetric ornament; a wide mix pulls the two halves apart and they meet in
 * a seam down the middle that shimmers with the stereo width.  A hard-panned
 * synth line visibly lives on one side.
 *
 * Audio Reactivity:
 *   audioStereoL / R -> per-side fold rotation and zoom (the whole point)
 *   audioStereo      -> width of the seam and how far the halves diverge
 *   audioBeat        -> a decaying push on both halves' rotation (continuous)
 *   sceneAdvance     -> slow continuous turn (no jumps, no run-away)
 *
 * Per-activation variety: sidesP (base fold count 5..9), zoomP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioBeat;
uniform float audioKick;
uniform float audioLevel;
uniform float audioStereo;
uniform float audioStereoL;
uniform float audioStereoR;
uniform float audioMelodyPitch;
uniform float audioChromaHue;
uniform float audioValence;
uniform float audioSwell;

uniform float sidesP;
uniform float zoomP;
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

// Fold a point into one sector of an n-way mirror.
vec2 fold(vec2 p, float n, float rot)
{
    float a = atan(p.y, p.x) + rot;
    float sector = 6.2831853 / n;
    a = mod(a, sector);
    a = abs(a - sector * 0.5);           // mirror inside the sector
    return length(p) * vec2(cos(a), sin(a));
}

vec3 side(vec2 p, float energy, float sign)
{
    // Fold count is fixed per activation: changing it live would be a jump.
    float n    = floor((sidesP > 1.5 ? sidesP : 7.0) + 0.5);
    float zoom = (zoomP > 0.05 ? zoomP : 1.0) * (1.0 + 0.35 * energy);
    // Each side turns with its own channel; the beat adds a DECAYING push
    // (audioBeat is an envelope), never a step -- a fold that snaps on the
    // beat is a cut, not motion.
    float rot  = sign * (sceneAdvance * 0.25 + energy * 1.2) + audioBeat * 0.35;
    vec2 q = fold(p, n, rot) * zoom;
    // Sample the photo in a radial-log space so the fold zooms endlessly
    // without ever leaving the picture.
    float lr = log(length(q) + 0.35) * 0.8 + sceneAdvance * 0.05;
    float an = atan(q.y, q.x) * 0.15915494;
    vec2 uv = vec2(fract(an * 3.0 + lr * 0.3), fract(lr));
    vec3 c = img(uv);
    // Tint by side: left cooler, right warmer, both from the palette.
    vec3 tint = imgPalette((hueP > 0.001 ? hueP : 0.0) * 0.159 + 0.5 + 0.18 * sign);
    return mix(c, c * tint * 1.7, 0.45) * (0.75 + 0.9 * energy);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float eL = clamp(audioStereoL, 0.0, 1.5);
    float eR = clamp(audioStereoR, 0.0, 1.5);
    float width = clamp(audioStereo, 0.0, 1.0);

    // The two halves diverge with the stereo width: the fold centres move
    // apart, so a wide mix literally opens the picture.
    float sep = 0.12 + 0.35 * width;
    vec3 left  = side(p + vec2(sep, 0.0), eL, -1.0);
    vec3 right = side(p - vec2(sep, 0.0), eR,  1.0);

    // Seam down the middle, shimmering with the width; a mono track has
    // almost no seam and the halves read as one ornament.
    float seamW = 0.02 + 0.10 * width;
    float mixLR = smoothstep(-seamW, seamW, p.x);
    vec3 col = mix(left, right, mixLR);
    float seam = exp(-abs(p.x) / max(seamW, 1e-3) * 2.0) * width;
    col += imgPalette((hueP > 0.001 ? hueP : 0.0) * 0.159 + 0.85) * seam * (0.4 + 0.8 * audioLevel);

    // Kick: a radial pulse from the centre.
    col *= 1.0 + 0.25 * audioKick * exp(-length(p) * 3.0);
    col *= 0.85 + 0.35 * audioSwell;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
