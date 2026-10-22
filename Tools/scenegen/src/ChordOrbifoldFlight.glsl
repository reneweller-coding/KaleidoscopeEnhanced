//@doc
 * @brief CHORD ORBIFOLD FLIGHT: a flight through the twisted triangular prism in which music theory places the
 * three-note chords -- its three edges winding round as it runs, repeating without end -- while the current chord
 * shines as a point inside it, wandering along the paths of voice leading and leaving a glowing trail of the chords
 * just played.  The chord's place in the prism's cross-section is the strength-weighted mean of its pitch classes on a
 * circle; a small field of the scene's own keeps its last sixty-four places, laid out along the prism ahead of the eye
 * and turned with the prism's twist.  The walls are found along each ray: the depth where the place reaches the
 * twisted triangle's inradius, by a few fixed-point steps; there the edges (where two faces meet) and a frame every
 * little way along the prism glow.  The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioChroma[12] -> the chord's place in the prism (and its trail of recent chords)
 *   audioAdvance    -> the flight along the prism (integrated)
 *   audioSwell      -> the trail's glow
 *
 * Knobs: twistP (how fast the prism twists), trailP (how long the trail is), hueP.
//@params twistP trailP
//@audio audioChroma[12] audioSwell
//@state 64 1 20 32
//@body
/**  The state pass: the chord's place over the last sixty-four steps, the newest in cell 0.
 *
 * @return
 *   xy the place in the prism's cross-section, 0, 1.
 **/
vec4 stateStep()
{
    int j = stCell().x;
    if (j > 0) return stateFrame < 0.5 ? vec4(0.0, 0.0, 0.0, 1.0) : texelFetch(texState, ivec2(j - 1, 0), 0);
    vec2 v = vec2(0.0);
    float w = 0.0;
    for (int k = 0; k < 12; ++k) {
        float c = clamp(audioChroma[k], 0.0, 1.0);
        float a = c * c;
        v += a * vec2(cos(6.2831853 * float(k) / 12.0), sin(6.2831853 * float(k) / 12.0));
        w += a;
    }
    v = w > 1e-3 ? v / w : vec2(0.0);
    vec4 old = stateFrame < 0.5 ? vec4(v, 0.0, 1.0) : texelFetch(texState, ivec2(0, 0), 0);
    return vec4(mix(old.xy, v, 0.3), 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float twist = 0.25 + 0.3 * clamp(twistP, 0.0, 1.0);
    float span = 0.04 + 0.04 * clamp(trailP, 0.0, 1.0);
    float fly = 0.2 * sceneTime + 0.8 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    const float RP = 0.5;
    vec3 col = famCol(fh, 0.45) * 0.015;
    // the prism's walls: the depth where this ray meets the twisted triangle (inradius RP / 2)
    float zr = 1.0, m1 = 0.0, m2 = 0.0;
    for (int it = 0; it < 6; ++it) {
        float th = twist * (zr + fly);
        m1 = -9.0;
        m2 = -9.0;
        for (int e = 0; e < 3; ++e) {
            float an = th + 1.0471976 + 2.0943951 * float(e);         // the faces' normals
            float v = dot(p, vec2(cos(an), sin(an)));
            m2 = max(m2, min(m1, v));
            m1 = max(m1, v);
        }
        zr = min(0.5 * RP / max(m1, 1e-3), 40.0);
    }
    float fade = smoothstep(0.3, 0.8, zr) * exp(-0.12 * zr);
    float px = zr / resolution.y;                                     // a pixel at that depth, in world units
    float edge = exp(-pow((m1 - m2) * zr / (2.0 * px), 2.0));
    float u = (zr + fly) / 0.7;
    float du = zr * zr / (0.5 * RP) * length(vec2(dFdx(m1), dFdy(m1))) / 0.7;
    float frame = exp(-pow((0.5 - abs(fract(u) - 0.5)) / max(1.5 * du, 1e-4), 2.0));
    col += famCol(fh, 0.5) * 0.05 * fade;                              // the walls' faint glow
    col += famLight(fh, 0.35, 0.4) * (0.7 * edge + 0.35 * frame) * fade;
    // the chord's trail: its recent places laid along the prism ahead, turned with the twist
    float bestT = 9.0, ageT = 1.0;
    vec2 prev = vec2(0.0);
    for (int j = 0; j < 64; ++j) {
        float z = 0.6 + float(j) * span;
        vec2 c = texelFetch(texState, ivec2(j, 0), 0).xy * RP * 0.75;
        c = rot2(-twist * z) * c;
        vec2 sp = c / z;
        if (j > 0) {
            vec2 ab = sp - prev, ap = p - prev;
            float d = length(ap - ab * clamp(dot(ap, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0)) * z;
            if (d < bestT) { bestT = d; ageT = float(j) / 64.0; }
        }
        prev = sp;
    }
    col += famLight(fh, 0.6, 0.5 + 0.4 * (1.0 - ageT)) * (exp(-pow(bestT / 0.006, 2.0)) + 0.25 * exp(-bestT / 0.03)) * (1.0 - 0.8 * ageT) * glow;
    vec2 head = texelFetch(texState, ivec2(0, 0), 0).xy * RP * 0.75 / 0.6;
    col += famLight(fh, 0.5, 0.9) * exp(-dot(p - head, p - head) / 0.0006) * 1.2 * glow;
    finish(col);
}
