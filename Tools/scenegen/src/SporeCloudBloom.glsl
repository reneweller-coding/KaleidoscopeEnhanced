//@doc
 * @brief SPORE CLOUD BLOOM: puffs of fungal spores spreading as clouds of round motes -- every puff bursts from a
 * point and swells outward, its motes carried apart by the air's eddies into curling plumes, thinning as they go,
 * until the frame is full of drifting dust; the next puffs keep coming, harder and more of them when the music
 * drops.  The puffs are kept on the state pass; every mote wears the photo's colour from where its puff began.
 *
 * Audio Reactivity (structure, not only light):
 *   audioDrop       -> a drop releases a burst of puffs (on the state pass)
 *   audioSwell      -> the puffs come more often
 *   audioKick       -> the youngest motes flash (light)
 *
 * Knobs: motesP (how many motes), spreadP (how fast the puffs swell), photoP (photo share), hueP.
//@params motesP spreadP photoP
//@audio audioDrop audioSwell audioKick
//@state 17 1 30
//@body
/**  The state pass: texel 16 times the puffs (a new one every few seconds, at once on a drop) and counts them;
 * texel j, when its turn comes, takes the new puff's place and birth.
 *
 * @return
 *   Texel 16: the count (r), the time of the last puff (g); texel j: the place (rg), the birth (b).
 **/
vec4 stateStep()
{
    int i = int(gl_FragCoord.x);
    float now = stateFrame / 30.0;
    vec4 ctl = texelFetch(texState, ivec2(16, 0), 0);
    float interval = mix(4.0, 1.2, clamp(audioSwell, 0.0, 1.0));
    bool drop = clamp(audioDrop, 0.0, 1.0) > 0.5 && now - ctl.g > 0.4;
    bool puff = drop || now - ctl.g > interval;
    if (stateFrame < 0.5) {
        if (i == 16) return vec4(0.0, 0.0, 0.0, 1.0);
        return vec4((stRand(0) - 0.5) * vec2(1.6, 0.9), -1.5 * float(16 - i), 1.0);
    }
    if (i == 16) return puff ? vec4(ctl.r + 1.0, now, 0.0, 1.0) : ctl;
    vec4 me = texelFetch(texState, ivec2(i, 0), 0);
    if (puff && i == int(mod(ctl.r + 1.0, 16.0))) return vec4((stRand(0) - 0.5) * vec2(1.6, 0.9), now, 1.0);
    return me;
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float now = (stateFrame + stateFrac) / 30.0;
    float sp = 0.024 - 0.01 * clamp(motesP, 0.0, 1.0);
    float v = 0.06 + 0.08 * clamp(spreadP, 0.0, 1.0);
    vec3 tone = imgPalette(0.3 + 0.03 * audioPhase);
    vec3 col = imgLod(p * 0.35 + 0.5, 4.5) * 0.15 + tone * 0.04;
    for (int k = 0; k < 16; ++k) {
        vec4 s = texelFetch(texState, ivec2(k, 0), 0);
        float age = now - s.b;
        if (age < 0.0 || age > 24.0) continue;
        float grow = 1.0 + v * age * 8.0 * (1.0 - exp(-age * 0.5));   // the puff's swelling
        float R = 0.05 * grow;
        vec2 d = p - s.xy;
        if (dot(d, d) > R * R * 2.6) continue;
        // the eddies: a curling warp that grows with the puff's age
        vec2 wv = vec2(noise2(d * 6.0 / grow + float(k) * 3.1 + vec2(0.0, 0.2 * age)), noise2(d * 6.0 / grow + float(k) * 7.7 - vec2(0.2 * age, 0.0))) - 0.5;
        vec2 q = d / grow + wv * 0.04 * min(age, 6.0) / grow;    // back to where the mote began, in the puff's frame
        float s0 = sp * 0.22;                                   // the motes' spacing where the puff began (fixed)
        vec2 cell = floor(q / s0);
        float fade = exp(-age / 9.0) * smoothstep(0.0, 0.3, age);
        for (int jj = -1; jj <= 1; ++jj) for (int ii = -1; ii <= 1; ++ii) {
            vec2 cc = cell + vec2(float(ii), float(jj));
            vec2 hh = hash22(cc + float(k) * 13.0);
            vec2 c0 = (cc + 0.5 + 0.7 * (hh - 0.5)) * s0;       // where the mote began (puff frame)
            float rc = length(c0) * grow / R;
            float inPuff = smoothstep(1.3, 0.6, rc) * smoothstep(hh.x - 0.1, hh.x + 0.1, 0.9 - 0.3 * rc);
            if (inPuff < 0.001) continue;
            float dd = length(q - c0) * grow;                   // measured back on screen
            float rad = sp * 0.3;
            float m = smoothstep(rad, rad * 0.4, dd) * inPuff * fade;
            if (m > 0.001) {
                vec3 photo = imgLod(s.xy * 0.55 + 0.5 + c0 * 0.4, 1.0);
                vec3 cm = mix(tone * 1.3, photo * 1.6, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0)) * (1.0 + 0.6 * clamp(audioKick, 0.0, 1.0) * exp(-age));
                col = mix(col, cm, m);
            }
        }
    }
    finish(col * 1.15);
}
