#version 330 core
out vec4 fragColor;
/**
 * @file GlowwormCaveThreads.frag
 * @brief GLOWWORM CAVE THREADS: the ceiling of a glow-worm cave -- a
 * galaxy of blue-green lights, each a larva at the top of a hanging silk
 * thread strung with sticky beads (round), the still water below mirroring
 * it all.  The lights glow with their spectrum band (each worm a band),
 * the beads catch the treble, a drip from the ceiling on the kick sends
 * a ring across the water; the photo is the wet rock.  Camera fixed in
 * the boat.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> glow-worm brightness by band (light)
 *   audioHigh         -> bead sparkle (light)
 *   audioKick         -> a drip and its ring (light)
 *   sceneAdvance      -> the threads sway gently, rings spread (continuous)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: densP, threadP, hueP.
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
uniform float audioHigh;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float densP;
uniform float threadP;
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
    float dens = 14.0 + 10.0 * clamp(densP, 0.0, 1.0);
    float threadLen = 0.12 + 0.12 * clamp(threadP, 0.0, 1.0);
    float clock = sceneAdvance * 0.3 + sceneTime * 0.06;
    float waterY = -0.25;
    vec3 glow = mix(vec3(0.3, 0.9, 0.7), imgPalette(hue * 0.159 + 0.4), 0.25);

    // Mirror below the water line.
    float inWater = step(p.y, waterY);
    vec2 q = p;
    if (inWater > 0.5) q.y = 2.0 * waterY - p.y + 0.004 * sin(p.x * 50.0 + clock * 2.0);
    // The cave rock: the photo very dark and wet.
    vec3 col = img(vec2(q.x / aspect + 0.5, q.y + 0.5)) * imgPalette(hue * 0.159 + 0.55) * 0.14;
    // Glow-worms: a jittered grid on the ceiling (y above 0.05); each cell
    // a worm with its band, a thread hanging below it with beads.
    vec2 gu = q * dens + vec2(0.0, 0.0); vec2 cell = floor(gu); vec2 f = fract(gu) - 0.5;
    // Check this cell and the ones above (threads hang down into lower cells).
    for (int j = 0; j <= 3; ++j)
    {
        vec2 c = cell + vec2(0.0, float(j));
        if ((c.y + 0.5) / dens < 0.05) continue;                       // only the ceiling glows
        float h = hash21(c);
        if (h < 0.35) continue;                                        // not every cell has a worm
        vec2 wormPos = (c + 0.5 + (vec2(hash21(c + 3.1), hash21(c + 7.7)) - 0.5) * 0.7) / dens;
        int band = int(mod(h * 97.0, 32.0));
        float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
        vec2 d = q - wormPos;
        // The worm: a round glow.
        float worm = smoothstep(0.012, 0.004, length(d));
        col += glow * (worm * (0.9 + 1.2 * e) + exp(-length(d) * 25.0) * (0.3 + 0.8 * e));
        // The thread: hangs down threadLen, swaying gently; beads along it.
        float len = threadLen * (0.6 + 0.8 * hash21(c + 5.5));
        float sway = 0.006 * sin(clock * 1.2 + h * 6.28) * (-d.y / len);
        float onThread = step(-len, d.y) * step(d.y, 0.0);
        float thread = smoothstep(0.0025, 0.0006, abs(d.x - sway)) * onThread;
        col += glow * thread * 0.45 * (0.5 + 0.5 * e);
        float beadPh = fract(-d.y / len * (5.0 + 4.0 * hash21(c + 9.9)));
        float bead = smoothstep(0.006, 0.002, length(vec2(d.x - sway, (beadPh - 0.5) * len / (5.0 + 4.0 * hash21(c + 9.9))))) * onThread;
        col += (glow * 0.6 + 0.4) * bead * (0.3 + 1.2 * clamp(audioHigh * 2.0, 0.0, 1.0)) * (0.5 + 0.5 * e);
    }
    // The water: mirrored image darkened and blued; drip rings on the kick.
    if (inWater > 0.5)
    {
        col *= vec3(0.5, 0.65, 0.75) * 0.75;
        for (int k = 0; k < 4; ++k)
        {
            float fk = float(k);
            float ph = fract(clock * (0.4 + 0.2 * hash21(vec2(fk, 1.0))) + hash21(vec2(fk, 2.0)));
            vec2 c = vec2((hash21(vec2(fk, 3.0)) - 0.5) * aspect, waterY - 0.05 - hash21(vec2(fk, 4.0)) * 0.3);
            float rr = length((p - c) * vec2(1.0, 4.0));
            col += glow * exp(-abs(rr - ph * 0.3) * 50.0) * (1.0 - ph) * (0.15 + 0.6 * audioKick) * 0.6;
        }
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
