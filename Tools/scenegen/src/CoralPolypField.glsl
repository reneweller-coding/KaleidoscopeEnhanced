//@doc
 * @brief CORAL POLYP FIELD: a carpet of coral polyps seen from above, every one a little crown of tentacles round a
 * mouth -- breathing open and shut, the carpet opening wide when the music swells and pulling in when it falls
 * quiet, waves of opening running across it so neighbours never move quite together.  The tentacles are translucent,
 * lit at their tips; the photo colours each polyp.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the polyps open (smoothed on the state pass)
 *   audioAdvance    -> the waves of opening run across the carpet (integrated)
 *   audioKick       -> the tentacle tips glow (light)
 *
 * Knobs: tentaclesP (tentacles per polyp), sizeP (the polyps' size), photoP (photo share), hueP.
//@params tentaclesP sizeP photoP
//@audio audioSwell audioKick
//@state 1 1 60
//@body
/**  The state pass: the swell smoothed over about a second.
 *
 * @return
 *   The smoothed swell, 0, 0, 1.
 **/
vec4 stateStep()
{
    float v = clamp(audioSwell, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(v, 0.0, 0.0, 1.0);
    return vec4(mix(texelFetch(texState, ivec2(0, 0), 0).r, v, 0.02), 0.0, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float sw = texelFetch(texState, ivec2(0, 0), 0).r;
    float S = 0.09 + 0.05 * clamp(sizeP, 0.0, 1.0);
    float nt = floor(8.0 + 6.0 * clamp(tentaclesP, 0.0, 1.0));
    float tw = 0.3 * sceneTime + 1.0 * audioAdvance;
    vec2 a = vec2(1.0, 1.7320508) * S;
    vec3 tone = imgPalette(0.45 + 0.03 * audioPhase);
    vec3 col = imgLod(p * 0.4 + 0.5, 4.0) * 0.18;
    float best = 0.0;
    for (int k = 0; k < 2; ++k) {
        vec2 off = k == 0 ? vec2(0.0) : 0.5 * a;
        vec2 qq = mod(p - off, a) - 0.5 * a;                    // the two interleaved lattices of a hexagonal carpet
        {
            vec2 id = floor((p - off) / a);
            float h = hash21(id + float(k) * 17.0);
            // the opening: the carpet's breath plus a wave running across it
            float wave = 0.5 + 0.5 * sin(tw * 1.3 - dot(id, vec2(0.9, 0.6)) * 0.8 + 6.2831853 * h * 0.3);
            float open = clamp(0.15 + 0.6 * sw + 0.35 * wave - 0.2, 0.05, 1.0);
            float r = length(qq) / S, ang = atan(qq.y, qq.x) + 6.2831853 * h;
            float tl = 0.35 + 0.6 * open;                       // the tentacles' reach
            float sec = 6.2831853 / nt;
            float am = mod(ang, sec) - 0.5 * sec;
            float across = abs(am) * r;
            float width = 0.09 * (1.0 - smoothstep(0.0, tl, r - 0.1)) + 0.02;
            float tent = (1.0 - smoothstep(width * 0.6, width, across)) * (1.0 - smoothstep(tl, tl + 0.02, r)) * smoothstep(0.05, 0.07, r);
            float mouth = 1.0 - smoothstep(0.1, 0.13, r);
            float m = max(tent, mouth * 0.9);
            if (m > best) {
                best = m;
                vec3 photo = imgLod((p - qq) * 0.5 + 0.5, 1.5);
                vec3 cp = mix(imgPalette(h + 0.03 * audioPhase) * 1.2, photo * 1.5, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0));
                float tip = smoothstep(tl * 0.6, tl, r) * tent;
                vec3 c = cp * (0.5 + 0.5 * r / max(tl, 0.01)) * (mouth > 0.5 ? 0.5 : 1.0);
                c += mix(cp, vec3(1.0), 0.6) * tip * (0.2 + 0.6 * clamp(audioKick, 0.0, 1.0));
                col = mix(col, c, m);
            }
        }
    }
    finish(col * 1.3);
}
