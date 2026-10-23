//@doc
 * @brief PRINT GALLERY CONFORMAL LOOP: Escher's print gallery: a picture that contains itself, by a conformal map that is zoom and turn at the same time; the photo winds in a spiral towards the middle, each turn smaller and continuing the picture.  In log-polar coordinates the plane is sheared so that one turn of the angle
 * moves one period of the log radius, and the photo is read at the wrapped place.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the number of turns of the spiral (smoothed)
 *   audioAdvance -> the picture winds inwards (integrated)
 *
 * Knobs: sizeP (the zoom ratio of one turn), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float r = length(p) + 1e-4;
    float th = atan(p.y, p.x);
    float L = log(3.0 + 5.0 * clamp(sizeP, 0.0, 1.0));
    float turns = 1.0 + 1.5 * clamp(audioSpread, 0.0, 1.0);
    float k = L * turns / 6.2831853;
    float u = log(r);
    float up = u - k * th - 0.012 * audioAdvance - 0.02 * sceneTime;
    float um = mod(up, L) - L;
    float r2 = exp(um + k * th) * 1.0;
    vec2 z2 = r2 * vec2(cos(th), sin(th));
    vec2 uvz = z2 * 0.85 + 0.5;
    uvz = abs(fract(uvz * 0.5) * 2.0 - 1.0);
    vec3 c = imgLod(uvz, 0.6 + 0.0);
    float seam = 1.0 - smoothstep(0.0, 0.04, abs(fract(up / L) - 0.0) * 0.0 + 0.5 - abs(fract(up / L) - 0.5)) * 0.0;
    float edge = smoothstep(0.0, 0.02, min(fract(up / L), 1.0 - fract(up / L)));
    finish(c * (0.65 + 0.35 * edge) * 1.1 * smoothstep(0.0, 0.03, r));
}
