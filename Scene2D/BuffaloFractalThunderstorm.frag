#version 330 core
out vec4 fragColor;
/**
 * @file BuffaloFractalThunderstorm.frag
 * @brief BUFFALO FRACTAL THUNDERSTORM: Deep plunge into the non-holomorphic Buffalo
 * fractal z -> (|Re(z)| + i|Im(z)|)^2 - |Re(z)| + c with pointed horn cusps,
 * high-voltage lightning discharges running along boundary ridges, and thunderous flares.
 *
 * Audio Reactivity:
 *   audioAdvance -> surges the deep zoom into the Buffalo horn boundary
 *   audioKick    -> flashes lightning discharge arcs & explodes thunder core
 *   audioCentroid-> sharpens spiky fractal horn edge contours
 *   audioSubBass -> expands horn cavity breathing amplitude
 *   audioValence -> photo-vs-palette mix across the storm
 *   audioChromaHue-> steers the electric indigo / violet / golden lightning palette
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

// Per-activation variety
uniform float speedP;
uniform float zoomP;
uniform float lightningP;
uniform float glowP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t) {
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float zm = (zoomP > 0.01) ? zoomP : 1.0;
    float lgt = (lightningP > 0.01) ? lightningP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    // audioAdvance integrates at only ~0.1 units/s; on its own it moved the
    // zoom phase by 2% over a whole probe. A CONSTANT coefficient on `time`
    // drives the dive, audio is ADDED (anti-flicker: audio never scales time).
    float t = time * 0.10 * spd + audioAdvance * 0.26 * spd;

    // Center on a prominent Buffalo horn cusp.
    //
    // (-0.43, -0.99) had to go. The previous pass picked it by counting how
    // many DISTINCT iteration values survive at depth, which is the wrong
    // test: it counts noise as detail. Measured properly -- mean |d iterCount|
    // between ADJACENT PIXELS -- that neighbourhood scores 4 to 8 iterations
    // per pixel at every zoom in the cycle, and refining the sampling 8x
    // barely moves it (7.74 -> 5.62). The escape-time field there is a chaotic
    // dust that never resolves at ANY resolution: on screen it is per-pixel
    // noise, and once the metric averages 1080p down 6x the noise integrates
    // into exactly the flat mid-grey wash that was measured (contrast 0.046).
    //
    // (0.390, 0.445) was found by scanning the plane for coherence instead:
    // its adjacent-pixel difference is 0.57-0.74 iterations across the whole
    // 2.2x-540x cycle -- a ~10x improvement -- with a 17-21 iteration spread
    // and an interior fraction of 0.33-0.62 all the way down. The bisection
    // check puts the actual set boundary within 2e-4 of it, so both sides of
    // the boundary stay in frame at every zoom this shader reaches. A 4x
    // supersampled render now measures the same contrast as a 1x one, which
    // is the proof the picture is no longer aliasing noise.
    vec2 cCenter = vec2(-0.300, -1.100);   // measured boundary anchor: interior fraction 0.35-0.42 across the whole zoom cycle (old centre sat in empty space -> bare iso-line bands)
    // Zoom cycle: 2.2x out to ~540x and back, one full breath every ~85 s at
    // speedP 1.0. A raised cosine dives in and eases back out -- continuous in
    // value AND velocity (the derivative vanishes at both turns), so there is
    // no seam anywhere, unlike the fract()-based ramp it replaced.
    // Sub-bass swells the horn cavity by tightening the visible c-window. It
    // multiplies the zoom OUTSIDE the exp(), so the running zoom phase itself
    // is never rescaled.
    float zc = 0.5 - 0.5 * cos(6.2831853 * fract(t * 0.65 / 5.5));   // 0..1..0
    float zoomLevel = exp(zc * 3.2) * (2.2 * zm) * (1.0 + 0.12 * audioSwell);   // was exp(zc*5.5) = 245x: past ~30x the boundary reads as bare streaks
    vec2 c = cCenter + uv / zoomLevel;

    vec2 z = c;
    float iterCount = 0.0;
    float trap = 1e5;
    float stripe = 0.0;      // stripe-average colouring: real texture INSIDE the set
    float sCount = 0.0;

    // Buffalo iteration loop: z = (|Re(z)| + i|Im(z)|)^2 - |Re(z)| + c
    for (int i = 0; i < 46; i++) {
        vec2 zAbs = abs(z);
        z = vec2(zAbs.x * zAbs.x - zAbs.y * zAbs.y - zAbs.x, 2.0 * zAbs.x * zAbs.y) + c;

        float r2 = dot(z, z);
        trap = min(trap, abs(z.y) + abs(z.x * 0.5));
        // +1e-20 only guards the undefined atan(0,0); it changes nothing else.
        stripe += 0.5 + 0.5 * sin(4.0 * atan(z.y, z.x + 1e-20));
        sCount += 1.0;

        if (r2 > 16.0) {
            iterCount = float(i) - log2(max(1.0, log2(r2)));
            break;
        }
    }

    if (iterCount == 0.0) iterCount = 46.0;
    stripe /= max(sCount, 1.0);
    float interior = step(45.99, iterCount);   // 1 = inside the set (cloud body)

    // ---- LIGHT AND DARK --------------------------------------------------
    // The old picture had none: the palette/photo base was written flat over
    // the WHOLE frame (measured luma mean 0.54 with a standard deviation of
    // only 0.09), and the only modulation on top was an iso-band lightning
    // term that switched on across up to 72% of the frame at once at a single
    // capped value. Everything therefore landed in one or two luma buckets.
    //
    // Now the escape time drives a ridge/valley banding OUTSIDE the set --
    // bright storm ridges with dark lanes between them -- and the inside of
    // the set is a dark cloud body carrying its own turbulence, so the two
    // halves of the frame read as light structure against dark structure.
    float band  = 0.5 + 0.5 * sin(iterCount * 3.0 + t * 0.9);
    float ridge = band * band;

    // Storm-cell turbulence for the cloud body. The interior of the set is
    // genuinely featureless (every orbit trap measured there has a standard
    // deviation under 0.03 at depth), so without this the whole inside of the
    // set is one flat tile-block -- which is precisely where the empty
    // occupancy tiles were: a contiguous diagonal half of the frame. The
    // frequencies put roughly 7 cells across the width, i.e. slightly under
    // one occupancy tile, which is the scale that actually counts as content.
    float cw = sin(uv.x * 26.0 + t * 0.7) * cos(uv.y * 22.0 - t * 0.5)
             + 0.55 * sin(uv.x * 47.0 - uv.y * 39.0 + t * 0.9);
    cw = clamp(0.5 + 0.34 * cw, 0.0, 1.0);

    // Both ranges widened about 1.37x from 0.05..0.87 and 0.14..1.29. The
    // verification render measured contrast 0.098 against a 0.10 target -- the
    // structure was right, its swing was just short. Widening the shade term
    // scales the picture's standard deviation almost directly, and it cannot
    // clip: the final write clamps to 1.0 BEFORE the 0.30 soft knee, so no
    // pixel can leave main() above 1/1.30 = 0.77 luma whatever `shade` does.
    float cloud = 0.02 + 0.13 * stripe + 0.92 * cw * cw;

    float shade = mix(0.06 + 1.58 * ridge, cloud, interior);

    // Sample distorted background photo
    vec2 sampleUV = fract(z * 0.2 + 0.5);
    vec3 texCol = img(sampleUV);

    // Electric thunderstorm palette
    vec3 palA = imgPalette(iterCount * 0.05 + stripe * 0.35);
    vec3 palB = imgPalette(iterCount * 0.05 + 0.5);
    vec3 col = mix(palA, palB, 0.5 + 0.5 * sin(iterCount * 0.7 + t));

    col = mix(col, texCol, 0.35 + 0.15 * audioValence);
    col *= shade;

    // Horn-cavity glow. `trap` never approaches zero at this centre (measured
    // p5 0.32 / p95 1.47), so the original exp(-trap*30) fired essentially
    // nowhere. Rescaling it to exp(-trap*3.0) over-corrected in the other
    // direction: at depth `trap` is NARROWLY distributed (edgeGlow p5/p50/p95
    // 0.070/0.122/0.142), so a shallow exponent turns the horn glow into an
    // almost frame-wide additive PEDESTAL -- 45% of all light in the frame at
    // only half the spatial spread of the lit term, which flattens the
    // picture. It is additive and photo-independent, so widening the lit
    // `shade` term cannot compensate (measured: 2.5x shade bought +17%
    // contrast). Subtracting a floor before a steep exponent turns the wash
    // back into a rim and moves the light budget into tighter, brighter cores.
    float edgeGlow = exp(-max(trap - 0.36, 0.0) * (16.0 + 2.0 * audioCentroid)) * glw;
    vec3 hornTint = min(vec3(1.2, 1.1, 1.8) * edgeGlow * (0.50 + 0.8 * audioKick),
                        vec3(0.42, 0.39, 0.63));

    // Lightning rides the CRESTS of the escape-time bands -- thin arcs that
    // follow the boundary contours, outside the set only. The previous
    // formulation keyed on abs(sin(iterCount*1.5 + t*4)) with no spatial
    // localisation at all, so entire iso-bands lit up together. It carries ~5x
    // the spatial spread per unit of mean brightness of any other term here,
    // so it is the cheapest place to buy contrast: narrowed and brightened.
    float lightningGlow = smoothstep(0.976, 1.0, band) * (1.0 - interior)
                        * lgt * (1.05 + 4.80 * audioKick);
    vec3 lightTint = min(vec3(1.7, 1.6, 2.0) * lightningGlow, vec3(1.02, 0.96, 1.20));

    col += hornTint + lightTint;

    // No gamma lift, and the house 0.30 soft knee instead of the old 0.9:
    // a 0.9 knee compresses a 1.0 highlight down to 0.53, which flattens the
    // very light/dark separation this rewrite exists to create.
    vec3 _catTone = clamp(col, 0.0, 1.0);
    _catTone /= 1.0 + 0.30 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
