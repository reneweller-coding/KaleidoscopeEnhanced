#version 330 core
out vec4 fragColor;
/**
 * @file RecursiveTesseractZoomAbyss.frag
 * @brief RECURSIVE TESSERACT ZOOM ABYSS: Infinite recursive 4D hypercube dive.
 * Successive nested tesseract cell portals unfold, collapse past the camera,
 * and unleash glowing multidimensional laser wireframes with dimensional flashes.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward plunge through 4D hypercube cells
 *   audioKick    -> triggers dimension-crossing portal flashes & edge burst
 *   audioCentroid-> modulates 4D rotation hyper-plane speed
 *   audioSubBass -> expands tesseract frame breathing
 *   audioChromaHue-> steers the recursive hypercube spectrum
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
uniform float depthP;
uniform float wireP;
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

// Overall level of the photo currently on the texture units, from a fixed 5-tap
// grid. Every base colour here is photo-derived and the accumulator below sums
// up to six of them, so a bright photo pushed the frame to a uniform white wash
// with no readable hypercube structure. The probe rides the tex0/tex1 crossfade
// so the gain can never pop, and one number per frame moves exposure without
// touching local contrast.
float photoLevel() {
    vec3 s = img(vec2(0.25, 0.25)) + img(vec2(0.75, 0.25))
           + img(vec2(0.25, 0.75)) + img(vec2(0.75, 0.75))
           + img(vec2(0.50, 0.50));
    return dot(s * 0.2, vec3(0.299, 0.587, 0.114));
}

// 4D Box distance estimator
float sdBox4D(vec4 p, vec4 b) {
    vec4 d = abs(p) - b;
    return min(max(max(d.x, d.y), max(d.z, d.w)), 0.0) + length(max(d, 0.0));
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float dpth = (depthP > 0.01) ? depthP : 1.0;
    float wireW = (wireP > 0.01) ? wireP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    // The dive only advanced on audioAdvance (~0.25 units/s on quiet material),
    // so the plunge was effectively frozen. Constant base rate + audio surge; the
    // coefficient on `time` is a per-activation constant, so anti-flicker safe.
    float t = time * 0.34 * spd + audioAdvance * 0.32 * spd;

    // Logarithmic scale dive for infinite zoom through tesseract layers
    float zoomSpeed = t * 0.8;
    float cellPhase = mod(zoomSpeed, 1.0);

    vec3 colAcc = vec3(0.0);
    float glowAcc = 0.0;
    float wSum = 0.0;

    // Sum over multiple nested recursive 4D tesseract frames.
    // The old log step of 1.1 put successive frames a factor e^1.1 = 3.0 apart, so
    // only ONE nested square ever landed inside the visible band and everything
    // else collapsed into a knot of hairlines at the centre - a small motif on a
    // big empty field. A step of 0.62 (factor 1.86) with more layers puts four to
    // five frames across the screen at once, which is the same infinite dive, just
    // actually filling it.
    for (int k = 0; k < 9; k++) {
        float kf = float(k);
        float layerScale = exp((kf - cellPhase) * 0.62) * dpth;
        float layerFade = smoothstep(0.0, 0.3, kf - cellPhase) * smoothstep(8.6, 6.0, kf - cellPhase);

        if (layerFade <= 0.001) continue;

        vec2 pLayer = uv * layerScale;

        // 4D Rotation angles. Brightness may not scale the accumulated angle
        // itself (that would remap the whole phase in one frame); it rides on
        // top as a bounded extra offset, so a rising centroid still swings the
        // hyper-plane forward -- i.e. it adds to the rotation RATE for as long
        // as the timbre keeps brightening, then relaxes.
        float rotXY = t * 0.2 + kf * 0.4 + 1.6 * audioCentroid;
        float rotZW = t * 0.15 + audioPhase * 0.1 + 1.2 * audioCentroid;

        // Project 2D screen into 4D tesseract coordinates
        vec4 p4 = vec4(pLayer, sin(kf * 1.2 + t * 0.4), cos(kf * 1.2 + t * 0.4));

        // 4D Rotations
        float c1 = cos(rotXY), s1 = sin(rotXY);
        p4.xy = vec2(c1 * p4.x - s1 * p4.y, s1 * p4.x + c1 * p4.y);
        float c2 = cos(rotZW), s2 = sin(rotZW);
        p4.zw = vec2(c2 * p4.z - s2 * p4.w, s2 * p4.z + c2 * p4.w);

        // Sub-bass swells the frame's half-extent. It is a plain per-frame
        // size parameter (no accumulated phase runs through it), so it can
        // breathe freely -- unlike the rotation angles above.
        float frameR = 1.2 * (1.0 + 0.32 * audioSubBass);

        // Compute distance to 4D wireframe edges
        vec4 q = abs(p4);
        float dOuter = max(max(q.x, q.y), max(q.z, q.w)) - frameR;
        float dInner = max(max(q.x, q.y), max(q.z, q.w)) - (frameR - 0.15);
        float dFrame = max(dOuter, -dInner);

        // 2D Projection edge distance for wireframe lines. The old
        // cornerDist = length(max(q2-1.2,0)) is the correct SDF for OUTSIDE
        // a box, but it is identically 0 for EVERY point still inside the
        // frame (q2.x<1.2 AND q2.y<1.2) -- not just near an actual corner.
        // min(edgeDist, cornerDist) then picked that spurious 0 over
        // edgeDist's real, positive interior falloff across the WHOLE
        // inside of the frame, on every layer, regardless of the
        // layerScale decay-direction fix (which only reshapes falloff for
        // wire>0, i.e. outside the frame -- it can't touch a value that's
        // hard-pinned to 0 inside). Verified numerically: at screen centre
        // the summed edgeGlow across active layers was a near-constant
        // ~4.0-4.6 for EVERY cellPhase, which is why the earlier fix
        // produced no visible change. edgeDist alone already gives the
        // correct thin-outline falloff both inside and outside the frame.
        // Taken from the ROTATED p4.xy, not from raw pLayer: the 4D rotation
        // above only ever fed dFrame, which nothing consumes, so the whole
        // hyper-plane spin was invisible and no audio mapping on it could show.
        vec2 q2 = abs(p4.xy);
        float wire = min(abs(q2.x - frameR), abs(q2.y - frameR));

        // `wire` is measured in LAYER units and spans roughly 0..1.3, while the
        // old decay constant was 25*layerScale*0.15 = 0.4..3.8. exp() of that
        // never actually decays: every pixel of every layer returned 0.1..1.0,
        // six layers summed past 1.0, and min(glowAcc,1.0) then pinned the whole
        // frame to full-intensity wireTint -- a flat white-violet flood with no
        // wires visible in it at all.
        // Converting to SCREEN units (pLayer = uv*layerScale, so screen distance
        // is wire/layerScale) gives a line of constant on-screen thickness, and a
        // decay constant matched to that range makes it an actual thin edge.
        float wireScreen = wire / max(layerScale, 1e-4);
        // 78 rather than 46: the layer count went from 6 to 9 above, so the same
        // line width would have put half again as much lit area on screen and the
        // capped glow sum would flatten out into a solid violet field. Thinner
        // lines, more of them -- which is what a receding hypercube stack is.
        float edgeGlow = exp(-wireScreen * (78.0 / wireW)) * layerFade * glw;

        // Sample texture inside the tesseract cell face
        vec2 sampleUV = fract(pLayer * 0.25 + 0.5);
        vec3 texCol = img(sampleUV);
        vec3 palCol = imgPalette(kf * 0.2 + t * 0.1);

        // Depth shading: near cells bright, far cells sinking into the abyss.
        // Six equally-lit layers averaged to one flat mid-level.
        // (exponent rescaled with the smaller log step above so the dive still
        // fades over the same physical depth, not over the same layer index)
        float depthShade = exp(-(kf - cellPhase) * 0.31);
        // Deep layers are sampled at pLayer = uv * layerScale with layerScale up
        // to ~145, i.e. the photo tiles dozens of times across the frame and
        // aliases into its own average -- a flat wash that swamps the near
        // layers. Only the resolvable octaves carry a photo crop; the far ones
        // contribute the flat palette tone.
        float resolvable = smoothstep(4.6, 1.6, kf - cellPhase);
        vec3 cellCol = mix(palCol, texCol, 0.55 * resolvable);
        float w = layerFade * depthShade;
        colAcc += cellCol * w;
        wSum   += w;

        glowAcc += edgeGlow;
    }

    // Weighted average rather than a raw sum: nine layers of a bright photo used
    // to stack straight past white (measured luma 0.823 at contrast 0.012 - one
    // flat wash). Normalising keeps the depth ordering while bounding exposure.
    colAcc /= max(wSum, 1e-3);
    colAcc *= 0.62 * clamp(0.40 / max(0.06, photoLevel()), 0.55, 1.70);

    // Add glowing hypercube wireframe lines once, from the TOTAL glow
    // accumulated across layers (capped) rather than per-layer -- several
    // octaves' frames can still overlap near true wire crossings, and an
    // uncapped per-layer add let those crossings stack past white.
    vec3 wireTint = min(vec3(1.3, 1.0, 1.8) * min(glowAcc, 1.2) * (1.0 + 2.0 * audioKick),
                        vec3(1.0, 0.85, 1.0));
    colAcc += wireTint;

    // Portal dimension crossing flash (when cellPhase wraps around)
    float portalFlash = pow(max(0.0, 1.0 - abs(cellPhase - 0.5) * 4.0), 4.0) * (0.4 + 1.2 * audioKick);
    colAcc += min(imgPalette(0.7) * portalFlash, vec3(0.55));

    colAcc = pow(min(colAcc, vec3(1.0)), vec3(0.88));
    // Soft knee on top of the hard cap: pow(x, 0.88) lifts the midtones, so a
    // wire crossing landing on an already-lit cell face still stacked flat
    // against the ceiling. The knee bends those crests over instead.
    vec3 _catTone = clamp(colAcc, 0.0, 1.0);
    _catTone /= 1.0 + 0.26 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
