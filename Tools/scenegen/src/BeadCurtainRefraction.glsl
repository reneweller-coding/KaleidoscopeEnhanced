//@doc
 * @brief BEAD CURTAIN REFRACTION: curtains of clear glass beads hang before the photo and break it into thousands of
 * small pictures: every bead is a ball lens showing a tiny upside-down image of what lies behind it; the strands
 * sway, and two curtains, one behind the other, slide apart and together again.  A ball lens turns the picture over
 * and shrinks it: the bead shows the photo at its centre minus k times the offset from it; its rim darkens and a
 * highlight sits up and to the left.  Between the strands the photo shows through, dim and soft.  The photo's colours,
 * calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance       -> the strands sway (integrated: faster with the music's drive)
 *   audioSectionId/Age -> every new section slides the two curtains apart or together (over six seconds)
 *   audioSwell         -> how much of the picture each bead takes in
 *
 * Knobs: beadP (the beads' size), swayP (how far the strands swing), hueP.
//@params beadP swayP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

/**  One curtain at a place: the colour its bead shows there and how much of the place it covers.
 *
 * @param p      The place on screen. (in)
 * @param W      The strands' spacing. (in)
 * @param shift  The curtain's sideways shift. (in)
 * @param sway   The swing's phase. (in)
 * @param amp    The swing's width. (in)
 * @param k      The ball lens' scale (how much of the picture a bead takes in). (in)
 * @param fh     The colour family's hue. (in)
 *
 * @return
 *   rgb the colour, a the cover.
 **/
vec4 curtain(vec2 p, float W, float shift, float sway, float amp, float k, float fh)
{
    // the strands swing from the top: the swing grows downward, with a slow wave running along them
    float x = p.x - shift - amp * (0.6 - p.y) * sin(sway) - 0.3 * amp * sin(3.0 * p.y + 1.3 * sway);
    float i = floor(x / W);
    float H = W * 0.95;
    float st = fract(sin(i * 12.9898) * 43758.5453);                // each strand's beads sit at their own height
    float j = floor(p.y / H + st);
    vec2 c = vec2((i + 0.5) * W, (j + 0.5 - st) * H);
    vec2 d = vec2(x, p.y) - c;
    float R = 0.46 * W;
    float r = length(d) / R;
    if (r > 1.0) return vec4(0.0);
    // the ball lens: the picture through it is turned over and shrunk round the bead's place on screen
    vec2 seen = (p - d) - d * k;
    vec3 c3 = tone(imgLod(seen * 0.6 + 0.5, 1.0), fh);
    float z = sqrt(1.0 - r * r);
    c3 *= 0.45 + 0.75 * z;
    c3 += famLight(fh, 0.6, 0.9) * pow(max(dot(vec3(d / R, z), normalize(vec3(-0.4, 0.5, 0.8))), 0.0), 40.0) * 0.8;
    c3 += famLight(fh, 0.4, 0.5) * smoothstep(0.85, 1.0, r) * 0.15;
    return vec4(c3, smoothstep(1.0, 0.92, r));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float W = 0.045 + 0.03 * clamp(beadP, 0.0, 1.0);
    float amp = 0.02 + 0.04 * clamp(swayP, 0.0, 1.0);
    float sway = 0.25 * sceneTime + 1.0 * audioAdvance;
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float open = mix(mod(max(audioSectionPrev, 0.0), 2.0), mod(max(audioSectionId, 0.0), 2.0), m);
    float k = 2.0 + 2.0 * clamp(audioSwell, 0.0, 1.0);
    float glide = 0.01 * sceneTime + 0.04 * audioAdvance;
    vec3 col = tone(imgLod(p * 0.6 + 0.5, 4.0), fh) * 0.22;         // behind the curtains: dim and soft
    vec4 back = curtain(p, W * 0.8, -0.3 * open - glide, sway + 1.0, amp * 0.8, k * 0.8, fh);
    col = mix(col, back.rgb * 0.7, back.a);
    vec4 front = curtain(p, W, 0.3 * open + glide, sway, amp, k, fh);
    col = mix(col, front.rgb, front.a);
    finish(col);
}
