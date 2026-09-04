#version 330 core
out vec4 fragColor;
/**
 * @file SlotMachineReels.frag
 * @brief SLOT MACHINE REELS: three reels behind the glass of a fruit
 * machine.  Each turns at its own steady rate for the whole activation --
 * they never snap to a stop, because a reel jerking to a halt on a beat
 * is exactly the jolt this catalogue avoids.  The symbols are cut from
 * the photo and wrap on drums with a curved face, so they compress toward
 * the top and bottom of the window.  The pay line brightens with the
 * swell and the coin tray lights on the kick.  Camera fixed on the glass.
 *
 * Audio Reactivity:
 *   sceneAdvance    -> the reels turn at their own steady rates (continuous)
 *   audioSwell      -> the pay line and the cabinet light (slow)
 *   audioChroma[12] -> the symbol tints (light)
 *   audioKick       -> the coin tray (light, local)
 *   audioHigh       -> the chrome and glass sparkle (light)
 *
 * Per-activation variety: symbolsP, speedP, hueP.
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

uniform float symbolsP;
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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

// A symbol: a simple emblem chosen by index, drawn in the cell.
float symbol(vec2 q, float idx)
{
    float k = mod(idx, 5.0);
    if (k < 1.0)                                   // a bell
        return max(smoothstep(0.3, 0.26, length(q * vec2(1.0, 1.25) - vec2(0.0, 0.03))),
                   smoothstep(0.06, 0.04, length(q - vec2(0.0, -0.26))));
    if (k < 2.0)                                   // a bar
        return smoothstep(0.02, 0.0, max(abs(q.x) - 0.3, abs(q.y) - 0.11));
    if (k < 3.0)                                   // a cherry pair
        return max(smoothstep(0.15, 0.12, length(q - vec2(-0.12, -0.1))),
                   smoothstep(0.15, 0.12, length(q - vec2(0.13, -0.14))));
    if (k < 4.0)                                   // a seven
        return max(smoothstep(0.04, 0.0, abs(q.y - 0.24) - 0.0) * step(abs(q.x), 0.22),
                   smoothstep(0.05, 0.0, abs(q.x - 0.2 + (q.y + 0.28) * 0.55)) * step(abs(q.y), 0.28));
    // a diamond
    return smoothstep(0.03, 0.0, abs(q.x) * 1.5 + abs(q.y) - 0.28);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float symbols = 6.0 + floor(clamp(symbolsP, 0.0, 1.0) * 6.0);       // symbols round a drum
    float speed = 0.5 + 0.9 * clamp(speedP, 0.0, 1.0);
    float lamp = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.8 + sceneTime * 0.16;

    // The cabinet: painted metal with the photo as its artwork.
    vec3 cab = img(uv * 0.8 + 0.1) * mix(vec3(0.45, 0.12, 0.12), imgPalette(hue * 0.159 + 0.06), 0.35);
    cab *= 0.7 + 0.4 * noise2(p * 20.0);
    vec3 col = cab * lamp * 0.85;

    // The window: three reels behind glass.
    float winH = 0.3, winHalf = aspect * 0.36;
    float win = step(abs(p.x), winHalf) * step(abs(p.y), winH);
    if (win > 0.5)
    {
        float reel = floor((p.x + winHalf) / (2.0 * winHalf) * 3.0);
        float rf = fract((p.x + winHalf) / (2.0 * winHalf) * 3.0);
        // Each reel turns at its own steady rate, fixed for the activation.
        float rate = speed * (0.9 + 0.5 * hash11(reel * 3.7 + 1.0));
        float turn = clock * rate * 0.5;
        // The drum is curved: the symbol coordinate compresses toward the
        // top and bottom of the window, as a real reel does.
        float yy = p.y / winH;                                          // -1 .. 1
        float curved = asin(clamp(yy, -1.0, 1.0)) / 1.5708;             // eased toward the edges
        // Three symbols in the window, no more: the drum coordinate is
        // scaled so a cell is a third of the window, not a fortieth.
        float s = curved * 1.5 + turn * symbols;
        float si = floor(s);
        float sf = fract(s) - 0.5;
        // The symbol face: the photo as its printed art, tinted by a class.
        int cls = int(mod(si * 3.0 + reel, 12.0));
        float e = clamp(audioChroma[cls] * 1.6, 0.0, 1.0);
        vec3 tint = imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.4 + 0.15;
        vec2 q = vec2((rf - 0.5) * 1.7, sf * 1.9);
        float sym = symbol(q * 1.15, si + reel * 2.0);
        // The reel band itself: pale, with a shadow near the edges of the
        // window because the drum curves away.
        vec3 band = vec3(0.9, 0.88, 0.84);
        band = mix(band, img(clamp(vec2(fract(si * 0.13 + reel * 0.31), rf), 0.0, 1.0)) * 1.2, 0.25);
        band *= 0.45 + 0.75 * cos(yy * 1.3);                            // the drum's shading
        vec3 face = mix(band, mix(band * 0.4, tint, 0.75) * (0.7 + 0.6 * e), sym);
        // The seam between symbols.
        face *= 0.8 + 0.3 * smoothstep(0.03, 0.12, abs(sf));
        // Motion blur: the faster the reel, the softer the symbol edges.
        face = mix(face, band, clamp(rate * 0.18, 0.0, 0.45) * sym * 0.5);
        col = mix(col, face * lamp, win);
        // The reel dividers.
        col = mix(col, vec3(0.25, 0.25, 0.28) * lamp, smoothstep(0.02, 0.006, min(rf, 1.0 - rf)) * 0.8);
    }
    // The pay line across the middle of the window.
    float payLine = smoothstep(0.006, 0.002, abs(p.y)) * step(abs(p.x), winHalf);
    vec3 payCol = mix(vec3(1.0, 0.85, 0.3), imgPalette(hue * 0.159 + 0.12), 0.3);
    col = mix(col, payCol, payLine * (0.4 + 0.6 * clamp(audioSwell, 0.0, 1.0)));
    col += payCol * exp(-abs(p.y) * 40.0) * step(abs(p.x), winHalf) * (0.1 + 0.35 * clamp(audioSwell, 0.0, 1.0));
    // The glass: a diagonal reflection and a bright frame.
    col += vec3(1.0) * smoothstep(0.4, 0.0, abs(p.x * 0.5 + p.y - 0.18)) * win * 0.07;
    float frame = smoothstep(0.016, 0.008, abs(max(abs(p.x) - winHalf, abs(p.y) - winH)));
    col = mix(col, vec3(0.78, 0.78, 0.82) * lamp, frame);
    col += vec3(1.0) * frame * hi * 0.3;
    // The light panel above with the machine's name in the photo.
    float top = step(0.36, p.y) * step(abs(p.x), winHalf + 0.05);
    vec3 topCol = img(clamp(vec2(uv.x, 0.85), 0.0, 1.0)) * mix(vec3(1.0, 0.85, 0.4), imgPalette(hue * 0.159 + 0.15), 0.35);
    col = mix(col, topCol * (0.7 + 0.8 * lamp), top * 0.9);
    // The coin tray at the bottom, lit on the kick.
    float tray = step(p.y, -0.38) * step(abs(p.x), winHalf * 0.7);
    vec3 trayCol = vec3(0.2, 0.2, 0.22);
    // Coins in it: round, jittered discs.
    vec2 cg = p * 40.0; vec2 cc = floor(cg); vec2 cf = fract(cg) - 0.5;
    vec2 cj = vec2(hash21(cc + 1.9), hash21(cc + 7.3)) - 0.5;
    float coin = smoothstep(0.32, 0.2, length(cf - cj * 0.6)) * step(0.55, hash21(cc));
    trayCol = mix(trayCol, mix(vec3(0.9, 0.75, 0.35), imgPalette(hue * 0.159 + 0.12), 0.3), coin);
    col = mix(col, trayCol * lamp * (0.7 + 1.0 * audioKick), tray);
    col += vec3(1.0, 0.9, 0.6) * tray * coin * audioKick * 0.8;
    // The handle on the right.
    float handleX = winHalf + 0.07;
    float rod = smoothstep(0.012, 0.008, abs(p.x - handleX)) * step(-0.05, p.y) * step(p.y, 0.3);
    col = mix(col, vec3(0.7, 0.7, 0.74) * lamp, rod);
    col = mix(col, mix(vec3(0.8, 0.1, 0.1), imgPalette(hue * 0.159 + 0.02), 0.25) * lamp,
              smoothstep(0.035, 0.03, length(p - vec2(handleX, 0.32))));
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
