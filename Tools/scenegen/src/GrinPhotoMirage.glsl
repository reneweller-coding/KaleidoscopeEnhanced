//@doc
 * @brief GRIN PHOTO MIRAGE: the photo as a field of refractive index: a ray from every pixel is bent in a number of steps by the brightness, and the picture seen at the ray's end is like a mirage that swims and gathers itself again;
 * the photo is the medium and the image at once.  The curvature follows the swell of the music, the medium drifts slowly with the drive.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the curvature of the rays
 *   audioAdvance    -> the medium drifts (integrated)
 *
 * Knobs: bendP (the base bending), hueP.
//@params bendP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 off = 0.06 * vec2(sin(0.02 * audioAdvance + 0.01 * sceneTime), cos(0.017 * audioAdvance));
    vec2 x = p;
    vec2 d = normalize(vec2(0.6, 0.8));
    float k = (0.15 + 0.4 * clamp(bendP, 0.0, 1.0)) * (0.5 + 1.0 * clamp(audioSwell, 0.0, 1.0));
    float h = 0.04;
    float e = 0.02;
    for (int i = 0; i < 12; ++i) {
        vec2 uvm = (x + off) * 0.8 + 0.5;
        vec2 g = vec2(luma(imgLod(uvm + vec2(e, 0.0), 3.0)) - luma(imgLod(uvm - vec2(e, 0.0), 3.0)),
                      luma(imgLod(uvm + vec2(0.0, e), 3.0)) - luma(imgLod(uvm - vec2(0.0, e), 3.0))) / (2.0 * e);
        d = normalize(d + k * h * g);
        x += d * h;
    }
    finish(imgLod(x * 0.8 + 0.5, 0.7) * 1.08);
}
