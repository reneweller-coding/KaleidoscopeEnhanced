//@doc
 * @brief ANTIPODAL DISK PHOTO: a hemisphere drawn as a disc whose opposite boundary points are the same point (the projective plane): the photo runs across the rim and appears opposite, mirrored, while the rest of the plane,
 * beyond the disc, is folded in through the circle -- the whole picture is the one disc, seen from inside and outside.  A thin line marks the rim; the whole turns with the phase of the music, the disc breathes with the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the turn (integrated)
 *   audioSwell      -> the disc breathes
 *
 * Knobs: sizeP (the size of the disc), hueP.
//@params sizeP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float R = (0.25 + 0.2 * clamp(sizeP, 0.0, 1.0)) * (0.95 + 0.1 * clamp(audioSwell, 0.0, 1.0));
    float r = length(p) + 0.0005;
    vec2 q = r < R ? p : -R * R * p / (r * r);
    q = rot2(0.1 * audioPhase + 0.01 * sceneTime) * q;
    float rm = r < R ? 0.0 : 1.0;
    float rim = exp(-pow((r - R) / 0.006, 2.0));
    vec3 c = imgLod(q * 0.8 * (0.5 / R) * 0.9 + 0.5, 0.6 + 2.0 * rm * smoothstep(R, 3.0 * R, r));
    finish(c * (rm > 0.5 ? 0.8 : 1.05) + 0.5 * rim);
}
