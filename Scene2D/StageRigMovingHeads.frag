#version 330 core
out vec4 fragColor;
/**
 * @file StageRigMovingHeads.frag
 * @brief STAGE RIG MOVING HEADS: a truss of moving-head lamps over a hazy
 * stage.  Each lamp owns a chroma class and sweeps its beam on the scene
 * clock -- steadily, never on a beat -- and brightens when its class
 * sounds.  The beams are volumetric wedges in the haze with a gobo
 * pattern from the photo; where they land they paint a pool on the deck.
 * The kick lights the backline strip, not the whole frame.  Camera fixed
 * in the audience.
 *
 * Audio Reactivity:
 *   audioChroma[12] -> which lamps are lit and how hard (light)
 *   sceneAdvance    -> the sweep of every head (continuous)
 *   audioSwell      -> haze density (slow)
 *   audioKick       -> the backline strip (light, local)
 *   audioHigh       -> beam edge shimmer (light)
 *
 * Per-activation variety: headsP, sweepP, hueP.
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
uniform float audioSwell;
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float headsP;
uniform float sweepP;
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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float heads = 6.0 + floor(clamp(headsP, 0.0, 1.0) * 6.0);          // once per activation
    float sweep = 0.5 + 0.8 * clamp(sweepP, 0.0, 1.0);
    float haze = 0.6 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.35 + sceneTime * 0.07;

    float deck = -0.32;                                                 // stage floor line
    // The room: dark, with the photo as the back wall behind the haze.
    vec3 back = img(vec2(uv.x, 0.35 + uv.y * 0.5)) * mix(vec3(0.16), imgPalette(hue * 0.159 + 0.6) * 0.35, 0.5);
    vec3 col = back * (0.5 + 0.35 * haze) + 0.015;
    // The deck: darker, with a slight sheen and a reflection of the pools.
    float onDeck = step(p.y, deck);
    vec3 deckCol = mix(vec3(0.11, 0.11, 0.13), imgPalette(hue * 0.159 + 0.1) * 0.35, 0.4);
    col = mix(col, deckCol, onDeck);
    // The truss: a horizontal bar near the top with cross-braces.
    float trussY = 0.42;
    float bar = smoothstep(0.018, 0.012, abs(p.y - trussY)) + smoothstep(0.012, 0.008, abs(p.y - trussY - 0.06));
    float brace = smoothstep(0.008, 0.004, abs(fract((p.x + p.y) * 6.0) - 0.5) - 0.46) * step(p.y, trussY + 0.06) * step(trussY, p.y);
    col = mix(col, vec3(0.3, 0.31, 0.33) * (0.5 + 0.5 * haze), clamp(bar + brace * 0.7, 0.0, 1.0));

    // The lamps.  Each is a fixture hanging under the truss with a beam.
    for (int i = 0; i < 12; ++i)
    {
        if (float(i) >= heads) break;
        float fi = float(i);
        int cls = int(mod(fi * 5.0 + 1.0, 12.0));
        float e = clamp(audioChroma[cls] * 1.6, 0.0, 1.0);
        // Position along the truss, evenly spread.
        float hx = ((fi + 0.5) / heads - 0.5) * aspect * 1.7;
        vec2 head = vec2(hx, trussY - 0.045);
        // The pan: a steady sweep, each head at its own rate and phase.
        float rate = 0.25 + 0.22 * hash11(fi * 3.7);
        float pan = sin(clock * rate * sweep + fi * 1.7) * 0.55;
        vec2 dir = normalize(vec2(pan, -1.0));
        vec3 lc = mix(imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.5, vec3(1.0), 0.15) + 0.12;
        // Fixture body.
        float body = smoothstep(0.035, 0.026, length((p - head) * vec2(1.0, 1.35)));
        col = mix(col, vec3(0.12, 0.12, 0.14), body);
        // The beam: a cone from the head along dir, visible in the haze.
        vec2 rel = p - head;
        float along = dot(rel, dir);
        float across = length(rel - dir * along);
        float halfW = 0.012 + 0.075 * clamp(along / 0.9, 0.0, 1.0);
        float inCone = smoothstep(halfW, halfW * 0.35, across) * smoothstep(0.0, 0.06, along);
        // Haze makes the beam visible; it fades with distance from the lens.
        float fall = exp(-along * 0.9);
        // The gobo: a pattern carried across the beam, from the photo.
        float gob = 0.65 + 0.35 * img(clamp(vec2(across * 6.0 + fi * 0.13, along * 0.7), 0.0, 1.0)).r;
        float beam = inCone * fall * haze * gob;
        col += lc * beam * (0.25 + 0.95 * e) * 1.3;
        // A crisper core inside the cone, and an edge shimmer on the treble.
        col += lc * smoothstep(halfW * 0.5, 0.0, across) * fall * (0.1 + 0.5 * e) * (0.8 + 0.5 * hi);
        // The lens itself glows.
        col += lc * exp(-length(rel) * 30.0) * (0.25 + 1.1 * e);
        // The pool where the beam meets the deck.
        float hitT = (deck - head.y) / min(dir.y, -1e-3);
        vec2 hit = head + dir * hitT;
        float pool = exp(-length((p - vec2(hit.x, deck)) * vec2(1.0, 3.4)) * 6.0);
        col += lc * pool * onDeck * (0.3 + 1.0 * e) * 1.1;
        col += lc * pool * (1.0 - onDeck) * (0.05 + 0.3 * e) * 0.3;    // spill just above the deck
    }
    // Haze grain, drifting slowly so the air lives.
    col *= 0.9 + 0.2 * noise2(p * 3.0 + vec2(clock * 0.15, clock * 0.05));
    // The backline strip: a low bar of light at the back of the deck that
    // the kick lifts.  Local, so it never reads as a frame strobe.
    float strip = smoothstep(0.03, 0.0, abs(p.y - deck - 0.05)) * smoothstep(aspect * 0.55, aspect * 0.2, abs(p.x));
    col += mix(vec3(1.0, 0.6, 0.3), imgPalette(hue * 0.159 + 0.3), 0.4) * strip * (0.15 + 0.9 * audioKick);
    col *= 0.8 + 0.4 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
