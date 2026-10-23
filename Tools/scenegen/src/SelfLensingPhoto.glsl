//@doc
 * @brief SELF LENSING PHOTO: the photo as mass: its brightness bends space and deflects the picture itself, like a gravitational lens field made of the photo's own brightness; Einstein rings and arcs form round the bright places, the
 * photo's bright blobs seen again and again as rings of themselves.  The deflection is summed over a net of mass points taken from the softened photo, the lens map shifted against the source by an offset that wanders.  The mass scale
 * follows the swell, the offset the phase of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the mass scale (the strength of the lens)
 *   audioPhase      -> the lens map shifts against the source (integrated)
 *
 * Knobs: massP (the base mass), hueP.
//@params massP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float t = 0.02 * sceneTime + 0.1 * audioPhase;
    vec2 off = 0.2 * vec2(sin(t), cos(0.8 * t));
    vec2 alpha = vec2(0.0);
    for (int j = 0; j < 5; ++j) {
        for (int i = 0; i < 9; ++i) {
            vec2 q = vec2((float(i) + 0.5) / 9.0 - 0.5, (float(j) + 0.5) / 5.0 - 0.5) * vec2(asp, 1.0);
            float m = luma(imgLod((q + off) * 0.8 + 0.5, 4.0));
            m = m * m;
            vec2 d = p - q;
            alpha += m * d / (dot(d, d) + 0.012);
        }
    }
    float k = (0.004 + 0.01 * clamp(massP, 0.0, 1.0)) * (0.5 + 1.0 * clamp(audioSwell, 0.0, 1.0));
    vec2 src = p - k * alpha;
    finish(imgLod(src * 0.8 + 0.5, 0.7) * 1.08);
}
