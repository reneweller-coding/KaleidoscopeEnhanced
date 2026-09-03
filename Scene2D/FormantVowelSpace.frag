#version 330 core
out vec4 fragColor;
/**
 * @file FormantVowelSpace.frag
 * @brief FORMANT VOWEL SPACE: the vowel chart of phonetics -- the second
 * formant across (high F2 on the left, as the chart is drawn), the first
 * formant down -- with the cardinal vowels as photo blobs at their
 * places.  A marker glides to where the spectral shape points (a smoothed
 * centroid and spread read from the spectrogram history, so it never
 * jumps), trailing the recent seconds as a fading path of dots; the blob
 * nearest the marker lights, its vowel rings with the treble.  The kick
 * is a soft pulse of the marker.  Camera fixed on the chart.
 *
 * Audio Reactivity:
 *   texSpectro (history) -> centroid / spread over rows: marker and trail (smoothed)
 *   audioHigh            -> the lit vowel rings (light)
 *   audioKick            -> marker pulse (light)
 *   audioSwell           -> chart light (slow)
 *   audioLevel           -> brightness
 *
 * Per-activation variety: blobP, trailP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform sampler2D texSpectro;
uniform float spectroHead;
uniform float spectroFill;
uniform float audioHigh;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float blobP;
uniform float trailP;
uniform float hueP;

const float kSpectroRows = 256.0;

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

// Centroid and spread of one spectrogram row at the given age (in rows),
// from 16 of the 32 bands; the linear filter between rows smooths a little.
vec2 rowShape(float age)
{
    float y = fract(spectroHead - age / kSpectroRows);
    float sum = 0.0, m1 = 0.0, m2 = 0.0;
    for (int b = 0; b < 16; ++b)
    {
        float bb = float(b) / 15.0;
        float e = texture(texSpectro, vec2((float(b) * 2.0 + 0.5) / 32.0, y)).r;
        sum += e; m1 += bb * e; m2 += bb * bb * e;
    }
    if (sum < 1e-4) return vec2(0.4, 0.2);
    float cen = m1 / sum;
    float spr = sqrt(max(m2 / sum - cen * cen, 0.0));
    return vec2(cen, spr);
}

// Marker position on the chart: F2 across (centroid, reversed), F1 down
// (spread), the shape averaged over a window of rows starting at the age.
vec2 markerAt(float age, int window)
{
    vec2 acc = vec2(0.0);
    for (int i = 0; i < 4; ++i) { if (i >= window) break; acc += rowShape(age + float(i) * 3.0); }
    acc /= float(window);
    return vec2(clamp(0.5 - (acc.x - 0.3) * 2.2, -0.6, 0.6), clamp((acc.y - 0.12) * 4.0 - 0.3, -0.42, 0.42));
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float blob = 0.09 + 0.05 * clamp(blobP, 0.0, 1.0);
    float trailLen = 30.0 + 50.0 * clamp(trailP, 0.0, 1.0);
    float light = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);

    // The chart: the photo as parchment, the trapezoid of the vowel space,
    // grid lines.
    vec3 col = img(gl_FragCoord.xy / resolution) * mix(vec3(0.45), imgPalette(hue * 0.159 + 0.6) * 0.7, 0.4) * light + 0.05;
    // Trapezoid: the top wide (i .. u), the bottom narrow (a).
    float ty = clamp((p.y + 0.4) / 0.8, 0.0, 1.0);
    float halfW = mix(0.18, 0.62, ty);
    float inside = step(abs(p.x), halfW) * step(-0.4, p.y) * step(p.y, 0.4);
    float edge = smoothstep(0.006, 0.0, abs(abs(p.x) - halfW)) * step(-0.4, p.y) * step(p.y, 0.4) + smoothstep(0.006, 0.0, abs(abs(p.y) - 0.4)) * step(abs(p.x), halfW + 0.006);
    col = mix(col, col * 0.75 + vec3(0.03), inside);
    // Grid: close, mid and open rows, and the central line.
    float grid = smoothstep(0.004, 0.0, abs(p.y - 0.13)) + smoothstep(0.004, 0.0, abs(p.y + 0.13)) + smoothstep(0.004, 0.0, abs(p.x)) * (1.0 - smoothstep(0.35, 0.4, abs(p.y)));
    col = mix(col, vec3(0.2, 0.18, 0.15), clamp(grid, 0.0, 1.0) * 0.5 * inside);
    col = mix(col, vec3(0.15, 0.12, 0.1), clamp(edge, 0.0, 1.0));
    // The marker now (a four-row window).
    vec2 m0 = markerAt(0.0, 4);
    // The vowel blobs at the cardinal positions.
    vec2 V[8];
    V[0] = vec2(-0.55, 0.36); V[1] = vec2(0.55, 0.36);            // i, u
    V[2] = vec2(-0.4, 0.13); V[3] = vec2(0.42, 0.13);             // e, o
    V[4] = vec2(-0.26, -0.13); V[5] = vec2(0.3, -0.13);           // open-mid
    V[6] = vec2(-0.12, -0.36); V[7] = vec2(0.14, -0.36);          // a
    int nearest = 0; float nd = 1e9;
    for (int v = 0; v < 8; ++v) { float d = length(m0 - V[v]); if (d < nd) { nd = d; nearest = v; } }
    for (int v = 0; v < 8; ++v)
    {
        vec2 q = p - V[v];
        float r = length(q);
        vec3 vc = imgPalette(hue * 0.159 + float(v) * 0.125) * 1.3 + 0.15;
        float lit = (v == nearest) ? smoothstep(0.35, 0.05, nd) : 0.0;
        // The blob: a photo disc.
        vec3 face = img(clamp(q / blob * 0.35 + 0.5, 0.0, 1.0)) * mix(vec3(1.0), vc, 0.4) * 1.2 * light;
        face += vc * lit * 0.6;
        float disc = smoothstep(blob, blob - 0.006, r);
        col = mix(col, face, disc);
        col = mix(col, vc * 0.8, smoothstep(0.006, 0.0, abs(r - blob)));
        // The lit vowel rings with the treble: expanding rings around it.
        float rings = pow(0.5 + 0.5 * cos(r * 50.0 - (sceneAdvance * 2.0 + sceneTime * 0.4) * 5.0), 4.0) * exp(-r * 6.0);
        col += vc * rings * lit * (0.3 + 0.9 * hi) * step(blob, r);
        col += vc * exp(-r * 10.0) * lit * 0.4;
    }
    // The trail: marker positions at increasing ages, fading dots.
    vec3 mc = imgPalette(hue * 0.159 + 0.9) * 1.6 + 0.3;
    for (int i = 1; i <= 8; ++i)
    {
        float age = float(i) / 8.0 * trailLen;
        vec2 mp = markerAt(age, 2);
        float d = length(p - mp);
        float f = 1.0 - float(i) / 9.0;
        col += mc * smoothstep(0.018 * f + 0.008, 0.0, d) * f * 0.8;
    }
    // The marker: a bright round dot with a halo, pulsing on the kick.
    float dm = length(p - m0);
    col += mc * (smoothstep(0.03, 0.02, dm) * 1.5 + exp(-dm * 25.0) * (0.6 + 1.2 * audioKick));
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
