//@doc
 * @brief ORBIT TRAP NEBULA 3D: the orbit traps of a quaternion Julia set filled in as a volume -- light wherever a
 * point's orbit under q <- q^2 + c comes near a trap shape -- a nebula of rings and veils that the eye floats
 * through on a slow orbit.  The trap is a blend of a sphere shell and a torus; the light is the closest the orbit
 * came, so each pass of the orbit past the shape draws one veil.  One colour family from the photo, shaded by the
 * step at which the orbit came closest.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the Julia constant wanders with the chord changes: the veils re-knot
 *   audioChromaHue   -> the key turns the trap from sphere toward torus
 *   audioSwell       -> the veils' width
 *   audioAdvance     -> the drift (integrated)
 *
 * Knobs: trapP (the trap's size), densityP (how much light the veils carry), hueP.
//@params trapP densityP
//@audio audioHarmAdvance audioChromaHue audioSwell
//@body
/**  The quaternion square.
 *
 * @param q  The quaternion. (in)
 *
 * @return
 *   q^2.
 **/
vec4 qsq(vec4 q)
{
    return vec4(q.x * q.x - dot(q.yzw, q.yzw), 2.0 * q.x * q.yzw);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    vec4 c = vec4(-0.29, -0.4, 0.34, 0.2) + 0.08 * vec4(sin(0.7 * h), cos(0.53 * h), sin(0.41 * h + 1.0), cos(0.3 * h));
    float R = 0.55 + 0.25 * clamp(trapP, 0.0, 1.0);
    float torus = 0.5 + 0.5 * sin(audioChromaHue);
    float width = 0.06 + 0.05 * clamp(audioSwell, 0.0, 1.0);
    float dens = 0.6 + 0.8 * clamp(densityP, 0.0, 1.0);
    float orbit = 0.025 * sceneTime + 0.1 * audioAdvance;
    vec3 ro = 1.25 * vec3(cos(orbit), 0.35 * sin(0.8 * orbit), sin(orbit));
    vec3 fw = normalize(-ro + 0.3 * vec3(sin(0.05 * sceneTime), 0.2, cos(0.04 * sceneTime)));
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    vec3 rd = normalize(fw * 0.9 + rt * p.x + up * p.y);
    vec3 col = vec3(0.0);
    float t = 0.05;
    for (int i = 0; i < 56; ++i) {
        vec3 x = ro + rd * t;
        vec4 q = vec4(x, 0.0);
        float best = 1e9, at = 0.0;
        for (int k = 0; k < 9; ++k) {
            q = qsq(q) + c;
            float sph = abs(length(q.xyz) - R);
            float tor = length(vec2(length(q.xz) - R, q.y));
            float d = mix(sph, tor, torus);
            if (d < best) { best = d; at = float(k); }
            if (dot(q, q) > 16.0) break;
        }
        float g = exp(-pow(best / width, 2.0));
        float fade = exp(-0.3 * t);
        col += famLight(fh, at / 8.0, 0.35 * g) * g * fade * dens * 0.3;
        t += 0.06 + 0.01 * t;
        if (t > 3.4) break;
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
