//@doc
 * @brief SUNBURST HUE RINGS: a sunburst diagram: rings from inside to outside show hue, saturation and brightness of the photo, each ring in segments of different size, and the picture becomes a turning construction of ring segments, every segment filled with the colour of the photo
 * at its own place.  The rings turn against each other at different speeds, and their segment counts differ.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the rings turn (integrated)
 *   audioSwell   -> the swing of the segment sizes
 *
 * Knobs: sizeP (the width of the rings), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float r = length(p);
    float a = atan(p.y, p.x);
    float rw = 0.1 + 0.07 * clamp(sizeP, 0.0, 1.0);
    float r0 = 0.08;
    float ring = floor((r - r0) / rw);
    float fr = fract((r - r0) / rw);
    float N = 6.0 + 6.0 * ring;
    float spd = (ring + 1.0) * (mod(ring, 2.0) < 0.5 ? 1.0 : -1.0);
    float rot = 0.015 * audioAdvance * spd + 0.012 * sceneTime * spd;
    float sw = 0.25 + 0.3 * clamp(audioSwell, 0.0, 1.0);
    float u = (a - rot) / 6.2831853 * N;
    float k = floor(u);
    float fk = fract(u);
    float warp = fk + sw * sin(6.2831853 * fk) / 6.2831853 * 0.0;
    float bnd = k + sw * sin(0.4 * k + 0.1 * sceneTime + ring);
    float uu = u - sw * sin(0.4 * floor(u) + 0.1 * sceneTime + ring) * 0.5;
    float kk = floor(uu);
    float fkk = fract(uu);
    float ang_c = (kk + 0.5) / N * 6.2831853 + rot;
    float rc = r0 + (ring + 0.5) * rw;
    vec2 cp = rc * vec2(cos(ang_c), sin(ang_c));
    vec3 c = imgLod(cp * 0.85 + 0.5 + 0.0, 1.0 + 0.4 * ring);
    float inside = step(0.0, ring) * (1.0 - step(5.5, ring)) * step(r0, r);
    float edge = smoothstep(0.0, 0.06, fkk) * (1.0 - smoothstep(0.94, 1.0, fkk)) * smoothstep(0.0, 0.06, fr) * (1.0 - smoothstep(0.94, 1.0, fr));
    vec3 bg = imgLod(p * 0.85 + 0.5, 2.5) * 0.15;
    vec3 col = mix(bg, c * (0.35 + 0.65 * edge) * 1.2, inside);
    finish(col);
}
