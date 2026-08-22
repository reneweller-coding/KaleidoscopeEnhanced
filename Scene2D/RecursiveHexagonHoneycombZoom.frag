#version 330 core
out vec4 fragColor;
/**
 * @file RecursiveHexagonHoneycombZoom.frag
 * @brief RECURSIVE HEXAGON HONEYCOMB ZOOM: Infinite logarithmic zoom dive through
 * nested hexagonal honeycomb cells. Each honeycomb gate contains rotating sub-lattices
 * that break open into glowing neon crystal walls with dimensional burst flashes.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous infinite logarithmic zoom progression
 *   audioKick    -> flashes honeycomb cell walls & triggers lattice shatter bursts
 *   audioCentroid-> modulates honeycomb rotation phase & fine wall grid resolution
 *   audioSubBass -> expands hexagonal cell diameter breathing
 *   audioChromaHue-> rotates the luminous honeycomb rainbow palette
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
uniform float scaleP;
uniform float wallWidthP;
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

// 2D Hexagonal grid coordinate & distance calculation
vec4 hexGrid(vec2 p) {
    vec2 s = vec2(1.0, 1.7320508);
    vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / vec4(s, s)) + 0.5;
    vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
    return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hC.xy) : vec4(h.zw, hC.zw + 0.5);
}

// 2D Hexagon SDF
float sdHex(vec2 p, float r) {
    const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
    p = abs(p);
    p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
    p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
    return length(p) * sign(p.y);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float scMod = (scaleP > 0.01) ? scaleP : 1.0;
    float wWidth = (wallWidthP > 0.01) ? wallWidthP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    // The dive only advanced on audioAdvance (~0.25 units/s on quiet material).
    // Constant base rate + audio surge; the coefficient on `time` is a
    // per-activation constant, so this is anti-flicker safe.
    float t = time * 0.32 * spd + audioAdvance * 0.35 * spd;

    // Logarithmic scale dive for seamless infinite honeycomb zoom
    float zoomProg = t * 0.8;
    float zoomFrac = mod(zoomProg, 1.0);

    vec3 colAcc = vec3(0.0);
    float weightAcc = 0.0;

    // Accumulate across 5 nested honeycomb octaves.
    // The old ladder ran layerScale = exp((k - zoomFrac)*1.2)*2.5 over k=0..4:
    //   - k=0 had (k - zoomFrac) < 0 for EVERY zoomFrac, so smoothstep(0.0,0.3,.)
    //     was 0 and the nearest, most readable octave was `continue`d away always;
    //   - the surviving octaves reached layerScale 90..300, i.e. 100+ hex cells
    //     across the frame, far past what the picture can resolve -- they aliased
    //     into a flat wash of the photo's average colour.
    // A gentler log step over a depth that starts at the near plane keeps every
    // octave at a scale the eye can actually read.
    for (int k = 0; k < 5; k++) {
        float kf = float(k);
        float lz = kf + 0.55 - zoomFrac;            // 0.55 .. 4.55, always > 0
        float layerScale = exp(lz * 0.85) * (1.5 * scMod);
        float layerFade = smoothstep(0.0, 0.55, lz) * smoothstep(4.6, 3.1, lz);

        if (layerFade <= 0.001) continue;

        // Rotating coordinate per honeycomb level
        // Centroid enters as a static phase OFFSET, never as a factor on the
        // t-driven term -- scaling the rate would remap the whole accumulated
        // spin in one frame and strobe.
        float rotA = t * 0.15 * (k % 2 == 0 ? 1.0 : -1.0) + kf * 0.5 + 0.5 * audioCentroid;
        float cs = cos(rotA), sn = sin(rotA);
        vec2 pHex = mat2(cs, -sn, sn, cs) * uv * layerScale;

        vec4 hInfo = hexGrid(pHex);
        vec2 hPos = hInfo.xy;
        vec2 hID = hInfo.zw;

        // Distance to hexagon wall. Decay must SHARPEN (not soften) at deeper
        // octaves: dividing by layerScale made the falloff gentler the further
        // zoomed-in a layer was, so every deep octave's glow bloomed across
        // its ENTIRE cell instead of tracing just the wall -- flooding the
        // accumulated average with near-white. Multiplying keeps apparent
        // wall thickness roughly constant in screen space at every depth.
        // Sub-bass swells the cell circumradius (cells grow, walls ride
        // outward with them); centroid steepens the wall falloff so bright
        // material resolves a thin crisp grid instead of a soft one.
        float dWall = abs(-sdHex(hPos, 0.52 * (1.0 + 0.30 * audioSubBass))) - 0.04 * wWidth;

        // Wall thickness in SCREEN units. hPos lives in layer space (pHex =
        // uv*layerScale), so a fixed decay constant times layerScale made the glow
        // line thinner and thinner the deeper the octave -- exactly the octaves
        // that dominate the sum -- until it was sub-pixel and vanished, leaving
        // nothing but the aliased cell fill. Dividing by layerScale instead holds
        // the apparent wall thickness constant at every depth, which is what the
        // original comment was reaching for.
        float dScreen = abs(dWall) / max(layerScale, 1e-4);
        float wallGlow = exp(-dScreen * ((80.0 + 45.0 * audioCentroid) / wWidth)) * glw;

        // Cell fill. Only the near octaves can resolve a photo crop; deeper ones
        // contribute the flat palette tone, dimmed with depth so the stack reads
        // as a tunnel receding into darkness rather than as one averaged level.
        float resolvable = smoothstep(3.6, 1.6, lz);
        vec2 sampleUV = fract(hPos * 0.4 + 0.5);
        vec3 texCol = img(sampleUV);
        vec3 palCol = imgPalette(sin(dot(hID, vec2(12.3, 45.6))) * 0.5 + 0.5);

        float depthDim = exp(-lz * 0.62);
        vec3 cellCol = mix(palCol, texCol, 0.55 * resolvable) * (0.20 + 0.80 * depthDim);
        cellCol += vec3(1.3, 1.1, 1.8) * wallGlow * (0.55 + 0.45 * depthDim)
                                       * (1.0 + 2.0 * audioKick);

        colAcc += cellCol * layerFade;
        weightAcc += layerFade;
    }

    // Composite, not average: dividing by weightAcc blended four octaves of hex
    // lattice into a single uniform tone (measured contrast 0.017). A bounded sum
    // keeps the near octave's structure on top of the receding ones.
    vec3 finalCol = min(colAcc * 0.62, vec3(1.0));
    // Measured contrast was near zero: the octaves summed to a uniform
    // pale field.  Stretch about the mean so the cells read as cells.
    finalCol = clamp((finalCol - 0.34) * 2.10 + 0.16, 0.0, 1.0);

    // Center portal burst
    float portalPulse = pow(max(0.0, 1.0 - abs(zoomFrac - 0.5) * 4.0), 3.0) * (0.5 + 1.2 * audioKick);
    finalCol += min(imgPalette(0.85) * portalPulse, vec3(0.5));

    finalCol = pow(min(finalCol, vec3(1.0)), vec3(0.88));
    finalCol /= 1.0 + 0.55 * max(finalCol.r, max(finalCol.g, finalCol.b));   // over-bright tail (final review)
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
