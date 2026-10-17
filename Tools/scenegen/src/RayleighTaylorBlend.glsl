//@doc
 * @brief RAYLEIGH-TAYLOR BLEND: heavy fluid over light -- the interface between two photos buckles, fingers of the
 * heavy one sink, plumes of the light one rise, and their heads roll up into mushroom caps.  Two interfaces,
 * mirrored top and bottom, fill the frame; the plumes grow over a phrase, the caps curl ever further, and at the
 * phrase's one the fluids settle back into their layers and the instability begins again.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the plumes' growth over the phrase (they settle back at its one, continuously)
 *   audioLevel      -> the Atwood number: loud music drives the plumes further
 *   audioBuildUp    -> a build-up makes the plumes shoot
 *   audioKick       -> the interface flashes (light)
 *
 * Knobs: fingersP (how many fingers), curlP (how much the caps roll up), wobbleP (how unevenly the fingers grow), hueP.
//@params fingersP curlP wobbleP
//@audio audioKick audioBuildUp audioPhrasePos
//@body
void main()
{
    vec2 p = screenP();
    float prog = audioPhrasePos > 0.001 ? audioPhrasePos : fract(sceneTime / 16.0);
    // growth over the phrase, settling back in its last tenth
    float grow = smoothstep(0.0, 0.7, prog) * (1.0 - smoothstep(0.9, 1.0, prog));
    float drive = 0.6 + 0.5 * clamp(audioLevel, 0.0, 1.0) + 0.5 * clamp(audioBuildUp, 0.0, 1.0);
    float n = 5.0 + 4.0 * floor(clamp(fingersP, 0.0, 0.999) * 3.0);
    // two interfaces at y = +-0.25, mirrored: work in the upper half's frame
    float side = p.y >= 0.0 ? 1.0 : -1.0;
    vec2 q = vec2(p.x, abs(p.y) - 0.25);
    float col_i = floor(q.x * n + 0.5);
    float cx = (col_i) / n;
    float dir = mod(col_i, 2.0) < 0.5 ? -1.0 : 1.0;             // heavy fingers sink, light plumes rise, in turn
    float wob = 1.0 + (0.6 * clamp(wobbleP, 0.0, 1.0)) * (hash11(col_i * 1.7 + side) - 0.5);
    float H = 0.22 * grow * drive * wob;                        // how far the tips have travelled
    vec2 tip = vec2(cx, dir * H);
    // the caps: the fluid around each tip rolls up, the two sides turning opposite ways
    vec2 d = q - tip;
    float w = 0.35 / n;
    float roll = (1.5 + 3.0 * clamp(curlP, 0.0, 1.0)) * grow * exp(-dot(d, d) / (w * w));
    float s = (d.x >= 0.0 ? 1.0 : -1.0) * dir;
    vec2 qr = tip + rot2(s * roll) * d;
    // the interface: a stem from the layer to the tip, narrow, ending in the cap
    float stem = exp(-pow((qr.x - cx) * n * 3.0, 2.0));
    float iface = dir * H * stem + 0.01 * sin(qr.x * n * 6.2831853 * 0.5);
    float dd = qr.y - iface;
    float heavyW = smoothstep(-0.006, 0.006, dd);              // above the interface: the heavy fluid
    vec2 uv = p * 0.75 + 0.5 + 0.02 * vec2(sin(roll), cos(roll)) * grow;
    vec3 heavy = imgLod(uv, 0.4), light = imgLod(vec2(uv.x + 0.41, 1.0 - uv.y), 0.4);
    vec3 tH = imgPalette(0.05 + 0.03 * audioPhase), tL = imgPalette(0.55 + 0.03 * audioPhase);
    vec3 col = mix(mix(light, light * tL * 1.6, 0.3) * 0.75, mix(heavy, heavy * tH * 1.4, 0.2), heavyW);
    col += mix(mix(tH, tL, 0.5), vec3(1.0), 0.5) * exp(-dd * dd * 20000.0) * (0.3 + 0.6 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}
