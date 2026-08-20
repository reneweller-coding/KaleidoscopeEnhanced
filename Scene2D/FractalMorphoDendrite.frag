#version 330 core
out vec4 fragColor;
/**
 * @file FractalMorphoDendrite.frag
 * @brief FRACTAL MORPHO DENDRITE: A whole COLONY of growing bio-luminescent coral &
 * electric dendrite KIFS fractals, one per lattice cell across the frame, with dynamic
 * angular branch unfolding, synaptic discharge tips, and high-voltage organic pulsations.
 *
 * Audio Reactivity:
 *   audioAdvance -> surges the branch unfolding & growth on top of a steady base growth
 *   audioKick    -> flashes electric branch tip discharges & shoots lightning arcs
 *   audioCentroid-> sharpens the branch/gap falloff (finer tendrils)
 *   audioSubBass -> expands branch trunk thickness breathing
 *   audioLevel   -> plasma in the water between the colonies
 *   audioValence -> photo-vs-palette mix on the branch surface
 *   audioChromaHue-> rotates the bio-fluorescent color spectrum
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
uniform float foldAngleP;
uniform float branchP;
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
    float fAng = (foldAngleP > 0.01) ? foldAngleP : 1.0;
    float brn = (branchP > 0.01) ? branchP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    // Growth clock. audioAdvance alone integrates at only ~0.1 units/s, so
    // t*0.28 moved by ~0.02 over a whole 7 s probe -- the colony was, for all
    // practical purposes, a still image (measured motion 0.0081, barely over
    // the 0.006 static floor). A CONSTANT coefficient on `time` carries the
    // steady growth and the audio phase is ADDED on top (anti-flicker rule:
    // no audio value ever multiplies `time`).
    float t = time * 0.09 * spd + audioAdvance * 0.28 * spd;

    // ---- COLONY LATTICE ------------------------------------------------
    // One dendrite is a specimen; coral grows as a COLONY.  Everything below
    // used to run on screen coordinates directly, which put the whole KIFS
    // basin of attraction into a small rosette in the middle of the frame --
    // outside it the iteration simply diverges and the picture goes flat.
    // The plane is now cut into cells and every cell raises its own dendrite,
    // each with its own twist, size and growth phase, so the structure reaches
    // all four edges. branchP now sets how MANY colonies there are rather than
    // how far out the (empty) coordinate field starts.
    float latFreq = (2.35 + 0.12 * sin(t * 0.11)) * brn;
    vec2  g   = uv * latFreq;
    vec2  cid = floor(g) + 0.5;                    // cell centre
    vec2  q   = g - cid;                           // -0.5 .. 0.5 inside a cell
    float cellH  = fract(sin(dot(cid, vec2(41.7, 289.1))) * 43758.5453);
    float cellH2 = fract(sin(dot(cid, vec2(73.3,  11.9))) * 24634.6345);

    // per-colony twist, so the field never looks stamped from one die
    float cRot = (cellH - 0.5) * 2.4 + 0.10 * sin(t * 0.23 + cellH2 * 6.2831853);
    q = mat2(cos(cRot), -sin(cRot), sin(cRot), cos(cRot)) * q;

    // each colony breathes at its own pace
    float cellScale = 0.86 + 0.28 * cellH2 + 0.06 * sin(t * 0.7 + cellH * 6.2831853);

    // 3.4 across ONE CELL. The old multiplier of 2.2 across the WHOLE FRAME
    // left |z| so small that the abs-fold/scale/offset loop below pulled
    // nearly every pixel onto the trunk line before the 9th iteration and the
    // glows saturated to flat white; the later 7.0 fixed that but threw most
    // of the frame outside the basin entirely. Per cell, 3.4 puts the basin
    // edge just inside the cell corners: the rosettes nearly touch, and the
    // little that is left between them is what keeps the contrast up.
    float scale = 3.4 * (1.0 + 0.05 * sin(audioSwell * 2.0));
    vec2 z = q * scale * cellScale;

    // Symmetrical 6-fold radial mirroring
    float a = atan(z.y, z.x);
    float r = length(z);
    float seg = 3.14159265 / 3.0;
    a = mod(a + seg * 0.5, seg) - seg * 0.5;
    a = abs(a);
    z = vec2(cos(a), sin(a)) * r;

    // Iterated KIFS dendritic folding
    float minDendriteDist = 1e5;
    float branchAccum = 0.0;
    float tipGlow = 0.0;

    float foldAngle = (0.75 + 0.25 * sin(t * 0.4 + cellH * 6.2831853) + 0.15 * audioFlux) * fAng;
    mat2 rotFold = mat2(cos(foldAngle), -sin(foldAngle), sin(foldAngle), cos(foldAngle));

    float branchScale = 1.0;
    for (int i = 0; i < 9; i++) {
        // Absolute mirror fold
        z = abs(z) - vec2(0.35 + 0.1 * sin(t * 0.5 + float(i)), 0.25);

        // Rotation fold
        z = rotFold * z;

        // Scaling with audio breath
        float scFactor = 1.38 + 0.08 * sin(audioPhase + float(i) * 0.5);
        z *= scFactor;
        z -= vec2(0.4, 0.2 * cos(t * 0.3));
        branchScale *= scFactor;

        // Track dendritic segment distance, normalised by the scale
        // ACTUALLY accumulated so far -- the previous pow(scFactor, i) used
        // the loop index instead of the true running product (off by one
        // iteration, and scFactor itself varies per-iteration so a constant
        // power was never right to begin with), which crushed or inflated
        // the reported distance and left the glow either never firing or
        // saturating everywhere.
        float dSeg = length(vec2(z.x, max(0.0, abs(z.y) - 0.4))) / branchScale;
        minDendriteDist = min(minDendriteDist, dSeg);

        // Accumulate branch tips. dTip USED to be divided by branchScale too,
        // and that is what flattened the frame: branchScale reaches 1.38^9 ~ 22
        // by the last iteration, so dTip collapsed to ~0 for EVERY pixel and
        // exp(-dTip*35) returned ~1 regardless of position. Measured on the
        // real folded field, the old tipGlow had median 0.667 / p75 0.92 --
        // i.e. more than half the frame sat above the 0.467 point where the
        // min(...,0.7) cap below saturates, handing that half an IDENTICAL
        // additive vec3 of luma 0.70. That is the uniform lift that pushed
        // luma 0.242 -> 0.404 while contrast fell 0.081 -> 0.043.
        // The folded coordinate z is already O(1), so use it directly: a
        // gaussian around the fold attractor is a real tip detector.
        if (i >= 5) {
            tipGlow += exp(-dot(z, z) * 3.0);
        }

        branchAccum += dot(z, z) * 0.05;
    }

    // Dynamic texture sample mapped across dendrite manifold
    vec2 sampleUV = fract(z * 0.2 + 0.5);
    vec3 texCol = img(sampleUV);

    // Distance to the nearest dendrite, normalised into a shading variable.
    // Sub-bass divides the falloff constant rather than adding light: a gentler
    // exponent widens the distance band each trunk occupies, so the branches
    // breathe THICKER on drones without raising their peak brightness.
    float dN   = minDendriteDist * (55.0 + 16.0 * audioCentroid) / (1.0 + 0.45 * audioSubBass);
    float body = exp(-dN);            // the branch itself: ~1 on a trunk, ~0 in the gap
    float core = exp(-dN * dN * 3.0); // the hot filament core, much tighter than body

    // Palette mixing
    vec3 palA = imgPalette(branchAccum * 0.1 + t * 0.05 + cellH * 0.37);
    vec3 palB = imgPalette(branchAccum * 0.1 + 0.5 + cellH * 0.37);
    vec3 col = mix(palA, palB, 0.5 + 0.5 * sin(branchAccum * 0.5 + t));

    col = mix(col, texCol, 0.35 + 0.15 * audioValence);

    // THE PHOTO/PALETTE BASE IS NOT A BACKDROP -- IT IS THE BRANCH SURFACE.
    // Written flat it covered all 100% of the frame at luma ~0.53 (measured),
    // which is a textbook uniform lift: it becomes the modal bucket, the
    // dendrites have to clear two buckets to count, and occ collapses. Gating
    // it on `body` puts the coral colour ON the branches and leaves genuinely
    // dark water between them. Measured branch/gap split: body p50 0.24,
    // p25 0.00 -- roughly a third of the frame stays near black.
    col *= 0.045 + 0.70 * body;

    // Electric filaments and discharge tips ride ON TOP of that, tightly
    // localised. Both caps are applied to the TINTED vec3 (house rule) and
    // sized so the brightest channel peaks at 0.76 -- clipHi stays 0.000.
    vec3 electricTint = min(vec3(1.1, 1.4, 1.8) * core * glw * (0.28 + 1.6 * audioKick),
                            vec3(0.46, 0.59, 0.76));
    vec3 tipDischarge = min(vec3(1.5, 0.8, 1.6) * (tipGlow * 0.12) * (0.9 + 2.0 * audioKick),
                            vec3(0.48, 0.26, 0.51));
    col += electricTint + tipDischarge;

    // Faint organic plasma in the water between the colonies. Kept to a 0.04
    // ceiling: this term is a smooth full-frame field, so any more of it just
    // re-creates the flat wash it is supposed to hint at.
    float haze = sin(uv.x * 8.0 + t) * cos(uv.y * 8.0 - t)
               + 0.5 * sin(uv.x * 3.1 - uv.y * 4.3 + t * 0.7);
    col += imgPalette(0.3) * (0.04 * (0.5 + 0.5 * haze)) * (0.45 + 0.55 * audioLevel);

    // No gamma lift here any more -- pow(col, 0.86) raised the dark water by a
    // quarter, which is exactly the wrong end of the picture to touch.
    vec3 _catTone = clamp(col, 0.0, 1.0);
    _catTone /= 1.0 + 0.30 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
