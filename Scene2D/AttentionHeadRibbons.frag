#version 330 core
out vec4 fragColor;
/**
 * @file AttentionHeadRibbons.frag
 * @brief ATTENTION HEAD RIBBONS: a transformer attention map, drawn.  A
 * row of tokens -- tiles of the photo -- along the bottom, and above them
 * the attention: ribbons arching from each query token to the keys it
 * attends to, one colour per head.  The weights are the products of the
 * chroma classes of query and key (so chords draw the strongest arcs and
 * the pattern changes with the harmony, smoothly); the ribbons pulse with
 * light along their length on the scene clock; the kick lights the token
 * that is attended most.  Camera still.
 *
 * Audio Reactivity:
 *   audioChroma[12] -> attention weights (continuous)
 *   sceneAdvance    -> pulses along the ribbons (continuous)
 *   audioKick       -> the top token flashes (light)
 *   audioSwell      -> ribbon opacity (slow)
 *   audioLevel      -> brightness
 *
 * Per-activation variety: headsP, tokensP, hueP.
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
uniform float tokensP;
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

// Distance from p to a parabolic arch from (x0, y0) to (x1, y0) of height h.
float archDist(vec2 p, float x0, float x1, float y0, float h, out float along)
{
    float w = x1 - x0;
    along = clamp((p.x - x0) / w, 0.0, 1.0);
    // Sample the arch at a few t near the projection for a decent distance.
    float best = 1e9;
    for (int i = -2; i <= 2; ++i)
    {
        float t = clamp(along + float(i) * 0.03, 0.0, 1.0);
        vec2 q = vec2(x0 + w * t, y0 + h * 4.0 * t * (1.0 - t));
        best = min(best, length(p - q));
    }
    return best;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    int nHeads = 2 + int(clamp(headsP, 0.0, 1.0) * 3.0);
    int nTok = 8 + int(clamp(tokensP, 0.0, 1.0) * 6.0);
    float opacity = 0.5 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float rowY = -0.36;
    float tokW = aspect * 0.9 / float(nTok);

    // Background: dark with the photo very faint.
    vec3 col = img(gl_FragCoord.xy / resolution) * imgPalette(hue * 0.159 + 0.6) * 0.06 + vec3(0.01, 0.012, 0.02);

    // Token weights: token i has chroma class (i * 5) mod 12.
    float e[14];
    float maxE = 0.0; int maxI = 0;
    for (int i = 0; i < 14; ++i)
    {
        int k = int(mod(float(i) * 5.0, 12.0));
        e[i] = (i < nTok) ? clamp(audioChroma[k] * 1.5, 0.0, 1.0) : 0.0;
        if (e[i] > maxE) { maxE = e[i]; maxI = i; }
    }
    // Ribbons: for each head and each query/key pair with weight above a
    // threshold; heads differ by an arch-height factor and colour.
    for (int h = 0; h < 5; ++h)
    {
        if (h >= nHeads) break;
        float fh = float(h);
        vec3 hc = imgPalette(hue * 0.159 + fh * 0.2) * 1.6 + 0.15;
        float hScale = 0.35 + 0.2 * fh;
        for (int i = 0; i < 14; ++i)
        {
            if (i >= nTok) break;
            for (int j = i + 1; j < 14; ++j)
            {
                if (j >= nTok) break;
                // Head h attends by a head-specific mixing of the two energies.
                float w = e[i] * e[j] * (0.6 + 0.4 * hash11(fh * 7.0 + float(i * 14 + j)));
                if (w < 0.06) continue;
                float x0 = -aspect * 0.45 + (float(i) + 0.5) * tokW;
                float x1 = -aspect * 0.45 + (float(j) + 0.5) * tokW;
                float along;
                float d = archDist(p, x0, x1, rowY + 0.05, hScale * (x1 - x0) / aspect * 2.0 + 0.05, along);
                float width = 0.005 + 0.016 * w;
                float line = smoothstep(width, width * 0.3, d);
                float pulse = 0.6 + 0.4 * sin(along * 12.0 - sceneAdvance * 3.0 + fh);
                col += hc * line * sqrt(w) * opacity * pulse * 3.0;
            }
        }
    }
    // Tokens: photo tiles in a row, brightened by their energy; the most
    // attended flashes on the kick.
    for (int i = 0; i < 14; ++i)
    {
        if (i >= nTok) break;
        float xc = -aspect * 0.45 + (float(i) + 0.5) * tokW;
        vec2 d = abs(p - vec2(xc, rowY));
        float tile = step(d.x, tokW * 0.42) * step(d.y, 0.07);
        vec2 tuv = vec2(float(i) / float(nTok) + (p.x - xc + tokW * 0.42) / (tokW * 0.84) / float(nTok), (p.y - rowY + 0.05) / 0.1);
        vec3 tc = img(clamp(tuv, 0.0, 1.0)) * (0.5 + 0.8 * e[i]);
        if (i == maxI) tc += imgPalette(hue * 0.159 + 0.9) * audioKick * 0.8;
        col = mix(col, tc, tile);
        // Token label bar underneath: the class energy as a small meter.
        float meter = step(d.x, tokW * 0.42) * step(p.y, rowY - 0.06) * step(rowY - 0.06 - 0.12 * e[i], p.y);
        col = mix(col, imgPalette(hue * 0.159 + float(i) / 14.0) * 1.4, meter * 0.9);
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
