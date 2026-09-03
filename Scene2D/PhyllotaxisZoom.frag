#version 330 core
out vec4 fragColor;
/**
 * @file PhyllotaxisZoom.frag
 * @brief PHYLLOTAXIS ZOOM: a sunflower spiral that never ends in either
 * direction.  Seed n sits at log-radius b*n and angle n*golden angle, so the
 * pattern maps onto itself under "one seed inward" (shrink by e^b, turn by
 * the golden angle): the zoom is periodic in that step and seamless, the
 * seeds grow with their radius as in the real flower, and the centre is
 * not a centre but another infinity.  Each seed carries a pitch class: the
 * twelve chroma classes tile the spiral, so a chord lights whole parastichy
 * arms at once.
 *
 * Audio Reactivity:
 *   audioChroma[12]  -> which seeds glow (n mod 12 = pitch class)
 *   audioMelodyPitch -> detunes the golden angle a hair: the arms tilt
 *   audioBeat        -> seeds swell (envelope, continuous)
 *   audioKick        -> a light pulse from the centre
 *   sceneAdvance     -> the zoom (music-paced, periodic, seamless)
 *
 * Per-activation variety: zoomP (zoom rate), tiltP (chirality), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioChroma[12];
uniform float audioMelodyPitch;
uniform float audioBeat;
uniform float audioKick;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioValence;

uniform float zoomP;
uniform float tiltP;
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

float wrapAngle(float a) { return a - 6.2831853 * floor(a / 6.2831853 + 0.5); }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    const float B = 0.0105;                       // log-radius per seed
    float chir = (tiltP > 0.5) ? 1.0 : -1.0;
    // Golden angle, detuned by the melody -- tiny, continuous, the arms tilt.
    float G = chir * (2.39996323 + 0.0035 * (clamp(audioMelodyPitch, 0.0, 1.0) - 0.5));
    float hue = (hueP > 0.001) ? hueP : 0.0;

    // The zoom: pattern flows outward.  Periodic in one seed step, and the
    // wrap is an exact symmetry of the pattern, so it cannot be seen.
    float zoom = sceneAdvance * 0.16 * (zoomP > 0.05 ? zoomP : 1.0) + sceneTime * 0.02;
    float m    = floor(zoom / B);
    float rho  = log(length(p) + 1e-5) - (zoom - m * B);
    float th   = atan(p.y, p.x) - m * G;

    // Nearest seeds: candidates around n0 = rho / B; only the ones whose
    // angle happens to fall near ours matter, the loop finds them.
    float n0 = rho / B;
    float best = 1e9, bestN = 0.0;
    for (int j = -16; j <= 16; ++j)
    {
        float n  = floor(n0) + float(j);
        float dr = rho - B * n;
        float da = wrapAngle(th - n * G);
        float d2 = dr * dr + da * da;
        if (d2 < best) { best = d2; bestN = n; }
    }
    float d = sqrt(best);

    // Seed disc in log-polar space: the same size for every seed there,
    // so on screen it grows with the radius.  The beat swells them.
    float rad = 0.09 * (1.0 + 0.18 * audioBeat);
    float disc = smoothstep(rad, rad * 0.78, d);
    float rim  = smoothstep(rad * 0.78, rad * 0.55, d);

    // Colour: pitch class of the seed decides how bright it glows; the
    // palette walks along a 21-parastichy so neighbouring arms differ.
    float pc = mod(bestN, 12.0);
    if (pc < 0.0) pc += 12.0;
    float e  = clamp(audioChroma[int(pc)], 0.0, 1.0);
    vec3 seedCol = imgPalette(hue * 0.159 + fract(bestN / 21.0));
    vec3 col = seedCol * disc * (0.55 + 1.4 * e + 0.3 * audioLevel);
    col += seedCol * rim * (0.3 + 0.5 * e);
    // Gaps between seeds: a faint version of the photo so the field is never
    // black.
    float r = length(p);
    col += img(fract(vec2(rho * 0.35, th * 0.159))) * 0.12 * (1.0 - disc);

    // Kick: light from the centre.  The very centre is aliased seed-dust, so
    // it dims softly.
    col *= 1.0 + 0.4 * audioKick * exp(-r * 4.0);
    col *= smoothstep(0.0, 0.05, r);
    col *= 0.85 + 0.35 * audioSwell;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
