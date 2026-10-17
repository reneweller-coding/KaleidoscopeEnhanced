//@doc
 * @brief CHAOTIC TAFFY MIXER: invisible stirring rods pull the photo like a taffy puller -- chaotic advection after
 * Aref: the rods move along a braid (two pairs swapping in turn), a circle or a figure eight, the fluid they drag
 * is stretched and folded, and the picture is drawn out into ever finer silky strands.  The field carries the
 * photo's coordinates (not its colours), as a displacement from the plain photo so the torus has no seam, and the
 * strands stay sharp; a slow pull back toward the plain photo lets a fresh picture flow in.  An endless, periodic
 * field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each change of harmony switches the stirring protocol (the velocity fields crossfade)
 *   audioSwell      -> how hard the rods stir
 *   audioAdvance    -> the rods' progress along their paths (integrated)
 *   audioKick       -> the strands' highlights flash (light)
 *
 * Knobs: rodsP (the first protocol), reachP (how much fluid a rod drags), freshP (how fast the photo returns), hueP.
//@params rodsP reachP freshP
//@audio audioSwell audioKick audioHarmAdvance
//@state 384 216 120 32
//@body
/**  The position of a rod of a stirring protocol at a phase (field units: the field is 1.78 x 1).
 *
 * @param k    The protocol: 0 a braid of three rods, 1 four rods on a circle, 2 two rods on a figure eight. (in)
 * @param i    The rod. (in)
 * @param phi  The phase along the protocol. (in)
 *
 * @return
 *   The rod's position, or far away if the protocol has no such rod.
 **/
vec2 rodPos(int k, int i, float phi)
{
    vec2 c = vec2(0.89, 0.5);
    if (k == 0) {
        if (i > 2) return vec2(-9.0);
        // sigma1 sigma2^-1: rods 0,1 swap clockwise, then rods 1,2 swap counter-clockwise
        float seg = floor(phi), f = smoothstep(0.0, 1.0, fract(phi));
        vec2 p0 = c + vec2(-0.3, 0.0), p1 = c, p2 = c + vec2(0.3, 0.0);
        // which rod sits where after seg segments: the braid permutes the slots
        int s = int(mod(seg, 4.0));
        int slot = i;
        for (int j = 0; j < 4; ++j) {
            if (j >= s) break;
            if (mod(float(j), 2.0) < 0.5) slot = slot == 0 ? 1 : (slot == 1 ? 0 : slot);
            else slot = slot == 1 ? 2 : (slot == 2 ? 1 : slot);
        }
        bool first = mod(seg, 2.0) < 0.5;
        vec2 home = slot == 0 ? p0 : (slot == 1 ? p1 : p2);
        bool moving = first ? slot < 2 : slot > 0;
        if (!moving) return home;
        vec2 mid = first ? 0.5 * (p0 + p1) : 0.5 * (p1 + p2);
        float a = 3.14159265 * f * (first ? -1.0 : 1.0);
        return mid + rot2(a) * (home - mid);
    }
    if (k == 1) {
        if (i > 3) return vec2(-9.0);
        float a = 1.5707963 * float(i) + 0.8 * phi;
        return c + vec2(0.32 * cos(a), 0.3 * sin(a));
    }
    if (i > 1) return vec2(-9.0);
    float a = 1.2 * phi + 3.14159265 * float(i);
    return c + vec2(0.45 * sin(a), 0.25 * sin(2.0 * a));
}
/**  The fluid velocity a protocol drags at a point: every rod pulls the fluid near it along with its own motion.
 *
 * @param k    The protocol. (in)
 * @param x    The point (field units). (in)
 * @param phi  The phase. (in)
 *
 * @return
 *   The velocity in field units per phase unit.
 **/
vec2 dragAt(int k, vec2 x, float phi)
{
    float w = 0.05 + 0.08 * clamp(reachP, 0.0, 1.0);
    vec2 v = vec2(0.0);
    for (int i = 0; i < 4; ++i) {
        vec2 a = rodPos(k, i, phi), b = rodPos(k, i, phi + 0.01);
        if (a.x < -5.0) continue;
        vec2 d = x - a;
        d -= vec2(1.7777778, 1.0) * floor(d / vec2(1.7777778, 1.0) + 0.5);
        v += (b - a) / 0.01 * exp(-dot(d, d) / (w * w));
    }
    return v;
}

/**  One semi-Lagrangian step of the photo coordinates for this cell (the state pass).  The field holds the
 * displacement D = uv - x / H, which is periodic where uv itself is not: uv_new(x) = uv(x - v) becomes
 * D_new(x) = D(x - v) - v / H.
 *
 * @return
 *   The displacement of the photo coordinate this cell shows, 0, 1.
 **/
vec4 stateStep()
{
    vec2 x = vec2(stCell()) + 0.5;
    if (stateFrame < 0.5) return vec4(0.0, 0.0, 0.0, 1.0);
    float h = audioHarmAdvance + floor(clamp(rodsP, 0.0, 0.999) * 3.0);
    int k0 = int(mod(floor(h), 3.0)), k1 = int(mod(floor(h) + 1.0, 3.0));
    float wk = smoothstep(0.3, 0.7, fract(h));
    float phi = 0.35 * sceneTime + 0.05 * audioAdvance;
    vec2 xf = x / stateRes.y;
    vec2 v = mix(dragAt(k0, xf, phi), dragAt(k1, xf, phi), wk);
    float speed = (0.0025 + 0.004 * clamp(audioSwell, 0.0, 1.0)) * stateRes.y;   // cells per step per unit
    // carried by the drag; a fresh photo flows back in, slowly
    return stCarry(v * speed, 0.0006 + 0.003 * clamp(freshP, 0.0, 1.0));
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec2 cc = stView(p, 1.0);
    vec2 uv = stUV(cc);
    float lod = stLod(cc, resolution.y / stateRes.y);
    vec3 photo = imgLod(uv * 0.8 + 0.1, lod);
    float sheen = smoothstep(2.0, 5.0, lod);
    vec3 tone = imgPalette(0.3 + 0.03 * audioPhase);
    vec3 col = photo * (1.0 + 0.15 * sheen) + mix(tone, vec3(1.0), 0.5) * sheen * 0.15 * (0.5 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
