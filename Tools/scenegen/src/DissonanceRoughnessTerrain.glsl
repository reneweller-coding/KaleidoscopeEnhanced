//@doc
 * @brief DISSONANCE ROUGHNESS TERRAIN: the music's roughness as a landscape under the photo -- smooth, consonant
 * sound lays out gentle rolling hills, rough, dissonant sound throws up jagged crags and ridges, the fine octaves of
 * the land rising and sinking with the roughness (smoothed on the state pass).  The photo lies draped over the land,
 * lit low from the side so every ridge shows; the eye glides over it.
 *
 * Audio Reactivity (structure, not only light):
 *   audioRoughness  -> the land's jaggedness (smoothed on the state pass)
 *   audioAdvance    -> the eye glides on (integrated: the music's drive)
 *
 * Knobs: heightP (the land's height), sunP (how low the light stands), photoP (photo share), hueP.
//@params heightP sunP photoP
//@audio audioRoughness
//@state 1 1 60
//@body
float gRough = 0.3;        // the smoothed roughness

/**  The state pass: the roughness smoothed over about two seconds.
 *
 * @return
 *   The smoothed roughness, 0, 0, 1.
 **/
vec4 stateStep()
{
    float v = clamp(audioRoughness, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(v, 0.0, 0.0, 1.0);
    return vec4(mix(texelFetch(texState, ivec2(0, 0), 0).r, v, 0.01), 0.0, 0.0, 1.0);
}

/**  The land's height: broad hills always, finer octaves growing with the roughness, ridged when it is rough.
 *
 * @param x  The ground point. (in)
 *
 * @return
 *   The height.
 **/
float land(vec2 x)
{
    float h = 0.0, a = 0.5, f = 0.6;
    for (int o = 0; o < 6; ++o) {
        float n = noise2(x * f + float(o) * 7.3);
        float ridged = 1.0 - abs(2.0 * n - 1.0);
        float w = o < 2 ? 1.0 : gRough * (1.2 - 0.1 * float(o));
        h += a * w * mix(n, ridged * ridged, gRough);
        a *= 0.5;
        f *= 2.03;
    }
    return h;
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    gRough = texelFetch(texState, ivec2(0, 0), 0).r;
    float H = 0.6 + 0.6 * clamp(heightP, 0.0, 1.0);
    float s = 0.3 * sceneTime + 1.0 * audioAdvance;
    vec3 ro = vec3(0.2 * sin(0.03 * sceneTime), 1.25 * H + 0.4, s);
    vec3 fw = normalize(vec3(0.15 * sin(0.02 * sceneTime), -0.42, 1.0));
    vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw)), up = cross(fw, rt);
    vec3 rd = normalize(fw * 1.3 + rt * p.x + up * p.y);
    float t = 0.05;
    bool hit = false;
    float hPrev = 0.0, tPrev = 0.0;
    for (int i = 0; i < 90; ++i) {
        vec3 x = ro + rd * t;
        float hh = land(x.xz) * H;
        if (x.y < hh) {
            // refine between the last step above and this one below
            float a = tPrev, b = t;
            for (int k = 0; k < 5; ++k) {
                float m = 0.5 * (a + b);
                vec3 xm = ro + rd * m;
                if (xm.y < land(xm.xz) * H) b = m; else a = m;
            }
            t = 0.5 * (a + b);
            hit = true;
            break;
        }
        tPrev = t;
        t += max(0.02, 0.4 * (x.y - hh)) * (1.0 + 0.02 * t);
        if (t > 14.0) break;
    }
    vec3 tone = imgPalette(0.35 + 0.03 * audioPhase);
    vec3 sky = imgLod(p * 0.3 + vec2(0.5, 0.7), 4.5) * 0.35 + tone * 0.08;
    vec3 col = sky;
    if (hit) {
        vec3 x = ro + rd * t;
        float e = 0.01;
        float h0 = land(x.xz) * H;
        vec3 n = normalize(vec3(-(land(x.xz + vec2(e, 0.0)) * H - h0) / e, 1.0, -(land(x.xz + vec2(0.0, e)) * H - h0) / e));
        float sunA = 0.35 + 0.45 * (1.0 - clamp(sunP, 0.0, 1.0));
        vec3 sunD = normalize(vec3(cos(0.02 * sceneTime), sunA, sin(0.02 * sceneTime) * 0.5 + 0.3));
        float diff = 0.15 + 1.0 * max(dot(n, sunD), 0.0);
        vec3 photo = imgLod(mirrorUV(x.xz * 0.12), 0.5);
        vec3 c = mix(tone * 1.2, photo * 1.35, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0)) * diff;
        col = mix(sky, c, exp(-0.12 * max(t - 2.0, 0.0)));
    }
    finish(col);
}
