#version 330 core
out vec4 fragColor;
/**
 * @file MantleConvectionPlume.frag
 * @brief MANTLE CONVECTION PLUME: Deep Earth core-mantle boundary (D'' layer)
 * thermal plumes rising through Rayleigh-Bénard viscous convection cells.
 * Mushrooming basaltic magma diapir heads, subducting tectonic slabs,
 * 3000°C thermal upwelling, and molten rock photo texture distortion.
 *   audioAdvance -> drives viscous mantle convection vorticity flow
 *   audioKick    -> triggers explosive magma diapir eruptions at the lithosphere
 *   audioBass    -> undulates thermal plume stem thickness & buoyancy, and the
 *                   glow of the hot D'' core-mantle boundary layer
 *   audioCentroid-> shifts magma temperature (deep basaltic red to incandescent gold)
 *
 * A whole MANTLE SECTION is shown, not one plume: five diapirs rise from the
 * core-mantle boundary at staggered heights, cold subducting slabs sink between
 * them, and the Rayleigh-Benard roll field carries visible cell structure right
 * out to the frame edges.
 *
 * Per-activation variety:
 *   plumeP   float mantle thermal plume buoyancy & height  (0.5..2.2)
 *   convectP float Rayleigh-Bénard convection cell density  (0.5..2.0)
 *   speedP   float viscous mantle flow velocity            (0.5..2.0)
 *   hueP     float thermal radiation hue offset            (0..6.28)
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

uniform float plumeP;
uniform float convectP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float plm = (plumeP   > 0.0) ? plumeP   : 1.0;
    float cnv = (convectP > 0.0) ? convectP : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.35 * spd + audioAdvance * 0.18;

    // Upwelling convection coordinates (bottom core-mantle boundary y = -0.5 to top lithosphere y = 0.5)
    vec2 p = uv * vec2(5.0 * cnv, 4.2);

    // Rayleigh-Bénard convection vorticity rolls: psi(x, y) = sin(k_x * x) * sin(k_y * y)
    float rollX = sin(p.x + sin(p.y * 2.0 + t) * 0.6);
    float rollY = cos(p.y - t * 1.4) * (0.8 + 0.3 * audioBass);
    float convectionStream = rollX * rollY;

    // Secondary boundary-layer fingering, so the cell field keeps structure
    // all the way into the corners instead of fading to dead rock.
    float fine = sin(p.x * 2.3 + p.y * 1.1 + t * 0.7) * cos(p.y * 2.7 - t * 0.9);
    convectionStream = convectionStream * 0.80 + fine * 0.34;

    float hotRoll  = max(convectionStream, 0.0);
    float coldRoll = max(-convectionStream, 0.0);

    // --- FIVE rising diapirs across the whole section --------------------
    // (one lone central plume left five sixths of the frame empty)
    const int NP = 5;
    float plumeStem  = 0.0;
    float diapirHead = 0.0;
    for (int i = 0; i < NP; ++i)
    {
        float fi = float(i);
        float sd = fract(sin(fi * 12.9898 + 4.1) * 43758.5453);
        float x0 = ((fi + 0.5) / float(NP) * 2.0 - 1.0) * 0.86;
        float ph = sd * 6.2831853;

        // Rising thermal plume stem (upwelling column, widening as it rises)
        float stemX = uv.x - x0 - sin(uv.y * 4.0 - t * 1.6 + ph) * 0.10;
        float stemWidth = (0.045 + 0.032 * (uv.y + 0.5)) * plm * (0.75 + 0.6 * sd);
        plumeStem += exp(-abs(stemX) / max(stemWidth, 0.02)) * (0.75 + 0.35 * sd);

        // Mushrooming diapir head, each one arrested at a different depth
        float headY = 0.10 + 0.32 * fract(sd * 3.7);
        float headDist = length(vec2(stemX * 1.5, uv.y - headY));
        diapirHead += exp(-headDist * 5.0) * (0.55 + 0.45 * sd) * (1.0 + audioKick * 1.2);
    }
    plumeStem  = min(plumeStem,  1.6);
    diapirHead = min(diapirHead, 1.5);

    // Photo texture mapping into molten magma flow (mirrored wrap: the old
    // fract() left an animated seam at the frame edge that read as a JUMP)
    vec2 magmaWarp = st + vec2(rollX, rollY) * 0.04 * (1.0 + audioKick * 0.7);
    vec3 photo = img(abs(fract(magmaWarp * 0.5) * 2.0 - 1.0));

    // Viscous magma temperature palette — pulled off the saturation ceiling
    // (deep basalt, 1500°C ember, molten gold, cold subducted slab)
    vec3 basaltDark   = vec3(0.055, 0.048, 0.052);
    vec3 magmaCrimson = vec3(0.80, 0.36, 0.22);
    vec3 moltenGold   = vec3(0.97, 0.84, 0.55);
    vec3 slabCool     = vec3(0.16, 0.20, 0.26);

    float tempField = clamp(plumeStem * 0.70 + diapirHead * 0.95 + hotRoll * 0.55, 0.0, 1.0);
    vec3 thermalCol = mix(basaltDark, magmaCrimson, tempField);
    // Timbre brightness shifts the magma's colour temperature toward
    // incandescent gold -- the audioCentroid mapping this file's header
    // documents, which nothing in the body actually implemented.  Gold is the
    // least saturated end of the ramp, so this also spends the frame's hottest
    // pixels on its calmest colour rather than its most strident one.
    thermalCol = mix(thermalCol, moltenGold,
                     clamp(pow(tempField, 2.2) * (0.7 + 0.5 * audioSwell + 0.6 * audioCentroid), 0.0, 1.0));

    // Cold downwelling limbs = subducting slabs, so the "empty" half of every
    // convection roll carries content too.
    thermalCol = mix(thermalCol, slabCool, clamp(coldRoll * 0.55, 0.0, 0.55));

    // Hot D'' layer at the core-mantle boundary and the cool lithosphere lid.
    float coreGlow = smoothstep(-0.26, -0.50, uv.y);
    thermalCol += magmaCrimson * coreGlow * (0.20 + 0.13 * audioBass);
    float crust = smoothstep(0.28, 0.50, uv.y);
    thermalCol = mix(thermalCol, slabCool * 0.9, crust * 0.45);

    // Combine visualizer — the cool mantle now shows its rock texture instead
    // of reading as black.
    float mixW = clamp(0.42 + 0.45 * tempField + 0.15 * audioLevel, 0.0, 0.95);
    vec3 col = mix(photo * 0.62, thermalCol, mixW);
    col += diapirHead * vec3(1.0, 0.92, 0.72) * (0.45 + audioKick * 0.8);

    // Bounded hue nudges.  Rotating by the RAW audioChromaHue swung the whole
    // frame right around the wheel as the key slewed: that is the measured
    // frame-to-frame colour jump, and it also drove channels negative, which
    // clips back to a pure primary and re-saturates everything the pull below
    // is there to calm.  hueP could likewise park a whole activation on a hue
    // that has nothing to do with molten rock.  Magma is red-orange; these only
    // inflect it, and sin() keeps both continuous across the wrap.
    col = hueRot(col, 0.20 * sin(audioChromaHue));
    if (hue > 0.001) col = hueRot(col, 0.28 * sin(hue));
    col = max(col, 0.0);

    // Vignette — softened, the old one crushed the corners to black
    float vig = smoothstep(1.45, 0.45, length(uv));
    col *= mix(0.72, 1.0, vig);

    // Catalogue review: pull the magma tones off the saturation ceiling
    // (the old palette left ~40% of the frame fully saturated).
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.66);

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = col * 0.86;
    float _m = max(_catTone.r, max(_catTone.g, _catTone.b));
    _catTone *= 1.0 / (1.0 + max(0.0, _m - 0.72));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
