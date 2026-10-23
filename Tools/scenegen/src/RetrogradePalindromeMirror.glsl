//@doc
 * @brief RETROGRADE PALINDROME MIRROR: a palindrome: the picture runs forward through a deformation and then backward through the same one, so that the middle of the phrase is the point of mirroring; whoever compares the two halves sees crab canons.  The left half runs the deformation in the
 * phrase's own time, the right half in the time reversed, and both meet when the phrase is half over.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the phrase's time: the mirror point is its middle (periodic)
 *   audioAdvance   -> the kind of deformation slowly turns
 *
 * Knobs: sizeP (the strength of the deformation), hueP.
//@params sizeP
//@audio audioAdvance audioPhrasePos
//@body
/**  The deformation of the palindrome: a twist, a zoom wave and a small shift, all scaled by s.
 *
 * @param p  The point. (in)
 * @param s  The share of the deformation 0..1. (in)
 * @param kind  The phase of the kind of deformation. (in)
 * @param A  The strength. (in)
 *
 * @return
 *   The deformed point.
 **/
vec2 deform(vec2 p, float s, float kind, float A)
{
    float r = length(p);
    float tw = A * s * exp(-r * r * 2.5) * 2.2;
    vec2 q = rot2(tw) * p;
    float zz = 1.0 + A * s * 0.35 * sin(5.0 * r - kind);
    q /= zz;
    q += A * s * 0.1 * vec2(sin(4.0 * q.y + kind), cos(4.0 * q.x - kind));
    return q;
}
void main()
{
    vec2 p = screenP();
    float tau = audioPhrasePos;
    float sF = 1.0 - abs(2.0 * tau - 1.0);
    float sB = 1.0 - sF;
    float A = 0.5 + 0.9 * clamp(sizeP, 0.0, 1.0);
    float kind = 0.05 * audioAdvance + 0.03 * sceneTime;
    float side = smoothstep(-0.01, 0.01, p.x);
    vec2 pf = deform(p, sF, kind, A);
    vec2 pb = deform(vec2(-p.x, p.y), sF, kind, A);
    vec3 cf = imgLod(pf * 0.85 + 0.5, 0.5);
    vec3 cb = imgLod(vec2(-pb.x, pb.y) * 0.85 + 0.5, 0.5);
    vec3 col = mix(cf, cb, side);
    float seam = 1.0 - smoothstep(0.0, 0.004, abs(p.x));
    finish(col * 1.1 + seam * 0.15);
}
