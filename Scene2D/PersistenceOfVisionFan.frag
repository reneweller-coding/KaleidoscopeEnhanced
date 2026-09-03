#version 330 core
out vec4 fragColor;
/**
 * @file PersistenceOfVisionFan.frag
 * @brief PERSISTENCE-OF-VISION FAN: a picture that exists only in the
 * afterimage.  A few spokes turn about the centre; each frame they paint
 * the photo's colour along their length, and the previous frame
 * (texPrevFrame) is kept with a decay -- so the photo appears as the sum of
 * many sweeps, like the LED fans that draw pictures in the air, and fades
 * where the spokes have not passed for a while.  The spokes turn on the
 * music's pace; the spectrum decides how bright each radius is painted,
 * so the picture is an analyser of its own.  Feedback converges: decay
 * plus a soft knee before re-injection.
 *
 * Audio Reactivity:
 *   texPrevFrame      -> the afterimage (the whole point)
 *   sceneAdvance      -> spoke rotation (music-paced, continuous)
 *   audioSpectrum[32] -> paint brightness by radius (light)
 *   audioKick         -> the hub flashes (light)
 *   audioSwell        -> afterimage persistence (slow)
 *
 * Per-activation variety: spokesP (spoke count), speedP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D texPrevFrame;   // last frame's fully composited image (unit 34)
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float spokesP;
uniform float speedP;
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

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    float aspect = resolution.x / resolution.y;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float spokes = floor((spokesP > 1.5 ? spokesP : 3.0) + 0.5);
    float hue = (hueP > 0.001) ? hueP : 0.0;

    float r = length(p);
    float a = atan(p.y, p.x);
    float rot = sceneAdvance * 2.6 * (speedP > 0.05 ? speedP : 1.0) + sceneTime * 0.5;

    // Spokes: thin wedges at rot + k * 2pi/spokes.  Angular width in radians
    // shrinks with radius so the painted line has constant thickness.
    float sector = 6.2831853 / spokes;
    float rel = mod(a - rot, sector);
    float dAng = min(rel, sector - rel);
    float lineW = 0.012 / max(r, 0.05);
    float onSpoke = 1.0 - smoothstep(lineW * 0.5, lineW, dAng);

    // What the spoke paints: the photo at this pixel, weighted by the
    // spectrum band of this radius.
    float u = clamp(r / 0.95, 0.0, 0.9999);
    float e = clamp(audioSpectrum[int(u * 32.0)] * 1.8, 0.0, 1.0);
    vec3 paint = img(uv) * (0.35 + 1.3 * e) + imgPalette(hue * 0.159 + u * 0.6) * 0.25 * e;
    // Tip sparkle.
    paint += imgPalette(hue * 0.159 + 0.9) * exp(-abs(r - 0.9) * 40.0) * 0.6;

    // The afterimage: decay the previous frame, soft-knee it so the sum
    // converges, then add the fresh paint on the spokes.
    vec3 prev = texture(texPrevFrame, uv).rgb;
    float decay = 0.98 + 0.012 * clamp(audioSwell, 0.0, 1.0);   // ~1 s of persistence: the picture builds up without saturating
    prev *= decay;
    prev /= 1.0 + 0.06 * max(prev.r, max(prev.g, prev.b));
    // Everything that is NOT the afterimage goes into `fresh`; the previous
    // frame is never multiplied by anything but the decay (a global
    // brightness factor inside the loop shortened the persistence to a few
    // frames and the picture never built up).
    vec3 fresh = paint * onSpoke * 0.9 * (0.9 + 0.2 * audioLevel);
    fresh += imgPalette(hue * 0.159 + 0.95) * exp(-r * 25.0) * (0.5 + 1.5 * audioKick);
    fresh *= 1.0 - 0.5 * smoothstep(0.92, 1.1, r);
    vec3 col = prev + fresh;

    // Soft knee ABOVE 1 only: the feedback must stay linear below it, or the
    // tone map eats the afterimage a little more every frame.
    vec3 _catTone = max(col, 0.0);
    float _mx = max(_catTone.r, max(_catTone.g, _catTone.b));
    _catTone /= 1.0 + 0.35 * max(_mx - 1.0, 0.0);
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
