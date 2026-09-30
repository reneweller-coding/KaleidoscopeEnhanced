//@doc
 * @brief TEXTURE MIRROR SEAMS WANDER: a kaleidoscope without straight
 * mirrors -- the photograph is reflected across curved seams that wander
 * over the plane like slow rivers: wherever a seam passes, the picture on
 * one side appears mirrored on the other, and where several seams cross,
 * the reflections multiply into rosettes that form, drift and dissolve.
 * The seams glow faintly like the edges of liquid glass.  An endless
 * field, mirrorable, never repeating the same rosette twice.
 *
 * Each seam is the zero line of a smooth field f; a point is mirrored by
 * stepping back across the zero line along the gradient (p - 2 f grad f /
 * |grad f|^2), which gives an exact local reflection.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the seams wander (integrated, jump-free)
 *   audioPhase      -> the whole picture turns (integrated)
 *   audioSpread     -> how many seams are active (blended)
 *   audioRoughness  -> the seams meander more finely
 *   audioMode       -> the seam glow warms in major
 *   audioHigh       -> the seams glint (light)
 *
 * Knobs: seamsP (base seam count), scaleP (how close), curveP (how curved), hueP.
//@params seamsP scaleP curveP
//@audio audioPhase audioSpread audioRoughness audioMode audioHigh
//@body
float gT, gCurve, gRough;

// Seam k: a smooth curve line field f_k(p) = dot(p - c, n) + curve * noise.
float seamF(vec2 p, float k)
{
    float a = hash11(k * 3.7) * 6.28 + gT * (0.05 + 0.03 * hash11(k)) * (mod(k, 2.0) < 0.5 ? 1.0 : -1.0);
    vec2 n = vec2(cos(a), sin(a));
    vec2 c = vec2(sin(gT * 0.07 + k * 2.1), cos(gT * 0.06 + k * 1.3)) * 0.6;
    return dot(p - c, n) + gCurve * 0.35 * (noise2(p * (0.8 + gRough * 1.2) + k * 7.0 + gT * 0.05) - 0.5);
}

void main()
{
    vec2 p = screenP();
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    gT = sceneTime * 0.8 + 6.0 * audioAdvance;
    gCurve = 0.4 + 1.2 * clamp(curveP, 0.0, 1.0);
    gRough = clamp(audioRoughness, 0.0, 1.0);
    float sc = 1.0 + 1.2 * clamp(scaleP, 0.0, 1.0);
    vec2 q = rot2(0.015 * sceneTime + 0.2 * audioPhase) * p * sc;
    float nS = 2.0 + 2.0 * clamp(seamsP, 0.0, 1.0) + 1.5 * clamp(audioSpread, 0.0, 1.0);

    // Reflect across every seam the point lies on the negative side of;
    // repeat a few passes so crossings multiply into rosettes.
    float glow = 0.0;
    for (int pass = 0; pass < 2; ++pass) {
        for (int k = 0; k < 7; ++k) {
            float fk = float(k);
            float w = smoothstep(fk - 0.5, fk + 0.5, nS);
            if (w <= 0.0) continue;
            float f = seamF(q, fk);
            float e = 0.01;
            vec2 g = vec2(seamF(q + vec2(e, 0.0), fk) - f, seamF(q + vec2(0.0, e), fk) - f) / e;
            float gl = dot(g, g) + 1e-4;
            if (pass == 0) glow += w * exp(-abs(f) / sqrt(gl) * resolution.y / sc * 0.25);
            if (f < 0.0) q = mix(q, q - 2.0 * f * g / gl, w);
        }
    }
    vec2 uv = q * 0.35 + 0.5;
    vec3 col = imgLod(uv, 0.3);
    float m = luma(imgLod(uv, 8.0));
    col = (col - m) * 1.4 + m;
    vec3 hueF = hsv2rgb(vec3(fract(hueP * 0.159 + 0.25 * fbm3(q * 0.5)), 0.7, 1.0));
    col *= mix(vec3(1.0), mix(glowColour(imgLod(uv, 5.0), q * 0.4, hueP * 0.159), hueF, 0.5) * 1.35, 0.45);
    vec3 seamC = mix(vec3(0.7, 0.85, 1.0), vec3(1.0, 0.8, 0.55), clamp(audioMode, 0.0, 1.0));
    col += seamC * glow * (0.06 + 0.3 * hi);
    finish(col * 1.05);
}
