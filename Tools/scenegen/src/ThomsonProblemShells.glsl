//@doc
 * @brief THOMSON PROBLEM SHELLS: charges on spheres seeking their balance -- Thomson's problem: N equal charges on a
 * sphere push each other apart until they settle into the arrangement of least energy, which for most N is a
 * puzzle of fives and sixes.  Four nested shells, each with its own charges, relax on the state pass; when the
 * chord grows richer more charges arrive (fading in) and the shells reorganise, when it thins some fade out.  The
 * shells turn slowly; the charges are glowing beads, the photo colours them.
 *
 * Audio Reactivity (structure, not only light):
 *   audioChroma     -> the number of charges follows how many notes the chord holds
 *   audioPhase      -> the shells turn (integrated)
 *   audioKick       -> the charges flash (light)
 *
 * Knobs: countP (the base count), beadP (the beads' size), photoP (photo share), hueP.
//@params countP beadP photoP
//@audio audioChroma[12] audioKick
//@state 48 4 60
//@body
/**  How many charges a shell should hold now: more for a richer chord.
 *
 * @param s  The shell. (in)
 *
 * @return
 *   The count, 4..48.
 **/
float countFor(int s)
{
    float notes = 0.0;
    for (int i = 0; i < 12; ++i) notes += smoothstep(0.35, 0.6, audioChroma[i]);
    float base = 12.0 + 16.0 * clamp(countP, 0.0, 1.0);
    return clamp(base * (0.6 + 0.25 * float(s)) + 3.0 * notes, 4.0, 48.0);
}

/**  One relaxation step of a charge on its shell (the state pass): the repulsion of the shell's present charges,
 * kept on the sphere; its presence fades toward whether it is counted.
 *
 * @return
 *   The charge's place on the unit sphere (xyz) and its presence (w).
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) {
        vec2 h = vec2(stRand(0), stRand(1));
        float z = 2.0 * h.x - 1.0, ph = 6.2831853 * h.y, rr = sqrt(1.0 - z * z);
        return vec4(rr * cos(ph), rr * sin(ph), z, 0.0);
    }
    vec4 me = stAt(ip);
    float N = countFor(ip.y);
    vec3 f = vec3(0.0);
    for (int j = 0; j < 48; ++j) {
        if (j == ip.x) continue;
        vec4 o = texelFetch(texState, ivec2(j, ip.y), 0);
        vec3 d = me.xyz - o.xyz;
        float l2 = max(dot(d, d), 1e-4);
        f += d / (l2 * sqrt(l2)) * o.w;                         // only the present charges push
    }
    vec3 x = me.xyz + 0.004 * (f - dot(f, me.xyz) * me.xyz);
    x = normalize(x + 0.0005 * (vec3(stRand(2), stRand(3), stRand(4)) - 0.5));
    float target = float(ip.x) < N ? 1.0 : 0.0;
    float w = mix(me.w, target, 0.02);
    return vec4(x, w);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float rb = 0.013 + 0.008 * clamp(beadP, 0.0, 1.0);
    float a = 0.02 * audioPhase + 0.05 * sceneTime;
    mat3 R = mat3(cos(a), 0.0, sin(a), 0.0, 1.0, 0.0, -sin(a), 0.0, cos(a));
    float b = 0.4 * sin(0.03 * sceneTime);
    mat3 T = mat3(1.0, 0.0, 0.0, 0.0, cos(b), -sin(b), 0.0, sin(b), cos(b));
    vec3 tone = imgPalette(0.35 + 0.03 * audioPhase);
    vec3 col = imgLod(p * 0.3 + 0.5, 5.0) * 0.1;
    float glow = 0.0, bestZ = -1e9;
    for (int s = 0; s < 4; ++s) {
        float rad = 0.1 + 0.115 * float(s);
        // the shell itself, a faint sphere outline
        float ring = abs(length(p) - rad);
        col += tone * 0.05 * exp(-ring * ring / 0.00002);
        for (int i = 0; i < 48; ++i) {
            vec4 q = texelFetch(texState, ivec2(i, s), 0);
            if (q.w < 0.01) continue;
            vec3 w = T * (R * q.xyz) * rad;
            float front = 0.45 + 0.55 * smoothstep(-0.2, 0.3, w.z / rad);
            float d = length(p - w.xy);
            float r = rb * (0.8 + 0.4 * w.z / rad) * q.w;
            float core = smoothstep(r, r * 0.4, d);
            glow += exp(-d * d / (r * r * 6.0)) * 0.15 * q.w * front;
            if (core > 0.001 && w.z > bestZ) {                 // the nearest bead in front
                bestZ = w.z;
                vec3 photo = imgLod(q.xy * 0.4 + 0.5, 1.0);
                vec3 cb = mix(tone * 1.3, photo * 1.6, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0)) * front
                          * (1.0 + 0.5 * clamp(audioKick, 0.0, 1.0));
                col = mix(col, cb, core);
            }
        }
    }
    col += tone * glow * 1.5;
    finish(col * 1.3);
}
