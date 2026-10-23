//@doc
 * @brief PAPER STRIP BASKET WEAVE: basket weave of paper strips: the photo is cut into strips and woven over and under, and the shifting of the strips lets the crossings wander.  Horizontal and vertical strips each show the photo displaced by an amount of their own; at a crossing the strip that lies on top follows
 * a checkerboard, and the one below is shadowed.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the strips shift (integrated)
 *   audioSpread  -> the number of strips (smoothed)
 *
 * Knobs: sizeP (the strip width), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float W = (0.07 + 0.08 * clamp(sizeP, 0.0, 1.0)) * (1.0 + 0.2 * clamp(audioSpread, 0.0, 1.0));
    vec2 g = p / W;
    vec2 ci = floor(g);
    vec2 f = fract(g);
    float t = 0.01 * audioAdvance + 0.02 * sceneTime;
    float hr = hash21(vec2(ci.y, 1.0));
    float hc = hash21(vec2(ci.x, 2.0));
    vec2 uvH = vec2(p.x + (hr - 0.5) * 0.6 * sin(t * 3.0 + 6.28 * hr), p.y) * 0.85 + 0.5;
    vec2 uvV = vec2(p.x, p.y + (hc - 0.5) * 0.6 * sin(t * 3.0 + 6.28 * hc)) * 0.85 + 0.5;
    vec3 cH = imgLod(uvH, 0.6);
    vec3 cV = imgLod(uvV, 0.6);
    cH = mix(vec3(luma(cH)), cH, 1.2);
    cV = mix(vec3(luma(cV)), cV, 1.2) * vec3(0.92, 0.95, 1.05);
    float par = mod(ci.x + ci.y, 2.0);
    float topH = par < 0.5 ? 1.0 : 0.0;
    float shadH = exp(-min(f.x, 1.0 - f.x) * 10.0) * 0.45;
    float shadV = exp(-min(f.y, 1.0 - f.y) * 10.0) * 0.45;
    vec3 col = topH > 0.5 ? cH * (1.0 - shadV * 0.0) : cV;
    col *= topH > 0.5 ? (1.0 - 0.0) : 1.0;
    float shadow = topH > 0.5 ? 0.0 : 0.0;
    float curl = 0.85 + 0.2 * (topH > 0.5 ? sin(3.1416 * f.x) : sin(3.1416 * f.y));
    float stripEdge = topH > 0.5 ? min(f.y, 1.0 - f.y) : min(f.x, 1.0 - f.x);
    float edge = smoothstep(0.0, 0.05, stripEdge);
    float under = topH > 0.5 ? exp(-min(f.x, 1.0 - f.x) * 14.0) : exp(-min(f.y, 1.0 - f.y) * 14.0);
    col = col * curl * (0.35 + 0.65 * edge) * (1.0 - 0.35 * under);
    finish(col * 1.15);
}
