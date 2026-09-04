#version 330 core
out vec4 fragColor;
/**
 * @file AbacusBeadCount.frag
 * @brief ABACUS BEAD COUNT: a soroban counting the music.  One rod per
 * spectrum band; on each rod the beads slide toward the reckoning bar to
 * the value of that band, so the whole frame reads as a bar chart made of
 * wooden beads.  The beads glide -- their position is a smoothed function
 * of the band, never a jump -- and a rod's beads brighten as they reach
 * the bar.  The photo is the frame's wood and the felt behind.  Camera
 * fixed on the abacus.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> bead positions per rod (smoothed, gliding)
 *   audioSwell        -> the lamp over the frame (slow)
 *   audioHigh         -> the lacquer sheen (light)
 *   audioKick         -> the frame is tapped: the beads glint (light)
 *   sceneAdvance      -> a slow drift of the lamp (continuous)
 *
 * Per-activation variety: rodsP, beadsP, hueP.
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
uniform float audioSwell;
uniform float audioHigh;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float rodsP;
uniform float beadsP;
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

// A bead: a flattened bicone on a rod, seen from the front.
float beadShape(vec2 q, float w, float h)
{
    // Two cones back to back: |y|/h + |x|/w <= 1 with the corners rounded.
    float d = abs(q.y) / max(h, 1e-3) + pow(abs(q.x) / max(w, 1e-3), 2.2) - 1.0;
    return smoothstep(0.06, -0.04, d);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float rods = 12.0 + floor(clamp(rodsP, 0.0, 1.0) * 8.0);            // rods across
    float lower = 4.0 + floor(clamp(beadsP, 0.0, 1.0) * 2.0);           // beads below the bar
    float lamp = 0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.3 + sceneTime * 0.06;

    // The felt behind the frame, and the frame itself.
    vec3 felt = img(uv * 1.1) * mix(vec3(0.16, 0.1, 0.08), imgPalette(hue * 0.159 + 0.6) * 0.2, 0.45);
    felt *= 0.75 + 0.35 * noise2(p * 120.0);
    vec3 col = felt * lamp * 0.8;

    float frameHalf = aspect * 0.45, frameTop = 0.4, frameBot = -0.4;
    float inFrame = step(abs(p.x), frameHalf) * step(frameBot, p.y) * step(p.y, frameTop);
    float barY = 0.12;                                                   // the reckoning bar

    if (inFrame > 0.5)
    {
        float t = (p.x + frameHalf) / (2.0 * frameHalf) * rods;
        float ri = floor(t);
        float rf = fract(t) - 0.5;
        float rodX = ((ri + 0.5) / rods - 0.5) * 2.0 * frameHalf;
        int band = int(mod(ri, 32.0));
        float e = clamp(audioSpectrum[band] * 1.7, 0.0, 1.0);
        vec3 tint = imgPalette(hue * 0.159 + float(band) / 32.0) * 1.35 + 0.15;
        // The rod: a thin bamboo pin.
        float rodD = abs(p.x - rodX);
        float rodW = 0.004;
        col = mix(col, mix(vec3(0.65, 0.55, 0.35), tint, 0.15) * lamp,
                  smoothstep(rodW, rodW * 0.5, rodD) * step(frameBot + 0.03, p.y) * step(p.y, frameTop - 0.03));

        float beadW = (2.0 * frameHalf / rods) * 0.42;
        float beadH = 0.035;
        // The heaven bead above the bar: it comes DOWN to the bar when the
        // band passes half.  Its travel is a smoothstep, so it glides.
        float heavenRest = frameTop - 0.07;
        float heavenDown = barY + beadH + 0.008;
        float heavenY = mix(heavenRest, heavenDown, smoothstep(0.35, 0.75, e));
        float hb = beadShape(vec2(p.x - rodX, p.y - heavenY), beadW, beadH);
        float atBarH = smoothstep(0.06, 0.0, abs(heavenY - heavenDown));
        vec3 wood = mix(vec3(0.5, 0.3, 0.16), tint, 0.2 + 0.45 * atBarH);
        // Bead shading: a round highlight and a dark rim.
        float shadeH = 1.0 - clamp(length(vec2((p.x - rodX) / beadW, (p.y - heavenY) / beadH)), 0.0, 1.0);
        vec3 beadColH = wood * (0.4 + 0.8 * sqrt(shadeH)) * lamp;
        beadColH += vec3(1.0, 0.95, 0.85) * smoothstep(0.5, 0.0, length(vec2((p.x - rodX) / beadW + 0.35, (p.y - heavenY) / beadH + 0.35)))
                  * (0.15 + 0.5 * hi + 0.5 * audioKick);
        beadColH += tint * atBarH * e * 0.5;
        col = mix(col, beadColH, hb);

        // The earth beads below: as many as the band's value slide UP to
        // the bar, the rest stay at the bottom.  Their positions are a
        // continuous function of the value, so no bead ever teleports.
        float value = e * lower;                                        // how many are counted
        for (int k = 0; k < 6; ++k)
        {
            float fk = float(k);
            if (fk >= lower) break;
            // Rest position at the bottom, counted position under the bar.
            float rest = frameBot + 0.06 + fk * (beadH * 2.1);
            float up = barY - beadH - 0.008 - fk * (beadH * 2.1);
            // This bead moves once the value passes its own index.
            float moved = smoothstep(fk, fk + 0.9, value);
            float by = mix(rest, up, moved);
            float bb = beadShape(vec2(p.x - rodX, p.y - by), beadW, beadH);
            if (bb < 0.002) continue;
            float atBar = smoothstep(0.5, 1.0, moved);
            vec3 w2 = mix(vec3(0.45, 0.26, 0.13), tint, 0.18 + 0.5 * atBar);
            float shade = 1.0 - clamp(length(vec2((p.x - rodX) / beadW, (p.y - by) / beadH)), 0.0, 1.0);
            vec3 bc = w2 * (0.4 + 0.8 * sqrt(shade)) * lamp;
            bc += vec3(1.0, 0.95, 0.85) * smoothstep(0.5, 0.0, length(vec2((p.x - rodX) / beadW + 0.35, (p.y - by) / beadH + 0.35)))
                * (0.15 + 0.5 * hi + 0.4 * audioKick);
            bc += tint * atBar * e * 0.45;
            // The bead's shadow on the felt behind it.
            col *= 1.0 - 0.3 * beadShape(vec2(p.x - rodX - 0.006, p.y - by + 0.006), beadW, beadH) * (1.0 - bb);
            col = mix(col, bc, bb);
        }
        // The reckoning bar across every rod.
        float bar = step(abs(p.y - barY), 0.012);
        vec3 barCol = mix(vec3(0.35, 0.22, 0.12), imgPalette(hue * 0.159 + 0.08), 0.25);
        barCol *= 0.7 + 0.4 * noise2(p * 70.0);
        col = mix(col, barCol * lamp, bar);
        col += vec3(1.0, 0.95, 0.85) * smoothstep(0.004, 0.0, abs(p.y - barY - 0.008)) * (0.2 + 0.5 * hi);
        // The unit dots on the bar every fifth rod.
        col = mix(col, vec3(0.85, 0.8, 0.6) * lamp,
                  smoothstep(0.005, 0.002, length(vec2(p.x - rodX, p.y - barY))) * step(4.5, mod(ri, 5.0)));
    }
    // The frame: four rails of dark wood.
    float rail = step(abs(p.x), frameHalf + 0.03) * step(frameBot - 0.03, p.y) * step(p.y, frameTop + 0.03) * (1.0 - inFrame);
    vec3 railCol = img(clamp(vec2(uv.x * 0.5, 0.3), 0.0, 1.0)) * mix(vec3(0.3, 0.18, 0.1), imgPalette(hue * 0.159 + 0.06), 0.25);
    railCol *= 0.7 + 0.45 * noise2(p * 40.0);
    col = mix(col, railCol * lamp, rail);
    col += vec3(1.0, 0.93, 0.8) * rail * smoothstep(0.01, 0.0, abs(p.y - frameTop - 0.015)) * (0.2 + 0.4 * hi);
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
