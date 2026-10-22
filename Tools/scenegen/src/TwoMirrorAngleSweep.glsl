//@doc
 * @brief TWO MIRROR ANGLE SWEEP: two mirrors hinged at the centre, their angle wandering: at 60, 45 or 36 degrees the
 * images close into a rosette, between those angles the last image is cut by the mirror and overlaps the first as
 * a ghost.  Optics: a view ray in the direction theta meets the mirrors floor(theta / a) times, so the sector it
 * falls into decides the image and its brightness (every bounce costs a tenth of the light); in the sector that
 * does not fit, two partial images lie over each other, each at half strength.  The object between the mirrors is
 * a piece of the photo, lit in one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the angle glides with the chord changes between 60, 45, 36 and 30 degrees (and through the
 *                       ghostly angles in between)
 *   audioAdvance     -> the object turns slowly between the mirrors (integrated)
 *   audioSwell       -> the object's glow
 *
 * Knobs: objectP (how large the object is), ghostP (how strong the ghost images are), hueP.
//@params objectP ghostP
//@audio audioHarmAdvance audioSwell
//@body
/**  The object between the mirrors at a point of the first sector (polar: radius r, angle t within 0..a).
 *
 * @param r    The radius. (in)
 * @param t    The angle. (in)
 * @param rot  The object's turn. (in)
 * @param sz   The object's size. (in)
 * @param fh   The colour family. (in)
 *
 * @return
 *   The light.
 **/
vec3 objectAt(float r, float t, float rot, float sz, float fh)
{
    // the object fills the space between the mirrors: a piece of the photo, turning slowly
    vec2 q = r * vec2(cos(t), sin(t));
    vec2 uv = rot2(rot) * (q - vec2(0.35, 0.1)) / sz + 0.5;
    vec3 photo = imgLod(uv, 0.8);
    vec3 tone = famCol(fh, 0.15 + 0.7 * luma(photo)) * (0.25 + 1.2 * luma(photo));
    return tone * (0.75 + 0.25 * smoothstep(1.6, 0.2, r)) + famLight(fh, 0.5, 0.5) * exp(-r * 5.0) * 0.1;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    // the angle wanders through 60, 45, 36, 30 degrees and the ghostly angles between
    float steps = 3.0 + 1.5 * (1.0 - cos(0.55 * h)) + 0.5 * sin(0.23 * h);   // pi / a: 3 .. 6
    float a = 3.14159265 / steps;
    float rot = 0.04 * sceneTime + 0.2 * audioAdvance;
    float sz = 0.7 + 0.6 * clamp(objectP, 0.0, 1.0);
    float ghost = 0.5 + 0.5 * clamp(ghostP, 0.0, 1.0);
    float r = length(p) * 1.3;
    float th = atan(p.y, p.x) + 3.14159265;                     // 0 .. 2 pi, the hinge behind the eye at angle pi
    // the images counted from the first mirror (anticlockwise) and from the second (clockwise); they meet behind
    // the hinge, where -- unless the angle divides the circle -- the two partial images overlap as ghosts
    float k = floor(th / a), t = th - k * a;
    if (mod(k, 2.0) > 0.5) t = a - t;
    float th2 = 6.2831853 - th;
    float k2 = floor(th2 / a), t2 = th2 - k2 * a;
    if (mod(k2, 2.0) > 0.5) t2 = a - t2;
    vec3 cA = objectAt(r, t, rot, sz, fh) * pow(0.9, k);
    vec3 cB = objectAt(r, t2, rot, sz, fh) * pow(0.9, k2);
    float w = smoothstep(-0.5 * a, 0.5 * a, th - 3.14159265);
    float both = 1.0 - abs(2.0 * w - 1.0);                       // 1 where the two images meet
    vec3 col = mix(cA, cB, w) * (1.0 - 0.5 * both) + (cA + cB) * 0.5 * both * ghost * 0.6;
    float edge = mix(min(t, a - t), min(t2, a - t2), step(0.5, w)) * r;
    col *= 0.9 + 0.4 * clamp(audioSwell, 0.0, 1.0);
    col *= smoothstep(0.0, 0.004, edge);                         // the mirrors' edges: fine dark seams
    finish(col);
}
