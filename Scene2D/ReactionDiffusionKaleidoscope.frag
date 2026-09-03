#version 330 core
out vec4 fragColor;
/**
 * @file ReactionDiffusionKaleidoscope.frag
 * @brief REACTION-DIFFUSION KALEIDOSCOPE: the living Gray-Scott field
 * (texSim: R = A, G = B) folded through an n-way mirror.  The chemistry
 * never repeats, the mirror makes it ornament: spots become rosettes,
 * worms become interlocking rings, and every fold seam is a line of
 * symmetry the pattern grows across.  Spectral change "cooks" the field --
 * a new layer entering the mix reads as the pattern boiling over.
 *
 * Audio Reactivity:
 *   texSim         -> the motif
 *   audioFlux      -> how hard the field is contrasted (boiling)
 *   audioBeat      -> body brightness (light only, V7d)
 *   audioSwell     -> zoom into the field on builds (slow)
 *   sceneAdvance   -> mirror rotation, continuous
 *   audioKick      -> a light pulse from the centre
 *
 * Per-activation variety: sidesP (fold count 4..10), zoomP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D texSim;        // reaction-diffusion state (R = A, G = B), unit 7
uniform float interpolation;

uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioBeat;   // decaying envelope, safe as a rate/zoom, never as a step
uniform float audioKick;
uniform float audioFlux;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioMelodyPitch;
uniform float audioChromaHue;
uniform float audioValence;

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

vec2 fold(vec2 p, float n, float rot)
{
    float a = atan(p.y, p.x) + rot;
    float sector = 6.2831853 / n;
    a = mod(a, sector);
    a = abs(a - sector * 0.5);
    return length(p) * vec2(cos(a), sin(a));
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    // Fold count fixed per activation (a live change is a jump); the beat
    // breathes the zoom instead -- an envelope, continuous.
    float n    = floor((sidesP > 1.5 ? sidesP : 6.0) + 0.5);
    float zoom = (zoomP > 0.05 ? zoomP : 1.0) * mix(1.2, 0.8, clamp(audioSwell, 0.0, 1.0));   // zoom on the slow swell only (V7d)
    float hue  = (hueP > 0.001) ? hueP : 0.0;

    vec2 q = fold(p, n, sceneAdvance * 0.2);
    // Map the sector into the field; the field wraps, so the zoom is endless.
    vec2 suv = q * zoom * 0.9 + vec2(0.5) + sceneAdvance * 0.01;

    // B concentration with a little edge detection: the worms get outlines.
    vec2 px = 1.0 / vec2(512.0);
    float b  = texture(texSim, suv).g;
    float bx = texture(texSim, suv + vec2(px.x * 2.0, 0.0)).g - texture(texSim, suv - vec2(px.x * 2.0, 0.0)).g;
    float by = texture(texSim, suv + vec2(0.0, px.y * 2.0)).g - texture(texSim, suv - vec2(0.0, px.y * 2.0)).g;
    float edge = length(vec2(bx, by)) * 4.0;
    float a = texture(texSim, suv).r;

    // Boiling: spectral change contrasts the field harder.
    float boil = 0.8 + 2.2 * clamp(audioFlux * 4.0, 0.0, 1.0);
    float body = smoothstep(0.12, 0.45, b * boil);

    // Colour: body from one palette position, membrane (edge) from another,
    // the A-substrate as a dim wash behind.
    vec3 bodyCol = imgPalette(hue * 0.159 + 0.15 + 0.2 * b);
    vec3 edgeCol = imgPalette(hue * 0.159 + 0.65) * 1.5;
    vec3 wash    = imgPalette(hue * 0.159 + 0.4) * 0.12 * a;
    vec3 col = wash + bodyCol * body * (0.7 + 0.5 * audioLevel + 0.3 * audioBeat) + edgeCol * edge * 0.8;

    // Fold seams glow faintly so the symmetry reads even in a quiet field.
    float sector = 6.2831853 / n;
    float ang = mod(atan(p.y, p.x) + sceneAdvance * 0.2, sector);
    float seam = exp(-min(ang, sector - ang) * 40.0) * 0.15;
    col += imgPalette(hue * 0.159 + 0.9) * seam;

    // Kick: a pulse of light from the centre; swell lifts everything.
    col *= 1.0 + 0.35 * audioKick * exp(-length(p) * 2.5);
    col *= 0.85 + 0.4 * audioSwell;
    // Vignette so the fold centre is the subject.
    col *= 1.0 - 0.45 * smoothstep(0.45, 1.0, length(p));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
