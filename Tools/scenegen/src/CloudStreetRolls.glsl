//@doc
 * @brief CLOUD STREET ROLLS: cloud streets: rolls in the air make parallel bands of cloud with gaps of blue sky; the photo sets the colour of cloud and gap, and the bands wander with a slight cross slope.  The bands are stripes whose clouds thin out between and thicken along (stretched noise), the sky in the gaps
 * is darker and bluer, and the bands slowly run sideways.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the number of bands (smoothed)
 *   audioAdvance -> the bands wander (integrated)
 *
 * Knobs: sizeP (the cloud cover), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float ang = 0.35 + 0.01 * sin(0.03 * audioAdvance + 0.02 * sceneTime);
    vec2 ax = vec2(cos(ang), sin(ang));
    vec2 nx = vec2(-ax.y, ax.x);
    float along = dot(p, ax);
    float across = dot(p, nx);
    float N = 5.0 + 6.0 * clamp(audioSpread, 0.0, 1.0);
    float t = 0.02 * audioAdvance + 0.03 * sceneTime;
    float b = across * N + 0.4 * fbm(vec2(along * 1.2, across * 0.5)) + t;
    float roll = 0.5 + 0.5 * cos(6.2831853 * b);
    float cloudN = fbm(vec2(along * 2.5 - 2.0 * t, across * 12.0)) * 0.6 + fbm(vec2(along * 6.0 - 3.0 * t, across * 24.0)) * 0.4;
    float cover = 0.35 + 0.35 * clamp(sizeP, 0.0, 1.0);
    float cl = smoothstep(cover + 0.1, cover + 0.45, roll * 0.55 + cloudN * 0.6);
    vec3 c = imgLod(p * 0.85 + 0.5, 1.0);
    vec3 sky = mix(vec3(0.25, 0.45, 0.8), c * 0.9, 0.4);
    vec3 cloud = mix(vec3(0.95, 0.96, 1.0), c * 1.3, 0.3) * (0.8 + 0.3 * cloudN);
    finish(mix(sky, cloud, cl) * 1.1);
}
