//@doc
 * @brief RAW SILK SLUB SHIMMER: raw silk: irregular threads with knots that shimmer in changing colours; the photo sets the colour of warp and weft, and the shimmer wanders.  Vertical warp threads of varying thickness with slubs (thick places), horizontal weft threads with another colour, plain weave; the sheen
 * is a colour shift that depends on the thread's angle to the wandering light.
 *
 * Audio Reactivity (structure, not only light):
 *   audioRoughness -> the density of the slubs
 *   audioAdvance   -> the shimmer wanders (integrated)
 *
 * Knobs: sizeP (the thread width), hueP.
//@params sizeP
//@audio audioRoughness audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float W = 0.008 + 0.01 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / W;
    vec2 ci = floor(g);
    vec2 f = fract(g);
    float la = 0.02 * audioAdvance + 0.04 * sceneTime;
    float hw = hash21(vec2(ci.x, 3.0));
    float hf = hash21(vec2(ci.y, 9.0));
    float slubW = smoothstep(1.0 - (0.15 + 0.3 * clamp(audioRoughness, 0.0, 1.0)), 1.0, noise2(vec2(ci.x * 0.7, p.y * 14.0 + 3.0 * hw)));
    float slubF = smoothstep(1.0 - (0.15 + 0.3 * clamp(audioRoughness, 0.0, 1.0)), 1.0, noise2(vec2(ci.y * 0.7, p.x * 14.0 + 5.0 * hf)));
    float wWarp = 0.7 + 0.3 * slubW;
    float wWeft = 0.7 + 0.3 * slubF;
    float over = mod(ci.x + ci.y, 2.0);
    float tw = over < 0.5 ? 1.0 : 0.0;
    vec3 cw = imgLod(vec2(p.x, p.y) * 0.85 + 0.5, 1.5);
    vec3 cf = imgLod(vec2(p.x + 0.04, p.y - 0.03) * 0.85 + 0.5, 1.5);
    cw = mix(vec3(luma(cw)), cw, 1.4);
    cf = mix(vec3(luma(cf)), cf, 1.4).bgr * vec3(1.05, 1.0, 0.9);
    float across = tw > 0.5 ? f.x : f.y;
    float cyl = sqrt(max(1.0 - pow(2.0 * across - 1.0, 2.0), 0.0));
    float thick = tw > 0.5 ? wWarp : wWeft;
    vec3 base = tw > 0.5 ? cw : cf;
    float ang = (tw > 0.5 ? 0.0 : 1.5707963) + la;
    vec3 shim = 0.5 + 0.5 * cos(6.2831853 * (vec3(0.0, 0.33, 0.67) + 0.4 * cos(ang * 2.0 + 3.0 * across)));
    vec3 col = base * (0.35 + 0.8 * cyl) * (0.6 + 0.5 * thick) + shim * pow(cyl, 4.0) * 0.35 * (0.5 + 0.5 * slubW * 0.0 + 0.5);
    finish(col * 1.2);
}
