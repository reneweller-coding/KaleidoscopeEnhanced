//@doc
 * @brief BULLSEYE MIRROR RINGS: concentric rings in which every second one inverts the photo on a circle (turned inside out radially): the middle is the plain photo, and the rings change between the mirror image and the plain
 * image, so that the picture reads from the centre outward as photo, reflection, photo again; the rings run outward with the drive of the music and their number follows the spectral spread.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the number of rings
 *   audioAdvance    -> the rings run outward (integrated)
 *
 * Knobs: zoomP (the zoom into the photo), hueP.
//@params zoomP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    float r = length(p) + 0.0005, a = atan(p.y, p.x);
    float N = (3.5 + 5.0) * (0.6 + 0.8 * clamp(audioSpread, 0.0, 1.0));
    float s = r * N - 0.03 * audioAdvance - 0.01 * sceneTime;
    float k = floor(s);
    float f = fract(s);
    float rk = (k + 0.0 + 0.03 * audioAdvance + 0.01 * sceneTime) / N;
    float rr = mod(k, 2.0) < 0.5 ? r : (2.0 * (k + 0.5 + 0.03 * audioAdvance + 0.01 * sceneTime) / N - r);
    vec2 q = abs(rr) * vec2(cos(a), sin(a)) * (0.7 + 0.9 * clamp(zoomP, 0.0, 1.0));
    vec3 c = imgLod(q * 0.8 + 0.5, 0.7);
    float joint = smoothstep(0.0, 0.05, f) * smoothstep(1.0, 0.95, f);
    finish(c * (0.7 + 0.3 * joint) * 1.08);
}
