#version 330 core
out vec4 fragColor;
/**
 * @file LaserHarpBeams.frag
 * @brief LASER HARP BEAMS: twelve vertical laser beams standing in haze,
 * one per chroma class.  A beam brightens when its class sounds; a hand
 * crosses the row on the scene clock and every beam it interrupts blooms
 * at the point of contact and throws a splash of scattered light.  The
 * frame is the emitter bar below and the mirror strip above.  The photo
 * is the hall behind the haze.  Camera fixed in front of the harp.
 *
 * Audio Reactivity:
 *   audioChroma[12] -> beam brightness, one class each (light)
 *   sceneAdvance    -> the hand crosses, haze drifts (continuous)
 *   audioSwell      -> haze density (slow)
 *   audioHigh       -> scatter sparkle (light)
 *   audioKick       -> the emitter bar pulses (light, local)
 *
 * Per-activation variety: spreadP, hazeP, hueP.
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
uniform float audioHigh;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float spreadP;
uniform float hazeP;
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
    float spread = 0.6 + 0.35 * clamp(spreadP, 0.0, 1.0);
    float haze = (0.4 + 0.7 * clamp(hazeP, 0.0, 1.0)) * (0.5 + 0.7 * clamp(audioSwell, 0.0, 1.0));
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.45 + sceneTime * 0.09;

    float baseY = -0.36, topY = 0.4;
    // The hall behind: the photo, dark, with the haze veiling it.
    vec3 col = img(uv) * mix(vec3(0.14), imgPalette(hue * 0.159 + 0.62) * 0.3, 0.5);
    col *= 0.4 + 0.35 * haze;
    // Haze body: a soft drifting fog that the beams will light.
    float fog = 0.55 + 0.45 * noise2(p * 2.6 + vec2(clock * 0.2, clock * 0.06));
    // The hand: crosses the row steadily, a round palm with three fingers.
    float handX = (0.5 + 0.42 * sin(clock * 0.33)) * aspect - aspect * 0.5;
    float handY = -0.02 + 0.05 * sin(clock * 0.7);
    vec2 hand = vec2(handX, handY);

    // The beams.
    for (int i = 0; i < 12; ++i)
    {
        float fi = float(i);
        float bx = ((fi + 0.5) / 12.0 - 0.5) * aspect * 2.0 * spread;
        float e = clamp(audioChroma[i] * 1.6, 0.0, 1.0);
        vec3 bc = imgPalette(hue * 0.159 + fi / 12.0) * 1.6 + 0.18;
        float dx = abs(p.x - bx);
        float within = step(baseY, p.y) * step(p.y, topY);
        // Is this beam interrupted, and where?  A smooth window, so a beam
        // never switches on or off between frames.
        float touch = smoothstep(0.075, 0.02, abs(hand.x - bx));
        float cutY = hand.y;
        // Above the cut the beam is dark while the hand blocks it.
        float blocked = touch * smoothstep(cutY - 0.02, cutY + 0.02, p.y);
        float alive = 1.0 - 0.85 * blocked;
        // The beam: a thin core and a wider glow in the haze.
        float core = smoothstep(0.006, 0.0015, dx) * within * alive;
        float glow = exp(-dx * 26.0) * within * alive * fog * haze;
        col += bc * core * (0.35 + 1.1 * e) * 1.4;
        col += bc * glow * (0.2 + 0.9 * e) * 0.9;
        // The contact bloom: where the hand cuts the beam, a bright blob
        // plus a splash of scattered light around it.
        vec2 cq = p - vec2(bx, cutY);
        float bloom = exp(-length(cq * vec2(1.0, 1.2)) * 16.0) * touch;
        col += bc * bloom * (0.6 + 1.4 * e) * 1.6;
        col += bc * exp(-length(cq) * 5.0) * touch * (0.1 + 0.5 * e) * haze * 0.6;
        // Sparkle in the scattered cone, on the treble.
        vec2 g = (cq + vec2(0.0, clock * 0.05)) * 55.0;
        vec2 c = floor(g); vec2 f = fract(g) - 0.5;
        vec2 jit = vec2(hash21(c + 1.3), hash21(c + 5.9)) - 0.5;
        float mote = smoothstep(0.2, 0.06, length(f - jit * 0.7)) * step(0.86, hash21(c));
        col += bc * mote * touch * hi * exp(-length(cq) * 7.0) * 2.0;
        // The emitter dot at the base and its reflection in the mirror strip.
        col += bc * exp(-length(p - vec2(bx, baseY)) * 40.0) * (0.3 + 0.8 * e);
        col += bc * exp(-length(p - vec2(bx, topY)) * 46.0) * (0.15 + 0.5 * e);
    }
    // The emitter bar and the mirror strip: two dark rails the beams end on.
    float bar = smoothstep(0.035, 0.025, abs(p.y - baseY + 0.02));
    float mirror = smoothstep(0.02, 0.014, abs(p.y - topY - 0.015));
    vec3 metal = mix(vec3(0.12, 0.12, 0.14), imgPalette(hue * 0.159 + 0.05) * 0.3, 0.4);
    col = mix(col, metal, bar);
    col = mix(col, metal * 1.3, mirror);
    // The kick pulses the bar's own indicator LEDs, locally.
    float leds = smoothstep(0.008, 0.0, abs(fract(p.x * 14.0) - 0.5) - 0.47) * bar;
    col += mix(vec3(1.0, 0.4, 0.2), imgPalette(hue * 0.159 + 0.2), 0.4) * leds * (0.2 + 1.0 * audioKick);
    // The hand: a dark silhouette with a lit rim where beams graze it.
    float palm = length((p - hand) * vec2(1.0, 1.3)) - 0.055;
    float fingers = 1e9;
    for (int k = -1; k <= 1; ++k)
        fingers = min(fingers, length((p - hand - vec2(float(k) * 0.032, 0.075)) * vec2(2.4, 1.0)) - 0.03);
    float handD = min(palm, fingers);
    float inHand = smoothstep(0.006, -0.006, handD);
    col = mix(col, vec3(0.04, 0.04, 0.05), inHand);
    col += vec3(0.9, 0.95, 1.0) * smoothstep(0.012, 0.0, abs(handD)) * (0.15 + 0.5 * hi);
    col *= 0.85 + 0.3 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
