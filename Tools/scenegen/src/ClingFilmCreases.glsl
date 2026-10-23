//@doc
 * @brief CLING FILM CREASES: clear film over the photo, drawn tight at one point: from there sharp creases run in every direction, bending
 * the light so the photo shifts across each crease and a hard glint runs along it.  The point of tension wanders, more creases
 * crowd in as the music swells.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the point of tension wanders (integrated)
 *   audioSwell      -> how many creases are in view and how hard they bend the light
 *
 * Knobs: creasesP (the base number of creases), reachP (how far they bend the photo), hueP.
//@params creasesP reachP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.15 + 1.0 * audioPhase;
    vec2 c = 0.3 * vec2(sin(0.7 * t), cos(0.5 * t));
    vec2 d = p - c;
    float r = length(d);
    float th = atan(d.y, d.x);
    float N = 7.0 + 8.0 * clamp(creasesP, 0.0, 1.0) + 4.0 * clamp(audioSwell, 0.0, 1.0);
    float warp = (noise2(vec2(r * 4.0, floor(th * N / 6.2831853) * 3.1)) - 0.5) * 0.5 * r;
    float s = sin(0.5 * (N * th + 6.2831853 * 0.0)) ;
    float arc = th * N / 6.2831853 + warp * 4.0;
    float fr = abs(fract(arc) - 0.5) * 2.0;
    float crease = exp(-pow(fr / 0.05, 2.0)) * smoothstep(0.0, 0.12, r);
    float face = floor(arc);
    vec2 off = (hash22(vec2(face, 5.0)) - 0.5) * (0.02 + 0.07 * clamp(reachP, 0.0, 1.0)) * smoothstep(0.0, 0.5, r);
    vec3 col = imgLod(uv + off, 0.5) * (0.85 + 0.25 * hash21(vec2(face, 1.0))) + crease * 0.5 * vec3(1.0, 0.98, 0.95) * (0.5 + 0.5 * clamp(audioSwell, 0.0, 1.0));
    finish(col);
}
