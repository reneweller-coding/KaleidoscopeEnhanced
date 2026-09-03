#version 330 core
out vec4 fragColor;
/**
 * @file DoubleSlitElectronBuildup.frag
 * @brief DOUBLE SLIT ELECTRON BUILD-UP: the experiment that shows one
 * particle at a time still interferes.  A phosphor screen fills the frame;
 * single electrons arrive as round dots, each at a place drawn from the
 * interference probability, and over the scene arc the dots accumulate
 * into the fringe pattern.  The fringe spacing follows the tonal centre
 * (slowly), a fresh arrival flashes on an onset, the electron gun at the
 * bottom hums with the bass.  Nothing moves but light; camera still.
 *
 * Audio Reactivity:
 *   sceneProgress  -> accumulation (the arc)
 *   audioChromaHue -> fringe spacing (slow)
 *   audioOnset     -> the newest arrivals flash (light)
 *   audioBass      -> gun glow (light)
 *   audioLevel     -> brightness
 *
 * Per-activation variety: slitP (slit separation), grainP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float sceneProgress;
uniform float audioAdvance;
uniform float audioOnset;
uniform float audioBass;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float slitP;
uniform float grainP;
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

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float sep = 0.6 + 0.6 * clamp(slitP, 0.0, 1.0);
    float grain = 26.0 + 22.0 * clamp(grainP, 0.0, 1.0);
    float prog = clamp(sceneProgress, 0.0, 1.0);
    // Fringe spacing from the tonal centre (circular-slewed, so slow).
    float k = 18.0 + 10.0 * (0.5 + 0.5 * sin(audioChromaHue));
    float onset = clamp(audioOnset, 0.0, 1.0);

    // The probability on the screen: two-slit interference under the
    // single-slit envelope, along x; slightly curved fringes for realism.
    float x = p.x + 0.02 * p.y * p.y;
    float fringe = pow(cos(x * k * sep), 2.0);
    float env = pow(max(sin(x * 6.0 + 1e-3) / (x * 6.0 + 1e-3), 0.0), 2.0);
    env = mix(env, 1.0, 0.25);
    float prob = fringe * env * smoothstep(0.5, 0.35, abs(p.y));

    // The screen: dark phosphor with the photo faint (the apparatus behind).
    vec3 col = img(gl_FragCoord.xy / resolution) * imgPalette(hue * 0.159 + 0.6) * 0.06;
    col += vec3(0.04, 0.05, 0.045);
    // Electrons: hashed round dots; each cell has its own arrival time in
    // the arc, drawn so that dense fringes fill first.
    vec3 phosphor = mix(vec3(0.4, 1.0, 0.6), imgPalette(hue * 0.159 + 0.35), 0.35);
    for (int layer = 0; layer < 2; ++layer)
    {
        vec2 gu = p * grain * (1.0 + 0.37 * float(layer)) + float(layer) * 11.0;
        vec2 cell = floor(gu); vec2 f = fract(gu) - 0.5;
        vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
        vec2 cp = (cell + 0.5 + off * 0.6) / (grain * (1.0 + 0.37 * float(layer)));
        float px = cp.x + 0.02 * cp.y * cp.y;
        float pr = pow(cos(px * k * sep), 2.0) * mix(pow(max(sin(px * 6.0 + 1e-3) / (px * 6.0 + 1e-3), 0.0), 2.0), 1.0, 0.25) * smoothstep(0.5, 0.35, abs(cp.y));
        // Arrival: the cell's threshold vs. the probability times the arc.
        float h = hash21(cell + 1.9);
        float arrival = pr * (0.15 + prog * 1.6);
        float present = smoothstep(h - 0.03, h + 0.03, arrival);
        float fresh = 1.0 - smoothstep(0.0, 0.08, arrival - h);      // just arrived
        float d = length(f - off * 0.6);
        float dot_ = smoothstep(0.34, 0.14, d);
        col += phosphor * dot_ * present * (1.2 + 0.8 * fresh * onset + 0.5 * fresh);
    }
    // The faint expected pattern glows underneath as the arc completes.
    col += phosphor * prob * 0.25 * (0.3 + prog);
    // The electron gun and the slits, as a diagram at the bottom.
    float gun = exp(-length(p - vec2(0.0, -0.47)) * 14.0);
    col += imgPalette(hue * 0.159 + 0.1) * gun * (0.4 + 1.0 * clamp(audioBass, 0.0, 1.0));
    float slitPlate = smoothstep(0.004, 0.0, abs(p.y + 0.4)) * (1.0 - smoothstep(0.008, 0.012, abs(abs(p.x) - 0.03 * sep)));
    col += vec3(0.5) * slitPlate;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
