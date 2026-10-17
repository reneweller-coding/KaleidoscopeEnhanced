//@doc
 * @brief CLOUD CHAMBER FIELD: a cloud chamber as an endless field -- every onset in the music sends a particle through
 * the supersaturated vapour, and along its path a trail of round droplets condenses: straight for the heavy ones,
 * curling in the magnetic field for the light ones, spiralling in tight for the slowest.  The trails drift and
 * spread as the droplets diffuse, fade into mist and are gone; new ones keep crossing.  The tracks are kept on the
 * state pass; the photo colours them.
 *
 * Audio Reactivity (structure, not only light):
 *   audioOnset      -> each onset sends a particle through (on the state pass); its strength sets its kind
 *   audioSwell      -> the mist thickens
 *   audioKick       -> the freshest droplets flash (light)
 *
 * Knobs: curlP (how strongly the field curls the light tracks), dropletP (the droplets' density), photoP (photo
 * share), hueP.
//@params curlP dropletP photoP
//@audio audioOnset audioSwell audioKick
//@state 33 2 30
//@body
/**  The state pass: column 32 detects onsets (at most five a second) and counts them; column j, when its turn comes,
 * takes a new track: its start and heading (row 0), its birth, curvature and charge (row 1).
 *
 * @return
 *   Row 0: start (rg), heading (b); row 1: birth (r), curvature (g); column 32: the count (r), the last onset (g).
 **/
vec4 stateStep()
{
    ivec2 ip = ivec2(gl_FragCoord.xy);
    float now = stateFrame / 30.0;
    vec4 ctl = texelFetch(texState, ivec2(32, 0), 0);
    bool onset = clamp(audioOnset, 0.0, 1.0) > 0.4 && now - ctl.g > 0.2;
    if (stateFrame < 0.5) {
        if (ip.x == 32) return vec4(0.0, -1.0, 0.0, 1.0);
        return ip.y == 0 ? vec4((stRand(0) - 0.5) * vec2(1.8, 1.0), 6.2831853 * stRand(1), 1.0) : vec4(-100.0, 0.0, 0.0, 1.0);
    }
    if (ip.x == 32) return ip.y == 0 ? (onset ? vec4(ctl.r + 1.0, now, 0.0, 1.0) : ctl) : vec4(0.0);
    vec4 me = texelFetch(texState, ip, 0);
    if (onset && ip.x == int(mod(ctl.r + 1.0, 32.0))) {
        if (ip.y == 0) {
            // tracks enter from the frame's edge region, aimed across it
            float a = 6.2831853 * stRand(0);
            vec2 start = -0.95 * vec2(cos(a), sin(a)) * vec2(0.9, 0.55) + 0.2 * (vec2(stRand(1), stRand(2)) - 0.5);
            return vec4(start, a + 0.6 * (stRand(3) - 0.5), 1.0);
        }
        float kind = stRand(4);
        float curv = kind < 0.4 ? 0.0 : (kind < 0.8 ? 2.0 + 4.0 * stRand(5) : 9.0 + 8.0 * stRand(5));
        return vec4(now, curv * (stRand(6) < 0.5 ? 1.0 : -1.0), clamp(audioOnset, 0.0, 1.0), 1.0);
    }
    return me;
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float now = (stateFrame + stateFrac) / 30.0;
    float curlK = 0.4 + 0.9 * clamp(curlP, 0.0, 1.0);
    float sp = 0.012 - 0.004 * clamp(dropletP, 0.0, 1.0);
    vec3 tone = imgPalette(0.5 + 0.03 * audioPhase);
    float mist = fbm(p * 2.5 + vec2(0.03 * sceneTime, 0.0));
    vec3 col = imgLod(p * 0.4 + 0.5, 4.0) * 0.12 + tone * mist * (0.05 + 0.1 * clamp(audioSwell, 0.0, 1.0));
    for (int j = 0; j < 32; ++j) {
        vec4 a = texelFetch(texState, ivec2(j, 0), 0), b = texelFetch(texState, ivec2(j, 1), 0);
        float age = now - b.r;
        if (age < 0.0 || age > 7.0) continue;
        // the track: a circle arc (or a line) from its start along its heading; the drift carries it as it ages
        vec2 st = a.xy + vec2(0.01, 0.006) * age;
        vec2 dir = vec2(cos(a.z), sin(a.z));
        float k = b.g * curlK;
        vec2 d = p - st;
        float s, n;
        if (abs(k) < 0.01) { s = dot(d, dir); n = dot(d, vec2(-dir.y, dir.x)); }
        else {
            vec2 c = st + vec2(-dir.y, dir.x) / k;               // the circle's centre
            vec2 rv = p - c;
            float R = 1.0 / abs(k);
            n = length(rv) - R;
            float a0 = atan(st.y - c.y, st.x - c.x), a1 = atan(rv.y, rv.x);
            float da = mod((a1 - a0) * sign(k) + 6.2831853, 6.2831853);
            s = da * R;
            // the slow ones spiral in: the arc's radius shrinks along it (a gentle approximation)
            n += 0.15 * s * s * abs(k) * 0.02;
        }
        float len = 1.0 + 1.5 * b.b;
        float grown = smoothstep(0.0, 0.25, age) * len;        // the trail condenses within a moment
        if (s < 0.0 || s > grown) continue;
        float spread = 0.004 + 0.01 * age;                      // the droplets diffuse
        if (abs(n) > spread * 3.0 + sp) continue;
        // droplets: jittered along the track, scattered across it by the spread
        float cell = floor(s / sp);
        for (int q = -1; q <= 1; ++q) {
            float cc = cell + float(q);
            vec2 h = hash22(vec2(cc, float(j) + floor(b.r * 7.0)));
            float sd = (cc + h.x) * sp;
            float nd = (h.y - 0.5) * 2.0 * spread;
            float dist = length(vec2(s - sd, n - nd));
            float r = sp * 0.5;
            float dr = smoothstep(r, r * 0.4, dist) * exp(-age / 3.0);
            if (dr > 0.001) {
                vec3 photo = imgLod(st * 0.5 + 0.5, 1.5);
                vec3 cd = mix(tone * 1.3, photo * 1.6, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0)) * (1.0 + 0.7 * clamp(audioKick, 0.0, 1.0) * exp(-age * 2.0));
                col = mix(col, cd, dr);
            }
        }
    }
    finish(col * 1.5);
}
