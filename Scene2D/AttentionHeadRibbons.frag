#version 330 core
out vec4 fragColor;
/**
 * @file AttentionHeadRibbons.frag
 * @brief ATTENTION HEAD RIBBONS: the harmony as an attention map, drawn as
 * a chord diagram.  The twelve pitch classes sit round a ring in circle-of-
 * fifths order, each an arc of the photo lit by its energy; glowing ribbons
 * curve through the middle between every pair that sounds together, one
 * colour per attention head -- fifths cyan, thirds magenta, steps gold,
 * tritones violet -- so a major chord draws a magenta triangle with a cyan
 * edge, and the web re-weaves itself, smoothly, as the harmony moves.
 * Light flows along the ribbons; the strongest token flares on the kick.
 * Camera still.
 *
 * Audio Reactivity:
 *   audioChroma[12] -> ribbon weights (products of the two classes, continuous)
 *   sceneAdvance    -> light flowing along the ribbons (continuous)
 *   audioKick       -> the strongest token flares (light)
 *   audioSwell      -> ribbon opacity (slow)
 *   audioLevel      -> brightness
 *
 * Per-activation variety: headsP (2..4 heads), hueP.
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
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float headsP;
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

// Distance to a quadratic Bezier A-B-C and the curve parameter of the
// closest point (after Quilez's exact cubic solve).
vec2 sdBezier(vec2 pos, vec2 A, vec2 B, vec2 C)
{
    vec2 a = B - A, b = A - 2.0 * B + C, c = a * 2.0, d = A - pos;
    float bb = dot(b, b);
    if (bb < 1e-7) {                                   // straight chord
        vec2 pa = pos - A, ba = C - A;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        return vec2(length(pa - ba * h), h);
    }
    float kk = 1.0 / bb;
    float kx = kk * dot(a, b);
    float ky = kk * (2.0 * dot(a, a) + dot(d, b)) / 3.0;
    float kz = kk * dot(d, a);
    float p = ky - kx * kx;
    float p3 = p * p * p;
    float q = kx * (2.0 * kx * kx - 3.0 * ky) + kz;
    float h = q * q + 4.0 * p3;
    float res, t;
    if (h >= 0.0) {
        h = sqrt(h);
        vec2 x = (vec2(h, -h) - q) / 2.0;
        vec2 uv = sign(x) * pow(abs(x), vec2(1.0 / 3.0));
        t = clamp(uv.x + uv.y - kx, 0.0, 1.0);
        vec2 qq = d + (c + b * t) * t;
        res = dot(qq, qq);
    } else {
        float z = sqrt(-p);
        float v = acos(clamp(q / (p * z * 2.0), -1.0, 1.0)) / 3.0;
        float m = cos(v), n = sin(v) * 1.732050808;
        vec3 tt = clamp(vec3(m + m, -n - m, n - m) * z - kx, 0.0, 1.0);
        vec2 qx = d + (c + b * tt.x) * tt.x;
        vec2 qy = d + (c + b * tt.y) * tt.y;
        float dx = dot(qx, qx), dy = dot(qy, qy);
        if (dx < dy) { res = dx; t = tt.x; } else { res = dy; t = tt.y; }
    }
    return vec2(sqrt(res), t);
}

vec2 tokenPos(int k, float R)
{
    // Circle of fifths: pitch class k sits at position 7k mod 12.
    float pos = mod(float(k) * 7.0, 12.0);
    float a = 1.5707963 - pos / 12.0 * 6.2831853;
    return R * vec2(cos(a), sin(a));
}

void main()
{
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    float hue = (hueP > 0.001) ? hueP : 0.0;
    int nHeads = 2 + int(clamp(headsP, 0.0, 1.0) * 2.0 + 0.5);    // 2..4
    float opacity = 0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float R = 0.38;

    // Background: deep blue-black, a faint radial glow and the photo far away.
    float r = length(p);
    vec3 col = vec3(0.008, 0.01, 0.022) + vec3(0.02, 0.025, 0.05) * exp(-r * 3.0);
    col += img(gl_FragCoord.xy / resolution) * 0.035;

    // Token energies: the twelve pitch classes.
    float e[12];
    float maxE = 0.0; int maxI = 0;
    for (int i = 0; i < 12; ++i) {
        e[i] = clamp(audioChroma[i], 0.0, 1.0);
        if (e[i] > maxE) { maxE = e[i]; maxI = i; }
    }
    // Relative to the strongest class, so quiet music still draws its
    // harmony (in the app the raw classes sat low and the web stayed faint);
    // the floor keeps silence from being blown up into a full web.
    float norm = 1.0 / max(maxE, 0.15);
    for (int i = 0; i < 12; ++i) e[i] = clamp(e[i] * norm, 0.0, 1.0);

    // Heads by interval class: fifths (5), thirds (3, 4), steps (1, 2),
    // tritone (6).  Each attends between pitch classes at its interval, so a
    // major chord draws a magenta triangle of thirds and a cyan fifth.
    vec3 headC[4];
    headC[0] = mix(vec3(0.2, 0.85, 1.0), imgPalette(hue * 0.159 + 0.5), 0.25);    // fifths
    headC[1] = mix(vec3(1.0, 0.25, 0.75), imgPalette(hue * 0.159 + 0.8), 0.25);   // thirds
    headC[2] = mix(vec3(1.0, 0.75, 0.25), imgPalette(hue * 0.159 + 0.1), 0.25);   // steps
    headC[3] = mix(vec3(0.6, 0.4, 1.0), imgPalette(hue * 0.159 + 0.65), 0.25);    // tritone

    // Bounding circle: every chord lies inside the ring.
    if (r < R + 0.1) {
        for (int i = 0; i < 12; ++i)
        for (int j = i + 1; j < 12; ++j) {
            int iv = j - i; int ic = min(iv, 12 - iv);
            int head = (ic == 5) ? 0 : ((ic == 3 || ic == 4) ? 1 : ((ic <= 2) ? 2 : 3));
            if (head >= nHeads) continue;
            float w = e[i] * e[j];
            float vis = smoothstep(0.01, 0.08, w);
            if (vis <= 0.0) continue;
            vec2 A = tokenPos(i, R - 0.01), C = tokenPos(j, R - 0.01);
            vec2 B = (A + C) * 0.18;                                   // pulled toward the centre
            vec2 bt = sdBezier(p, A, B, C);
            float width = 0.002 + 0.007 * w;
            float core = smoothstep(width, width * 0.2, bt.x);
            float glow = exp(-bt.x * 45.0) * 0.25;
            // Light flows from query to key along the ribbon.
            float pulse = 0.55 + 0.45 * sin(bt.y * 14.0 - sceneAdvance * 3.0 - float(head) * 1.3);
            col += headC[head] * (core * 1.4 + glow) * vis * opacity * pulse * (0.4 + 0.9 * sqrt(w));
        }
    }

    // The ring of tokens: twelve arcs of the photo, lit by their energy; the
    // strongest one flares on the kick.
    float ang = atan(p.y, p.x);
    float posF = mod((1.5707963 - ang) / 6.2831853 * 12.0 + 0.5, 12.0);
    float pi_ = floor(posF);
    int kIdx = int(mod(pi_ * 7.0, 12.0));                             // inverse of 7k mod 12 is 7
    float within = abs(fract(posF) - 0.5);
    float band = smoothstep(0.012, 0.0, abs(r - R - 0.035) - 0.02) * smoothstep(0.47, 0.42, within);
    float ek = 0.0;
    for (int i = 0; i < 12; ++i) if (i == kIdx) ek = e[i];
    vec3 tokC = img(clamp(vec2(0.5) + p * 0.9, 0.0, 1.0)) * 0.6 + headC[0] * 0.15;
    tokC *= 0.35 + 1.1 * ek;
    if (kIdx == maxI) tokC += imgPalette(hue * 0.159 + 0.9) * clamp(audioKick, 0.0, 1.0) * 0.7;
    col = mix(col, tokC, band);
    // A fine outer circle.
    col += vec3(0.25, 0.3, 0.45) * exp(-abs(r - R - 0.075) * 600.0) * 0.4;

    col *= 0.8 + 0.4 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
