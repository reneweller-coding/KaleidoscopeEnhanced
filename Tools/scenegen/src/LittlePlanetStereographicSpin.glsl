//@doc
 * @brief LITTLE PLANET STEREOGRAPHIC SPIN: the little planet: the stereographic projection makes a sphere of the photo on which the edges become the horizon; the picture shows the sphere in the middle and the rest as the sky, with the photo in the surroundings.  The photo is read as a panorama: the angle round the middle is
 * the longitude, the distance from the middle is the latitude by the stereographic law, and the sphere turns.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the planet turns (integrated)
 *   audioSwell   -> the extent of the planet (the stereographic scale)
 *
 * Knobs: sizeP (the size of the planet), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float r = length(p);
    float th = atan(p.y, p.x) + 0.02 * audioAdvance + 0.03 * sceneTime;
    float S = 1.6 + 2.2 * (1.0 - clamp(sizeP, 0.0, 1.0)) - 0.7 * clamp(audioSwell, 0.0, 1.0);
    float rho = r * S;
    float lat = 1.5707963 - 2.0 * atan(rho);
    float lon = th;
    float ux = abs(fract(lon / 6.2831853 * 2.0) * 2.0 - 1.0);
    float uy = 0.5 + lat / 3.1415927;
    vec3 c = imgLod(vec2(ux * 0.9 + 0.05, uy * 0.9 + 0.05), 0.6 + 1.2 * smoothstep(0.0, 1.5, rho));
    float horizon = exp(-pow((rho - 1.0) / 0.03, 2.0));
    vec3 sky = mix(vec3(0.4, 0.6, 1.0), c, 0.45);
    vec3 col = mix(c * 1.05, sky * (0.8 + 0.3 * smoothstep(1.0, 3.0, rho)), smoothstep(0.9, 1.1, rho));
    col += vec3(1.0, 0.95, 0.85) * horizon * 0.35;
    finish(col);
}
