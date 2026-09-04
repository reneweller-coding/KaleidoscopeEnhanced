#version 330 core
out vec4 fragColor;
/**
 * @file XrayLuggageBelt.frag
 * @brief XRAY LUGGAGE BELT: the operator's screen at a security scanner.
 * Bags glide right to left on the scene clock, drawn in the false-colour
 * palette of dual-energy X-ray -- orange for organic, green for mixed,
 * blue for metal -- with the photo showing through as their contents.
 * The spectrum bands set how dense each bag reads, the kick raises a
 * threat box around the densest object (light), and the screen furniture
 * (scan line, grid, readout bars) frames it all.  Camera fixed.
 *
 * Audio Reactivity:
 *   sceneAdvance      -> the belt (continuous)
 *   audioSpectrum[32] -> density of the contents by height (light)
 *   audioKick         -> the threat box (light)
 *   audioHigh         -> edge enhancement (light)
 *   audioSwell        -> screen brightness (slow)
 *
 * Per-activation variety: bagsP, densityP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioKick;
uniform float audioHigh;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float bagsP;
uniform float densityP;
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

// The dual-energy palette: organic warm, mixed green, metal blue-black.
vec3 xray(float material, float density)
{
    vec3 organic = vec3(1.0, 0.62, 0.16);
    vec3 mixed   = vec3(0.35, 0.85, 0.35);
    vec3 metal   = vec3(0.25, 0.4, 0.95);
    vec3 c = mix(organic, mixed, smoothstep(0.25, 0.6, material));
    c = mix(c, metal, smoothstep(0.6, 0.95, material));
    // Dense material blocks more, so it reads darker and more saturated.
    return c * (1.0 - 0.75 * density);
}

// Rounded box distance, for the bags.
float sdBox(vec2 p, vec2 b, float r)
{
    vec2 d = abs(p) - b + r;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float bags = 4.0 + floor(clamp(bagsP, 0.0, 1.0) * 3.0);             // once per activation
    float dens = 0.5 + 0.7 * clamp(densityP, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float screen = 0.75 + 0.45 * clamp(audioSwell, 0.0, 1.0);
    float clock = sceneAdvance * 0.4 + sceneTime * 0.08;
    float belt = clock * 0.22;

    // The screen: near-white background, as an X-ray viewer has, with a
    // faint scan grid and a slight vignette.
    vec3 col = vec3(0.93, 0.95, 0.93) * screen;
    col *= 0.93 + 0.07 * hash21(floor(uv * vec2(600.0, 340.0)));
    float grid = smoothstep(0.004, 0.0, abs(fract(uv.x * 24.0) - 0.5) - 0.49)
               + smoothstep(0.004, 0.0, abs(fract(uv.y * 14.0) - 0.5) - 0.49);
    col *= 1.0 - 0.06 * clamp(grid, 0.0, 1.0);
    // The belt band: the strip the bags ride on, slightly grey, with the
    // rubber texture scrolling.
    float bandT = smoothstep(0.42, 0.4, abs(p.y + 0.02));
    col *= 1.0 - 0.06 * bandT;
    col -= vec3(0.02) * bandT * (0.5 + 0.5 * sin((p.x + belt) * 120.0));

    // The bags.  Each rides the belt, wraps around, and carries the photo
    // as its contents; its material mix and size are fixed per activation.
    float densestX = -10.0; float densestD = -1.0; float densestH = 0.0;
    for (int i = 0; i < 6; ++i)
    {
        if (float(i) >= bags) break;
        float fi = float(i);
        float span = aspect * 2.2;
        float bx = mod((fi / bags) * span + span - belt * span * 0.5, span) - span * 0.5;
        float w = 0.26 + 0.14 * hash11(fi * 3.1);
        float h = 0.17 + 0.1 * hash11(fi * 5.7);
        vec2 bq = p - vec2(bx, -0.02);
        float d = sdBox(bq, vec2(w, h), 0.03);
        float inside = smoothstep(0.006, -0.004, d);
        if (inside > 0.001)
        {
            // Contents: the photo, sampled in the bag's own frame, turned
            // into a material class and a density.
            vec2 cuv = clamp(bq / vec2(w, h) * 0.45 + 0.5 + vec2(fi * 0.17, 0.0), 0.0, 1.0);
            vec3 ph = img(cuv);
            float material = clamp(dot(ph, vec3(0.35, 0.35, 0.3)) * 1.3, 0.0, 1.0);
            // The band at this height sets how dense the contents read.
            int band = int(clamp((bq.y / h * 0.5 + 0.5) * 31.0, 0.0, 31.0));
            float en = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
            float density = clamp((0.25 + 0.6 * en) * dens * (0.5 + 0.8 * ph.b), 0.0, 1.0);
            vec3 body = xray(material, density);
            // Hard objects inside: a few dense round and bar shapes.
            float hard = 0.0;
            for (int k = 0; k < 4; ++k)
            {
                float fk = float(k) + fi * 4.0;
                vec2 op = vec2((hash11(fk * 2.3) - 0.5) * w * 1.2, (hash11(fk * 4.7) - 0.5) * h * 1.2);
                float od = length((bq - op) * vec2(1.0, 1.0 + hash11(fk * 6.1)));
                hard = max(hard, smoothstep(0.028 + 0.02 * hash11(fk), 0.0, od));
            }
            body = mix(body, xray(0.95, 0.55 + 0.35 * en), hard * 0.9);
            // Edge enhancement, the operator's favourite filter.
            float edge = smoothstep(0.012, 0.0, abs(d)) * (0.35 + 0.7 * hi);
            body = mix(body, body * 0.35, edge);
            col = mix(col, body * screen, inside);
            // Handles and straps as thin dark lines.
            float strap = smoothstep(0.006, 0.0, abs(abs(bq.x) - w * 0.45)) * inside;
            col = mix(col, col * 0.7, strap);
            float dTot = density + hard * 0.4;
            if (dTot > densestD) { densestD = dTot; densestX = bx; densestH = h; }
        }
    }
    // The scan line: a soft vertical bar travelling with the belt, brighter
    // where it crosses a bag.
    float sx = (fract(clock * 0.28) - 0.5) * aspect * 1.9;
    col += vec3(0.15, 0.65, 0.9) * smoothstep(0.02, 0.0, abs(p.x - sx)) * 0.5;
    // The threat box: a rectangle around the densest bag, raised by the
    // kick (a light, local marker -- the box does not jump about).
    if (densestD > 0.0)
    {
        vec2 tq = p - vec2(densestX, -0.02);
        vec2 hb = vec2(0.34, densestH + 0.08);
        float onEdge = smoothstep(0.008, 0.0, abs(sdBox(tq, hb, 0.01)));
        // Corner ticks, so it reads as an overlay and not a drawn box.
        float corner = step(hb.x * 0.55, abs(tq.x)) + step(hb.y * 0.55, abs(tq.y));
        col = mix(col, vec3(1.0, 0.15, 0.12), onEdge * clamp(corner, 0.0, 1.0) * (0.25 + 0.9 * audioKick));
    }
    // Readout: a column of bars down the left edge, one per band group.
    for (int b = 0; b < 8; ++b)
    {
        float fb = float(b);
        float y = 0.42 - fb * 0.055;
        float e = clamp(audioSpectrum[b * 4] * 1.6, 0.0, 1.0);
        vec2 rq = p - vec2(-aspect * 0.5 + 0.06, y);
        float frame = step(abs(rq.x), 0.035) * step(abs(rq.y), 0.02);
        float fill = step(abs(rq.y), 0.014) * step(-0.03, rq.x) * step(rq.x, -0.03 + 0.06 * e);
        col = mix(col, vec3(0.1, 0.12, 0.14), frame * 0.8);
        col = mix(col, mix(vec3(0.2, 0.9, 0.4), vec3(1.0, 0.4, 0.2), e), fill);
    }
    // The viewer's own frame: a dark border and a soft vignette.
    float border = smoothstep(0.46, 0.5, abs(p.y)) + smoothstep(aspect * 0.47, aspect * 0.5, abs(p.x));
    col = mix(col, vec3(0.05, 0.06, 0.07), clamp(border, 0.0, 1.0));
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
