//@doc
 * @brief KANIZSA POLYGON FIELD: illusory contours: discs with a wedge cut out ("pac-men") stand at the corners of a regular polygon, their cuts facing in, and between them the eye sees the polygon as a bright body lifted from the
 * ground, its edges drawn where there are none.  A lattice of such polygons fills the picture; they turn, and the number of corners changes by gliding (each corner fades in as the polygon grows another).  The discs are
 * the photo's dark tones on a bright ground cut from the photo.  The corners follow the key, the turn the phase of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the number of corners (fading in and out, 3 to 8)
 *   audioPhase      -> the polygons turn (integrated)
 *
 * Knobs: sizeP (the size of the polygons), hueP.
//@params sizeP
//@audio audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float s = 0.62 - 0.2 * clamp(sizeP, 0.0, 1.0);
    vec2 cell = floor(p / s + 0.5);
    vec2 d = p - cell * s;
    float rot = 0.12 * audioPhase + 0.015 * sceneTime + 0.4 * hash21(cell);
    float nn = 3.5 + 4.0 * (0.5 + 0.5 * sin(0.45 * audioHarmAdvance + 1.7 * hash21(cell)));
    float disc = 0.0;
    for (int k = 0; k < 9; ++k) {
        float fk = float(k);
        float w = clamp(nn - fk, 0.0, 1.0);
        float n = max(nn, 3.0);
        float ang = rot + 6.2831853 * fk / n;
        vec2 v = 0.27 * s * vec2(cos(ang), sin(ang));
        vec2 e = d - v;
        float da = abs(mod(atan(e.y, e.x) - (ang + 3.1415927) + 3.1415927, 6.2831853) - 3.1415927);
        float half0 = 1.5707963 - 3.1415927 / n;
        float cut = smoothstep(half0 - 0.04, half0 + 0.04, da);
        disc = max(disc, w * smoothstep(0.006, -0.006, length(e) - 0.14 * s) * cut);
    }
    vec3 c = imgLod(p * 0.8 + 0.5, 1.5);
    vec3 bg = mix(imgLod(p * 0.8 + 0.5, 3.5), vec3(1.0), 0.55);
    finish(mix(bg, c * 0.15, disc));
}
