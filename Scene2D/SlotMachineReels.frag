#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file SlotMachineReels.frag
 * @brief SLOT MACHINE REELS: a fruit machine in a dark casino.  Behind the
 * glass three drum reels turn, each at its own steady rate for the whole
 * activation -- cherries, lucky sevens, golden bells, BAR plates, blue
 * diamonds and lemons wrapping round the curved drums, darkening toward
 * the top and bottom of the window.  The cabinet is red and chrome, rimmed
 * by a chase of round bulbs; the red pay line glows across the middle; the
 * casino behind is a blur of coloured bokeh.  The reels never snap to a
 * stop -- a reel jerking to a halt on a beat is exactly the jolt this
 * catalogue avoids.
 *
 * Audio Reactivity:
 *   sceneAdvance    -> the reels turn, the bulbs chase (continuous)
 *   audioSwell      -> the pay line and the cabinet light (slow)
 *   audioChroma[12] -> each symbol glows with its class (light)
 *   audioKick       -> the coin tray (light, local)
 *   audioHigh       -> the chrome and glass sparkle (light)
 *
 * Per-activation variety: symbolsP (symbol mix), speedP, hueP.
 */
uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioChroma[12];   ///< Pitch-class energies (12 values).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float symbolsP;
uniform float speedP;   ///< Speed knob, 0..1.
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

/// @brief Pseudo-random number 0..1 from a float.
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

/// @brief Distance from a point to a line segment.
float sdSeg(vec2 p, vec2 a, vec2 b)
{
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}
/// @brief Signed distance to a box of half size b.
float sdBox(vec2 p, vec2 b, float r)
{
    vec2 d = abs(p) - b + r;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

/// One symbol in its cell (q in -0.5..0.5); returns rgb, a = coverage.
vec4 symbol(vec2 q, int kind)
{
    vec3 c = vec3(0.0); float d = 1.0;
    if (kind == 0) {                       // cherries
        float c1 = length(q - vec2(-0.14, -0.12)) - 0.13;
        float c2 = length(q - vec2(0.13, -0.16)) - 0.13;
        float stem = min(sdSeg(q, vec2(-0.12, 0.0), vec2(0.05, 0.3)), sdSeg(q, vec2(0.12, -0.04), vec2(0.05, 0.3))) - 0.022;
        float leaf = length((q - vec2(0.15, 0.3)) * vec2(1.0, 2.2)) - 0.09;
        float fruit = min(c1, c2);
        d = min(fruit, min(stem, leaf));
        c = (fruit < min(stem, leaf)) ? vec3(0.9, 0.08, 0.1) : vec3(0.15, 0.6, 0.15);
        c += vec3(1.0) * smoothstep(0.05, 0.0, length(q - vec2(-0.18, -0.07))) * 0.6;
    } else if (kind == 1) {                // lucky seven
        float top = sdSeg(q, vec2(-0.2, 0.24), vec2(0.2, 0.24)) - 0.06;
        float diag = sdSeg(q, vec2(0.2, 0.24), vec2(-0.06, -0.3)) - 0.07;
        d = min(top, diag);
        c = vec3(0.95, 0.1, 0.12);
        c = mix(c, vec3(1.0, 0.8, 0.3), smoothstep(-0.02, 0.0, d) * 0.8);   // gold outline
    } else if (kind == 2) {                // golden bell
        float body = length((q - vec2(0.0, 0.04)) * vec2(1.0, 0.85)) - 0.22;
        body = max(body, -(q.y + 0.16));
        float rim = sdBox(q - vec2(0.0, -0.18), vec2(0.28, 0.04), 0.03);
        float knob = length(q - vec2(0.0, 0.3)) - 0.05;
        float clap = length(q - vec2(0.0, -0.27)) - 0.05;
        d = min(min(body, rim), min(knob, clap));
        c = vec3(1.0, 0.78, 0.2) * (0.75 + 0.5 * smoothstep(0.2, -0.2, q.x));
    } else if (kind == 3) {                // BAR plate
        float plate = sdBox(q, vec2(0.34, 0.14), 0.04);
        d = plate;
        c = vec3(0.05);
        float stripes = step(0.5, fract(q.x * 7.0 + 0.25)) * step(abs(q.y), 0.06) * step(abs(q.x), 0.26);
        c = mix(c, vec3(1.0, 0.85, 0.35), stripes);
        c = mix(c, vec3(1.0, 0.8, 0.3), smoothstep(-0.025, 0.0, plate));
    } else if (kind == 4) {                // blue diamond
        d = (abs(q.x) / 0.26 + abs(q.y) / 0.33 - 1.0) * 0.2;
        float facet = (q.x > 0.0 ? 0.25 : 0.0) + (q.y > 0.0 ? 0.5 : 0.0);
        c = mix(vec3(0.1, 0.35, 0.95), vec3(0.6, 0.85, 1.0), facet);
    } else {                               // lemon
        d = length(q * vec2(1.0, 1.45)) - 0.25;
        c = vec3(1.0, 0.88, 0.15) * (0.75 + 0.5 * smoothstep(0.2, -0.2, q.x - q.y));
    }
    return vec4(c, smoothstep(0.012, -0.004, d));
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float spd = 0.6 + 0.8 * clamp(speedP, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.5;

    // The casino behind: coloured bokeh discs.
    vec3 col = vec3(0.03, 0.02, 0.04);
    for (int k = 0; k < 18; ++k) {
        float fk = float(k);
        vec2 bc = vec2((hash11(fk * 1.7) - 0.5) * aspect, hash11(fk * 3.3) - 0.5);
        float br = 0.05 + 0.08 * hash11(fk * 5.1);
        float disc = smoothstep(br, br * 0.85, length(p - bc));
        vec3 bcol = 0.5 + 0.5 * cos(6.2831853 * (hash11(fk * 7.9) + vec3(0.0, 0.33, 0.67)));
        col += bcol * disc * 0.12 * (0.7 + 0.3 * sin(T * 0.3 + fk));
    }

    // The cabinet: a red body with a chrome frame.
    float cab = sdBox(p - vec2(0.0, -0.02), vec2(0.72, 0.46), 0.06);
    if (cab < 0.0) {
        vec3 body = mix(vec3(0.55, 0.05, 0.08), imgPalette(0.95 + hue * 0.159) * 0.6, 0.15);
        body *= 0.7 + 0.3 * smoothstep(-0.46, 0.46, p.y) + 0.2 * swell;
        col = body;
    }
    col += vec3(0.9, 0.9, 0.95) * smoothstep(0.012, 0.0, abs(cab)) * (0.6 + 0.6 * hi);

    // Bulbs chasing round the frame: round lamps evenly spaced along the
    // border (arclength), the chase running round it.
    {
        vec2 bp = p - vec2(0.0, -0.02);
        vec2 hb = vec2(0.67, 0.41);
        float sArc; vec2 onB; float side;
        if (abs(bp.x) / hb.x > abs(bp.y) / hb.y) {
            float yy = clamp(bp.y, -hb.y, hb.y);
            sArc = (bp.x > 0.0) ? (yy + hb.y) : (2.0 * hb.y + 2.0 * hb.x + (hb.y - yy));
            side = (bp.x > 0.0) ? 0.0 : 2.0;
        } else {
            float xx = clamp(bp.x, -hb.x, hb.x);
            sArc = (bp.y > 0.0) ? (2.0 * hb.y + (hb.x - xx)) : (4.0 * hb.y + 2.0 * hb.x + (xx + hb.x));
            side = (bp.y > 0.0) ? 1.0 : 3.0;
        }
        float spacing = 0.075;
        float bi = floor(sArc / spacing + 0.5);
        float sb = bi * spacing;
        vec2 bulb;
        if (side == 0.0)      bulb = vec2(hb.x, sb - hb.y);
        else if (side == 1.0) bulb = vec2(hb.x - (sb - 2.0 * hb.y), hb.y);
        else if (side == 2.0) bulb = vec2(-hb.x, hb.y - (sb - 2.0 * hb.y - 2.0 * hb.x));
        else                  bulb = vec2(sb - 4.0 * hb.y - 2.0 * hb.x - hb.x, -hb.y);
        bulb = clamp(bulb, -hb, hb);
        float bd = length(bp - bulb);
        float chase = 0.5 + 0.5 * sin(bi * 0.9 - T * 3.0 * spd);
        vec3 bcol = mix(vec3(1.0, 0.75, 0.3), vec3(1.0, 0.95, 0.85), chase);
        col = mix(col, bcol * (0.3 + 0.9 * chase), smoothstep(0.016, 0.011, bd));
        col += bcol * exp(-bd * 55.0) * 0.25 * chase;
    }

    // The reel window.
    vec2 wp = p - vec2(0.0, 0.03);
    float win = sdBox(wp, vec2(0.6, 0.28), 0.02);
    if (win < 0.0) {
        float reelW = 0.38;
        float rx = wp.x + 0.6;
        float ri = floor(rx / (reelW + 0.03));
        float lx = rx - ri * (reelW + 0.03);
        if (lx < reelW && ri < 3.0) {
            // Drum curvature: angle from the vertical position.
            float yN = clamp(wp.y / 0.33, -0.99, 0.99);
            float th = asin(yN);
            float rate = (0.35 + 0.12 * ri + 0.08 * hash11(ri + 3.0)) * spd;
            float s = th * 1.6 + T * rate + ri * 2.7;
            float si = floor(s);
            vec2 q = vec2((lx - reelW * 0.5) / (reelW * 0.62), fract(s) - 0.5);
            int kind = int(mod(si * 2.0 + ri * 3.0 + floor(clamp(symbolsP, 0.0, 1.0) * 3.0) + floor(hash11(si + ri * 11.0) * 4.0), 6.0));
            vec4 sym = symbol(q, kind);
            float shade = cos(th);
            vec3 strip = vec3(0.96, 0.95, 0.9);
            vec3 rc = mix(strip, sym.rgb, sym.a);
            float e = clamp(audioChroma[int(mod(float(kind) * 2.0 + ri, 12.0))] * 1.5, 0.0, 1.0);
            rc *= (0.85 + 0.35 * e * sym.a);
            col = rc * (0.15 + 0.9 * shade * shade);
        } else {
            col = vec3(0.08, 0.02, 0.03);
        }
        // Pay line.
        col += vec3(1.0, 0.15, 0.1) * exp(-abs(wp.y) * 300.0) * (0.35 + 0.6 * swell);
        // Glass: a soft diagonal reflection and a sparkle on the treble.
        float refl = smoothstep(0.08, 0.0, abs(wp.x * 0.5 + wp.y - 0.18));
        col += vec3(1.0) * refl * (0.06 + 0.1 * hi);
    }
    col += vec3(0.85, 0.85, 0.9) * smoothstep(0.01, 0.0, abs(win)) * 0.7;

    // Coin tray at the bottom, lit on the kick.
    float tray = sdBox(p - vec2(0.0, -0.4), vec2(0.3, 0.035), 0.02);
    col = mix(col, vec3(0.12, 0.1, 0.1), smoothstep(0.003, 0.0, tray));
    col += vec3(1.0, 0.8, 0.35) * exp(-max(tray, 0.0) * 40.0) * smoothstep(0.0, -0.03, tray + 0.02) * (0.2 + 1.1 * kick);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
