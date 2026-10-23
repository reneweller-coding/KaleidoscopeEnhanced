//@doc
 * @brief ZODIACAL LIGHT BAND GLOW: the zodiacal light: a cone of light along the ecliptic in the twilight sky, made by dust scattering, with the counter-glow; the photo sets colour and scattering, and the band turns slowly.  A wedge of glow rises from the horizon along a slanted axis, thinning with height,
 * the faint counter-glow lies opposite, fine dust grain modulates it, and the photo is the twilight sky behind.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the brightness of the cone
 *   audioAdvance -> the band turns slowly (integrated)
 *
 * Knobs: sizeP (the opening of the cone), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float ang = 1.0 + 0.04 * sin(0.01 * audioAdvance + 0.02 * sceneTime) + 0.02 * audioAdvance * 0.1;
    vec2 ax = vec2(cos(ang), sin(ang));
    vec2 nx = vec2(-ax.y, ax.x);
    vec2 q = p - vec2(-0.25, -0.55);
    float along = dot(q, ax);
    float across = dot(q, nx);
    float wd = 0.12 + 0.25 * clamp(sizeP, 0.0, 1.0);
    float w = wd * (0.5 + 1.0 * clamp(along / 1.2, 0.0, 1.0)) * 1.0;
    float cone = exp(-pow(across / w, 2.0)) * exp(-max(along, 0.0) * 1.8) * smoothstep(-0.1, 0.1, along);
    vec2 q2 = p - vec2(0.5, 0.45);
    float gegen = exp(-dot(q2, q2) / 0.04) * 0.25;
    float dust = 0.8 + 0.4 * fbm(p * 8.0 + vec2(0.0, 0.01 * sceneTime));
    float br = (cone + gegen) * dust * (0.6 + 0.9 * clamp(audioSwell, 0.0, 1.0));
    vec3 sky = imgLod(p * 0.85 + 0.5, 2.5);
    vec3 dusk = mix(vec3(0.02, 0.03, 0.09), vec3(0.15, 0.1, 0.12), smoothstep(0.5, -0.6, p.y));
    vec3 glow = mix(vec3(1.0, 0.85, 0.6), sky * 1.5, 0.35);
    vec3 col = dusk + sky * 0.2 + glow * br * 2.3;
    float star = step(0.995, hash21(floor(gl_FragCoord.xy / (resolution.y / 270.0 * 1.5))));
    col += vec3(1.0) * star * 0.35 * smoothstep(0.0, 0.6, p.y + 0.5);
    finish(col);
}
