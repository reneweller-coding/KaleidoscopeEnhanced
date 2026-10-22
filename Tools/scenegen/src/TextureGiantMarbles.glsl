//@doc
 * @brief TEXTURE GIANT MARBLES: giant glass marbles rest on a dark floor, each with a twisted core cut from the photo,
 * and roll as the view moves on past them; light shining through them gathers on the floor behind as caustics that
 * brighten with the bass.  The marbles are spheres on the floor along the way; a ray meeting one shows the core seen
 * through the glass -- the refracted direction, turned by the marble's roll, reads the photo -- with a rim of reflection
 * and a highlight.  Behind each marble, away from the light, the floor gathers a bright caustic with rings, as strong
 * as the bass (smoothed in a small field of the scene's own).  The cores are the photo, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the walk past the marbles, which roll as they pass (integrated)
 *   audioBass    -> the caustics on the floor (smoothed)
 *   audioSwell   -> the glass's glow
 *
 * Knobs: sizeP (the marbles' size), causticP (how bright the caustics are), hueP.
//@params sizeP causticP
//@audio audioBass audioSwell
//@state 1 1 60
//@body
/**  The state pass: the bass smoothed.
 *
 * @return
 *   x the smoothed bass, 0, 0, 1.
 **/
vec4 stateStep()
{
    float b = clamp(audioBass, 0.0, 1.0);
    float old = stateFrame < 0.5 ? b : texelFetch(texState, ivec2(0, 0), 0).r;
    return vec4(mix(old, b, 0.05), 0.0, 0.0, 1.0);
}

/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    const float EYE = 0.9, D = 2.4;
    float walk = 0.25 * sceneTime + 0.9 * audioAdvance;
    float R = 0.5 + 0.25 * clamp(sizeP, 0.0, 1.0);
    float bass = texelFetch(texState, ivec2(0, 0), 0).r;
    vec3 ro = vec3(0.0, EYE, 0.0), rd = normalize(vec3(p, 1.0));
    vec3 L = normalize(vec3(-0.5, 0.8, -0.3));
    float tHit = 1e9;
    vec3 col = vec3(0.0);
    float k0 = floor(walk / D);
    // the marbles
    for (int i = 0; i < 8; ++i) {
        float k = k0 + float(i);
        vec3 c = vec3(1.1 * (hash11(k * 3.1) - 0.5) * 2.0, R, k * D - walk + 1.5);
        vec3 oc = ro - c;
        float b = dot(oc, rd), q = dot(oc, oc) - R * R, disc = b * b - q;
        if (disc < 0.0) continue;
        float t = -b - sqrt(disc);
        if (t < 0.05 || t > tHit) continue;
        tHit = t;
        vec3 x = ro + rd * t, n = (x - c) / R;
        vec3 rf = refract(rd, n, 0.67);
        float roll = (k * D - walk) / R;                              // turned by the way it has rolled
        vec3 rr = vec3(rf.x, rf.y * cos(roll) - rf.z * sin(roll), rf.y * sin(roll) + rf.z * cos(roll));
        float twist = atan(rr.y, rr.x) + 2.0 * rr.z;
        vec2 cuv = vec2(0.5) + 0.3 * vec2(cos(twist), sin(twist)) * length(rr.xy) + vec2(0.17, 0.11) * mod(k, 5.0);
        vec3 core = tone(imgLod(cuv, 1.0), fh);
        float band = smoothstep(0.35, 0.0, abs(rr.z) - 0.15);          // the core: a twisted ribbon through the middle
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
        vec3 env = famLight(fh, 0.5, 0.4) * 0.45;
        vec3 glass = mix(core * (0.25 + 0.9 * band), env, fres) * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0));
        glass += famLight(fh, 0.5, 0.9) * pow(max(dot(reflect(rd, n), L), 0.0), 60.0) * 1.2;
        col = glass * 1.3 * exp(-0.04 * t);
    }
    // the floor, its caustics and shadows
    if (rd.y < 0.0) {
        float tf = -EYE / rd.y;
        if (tf < tHit) {
            vec3 x = ro + rd * tf;
            vec3 fl = tone(imgLod(vec2(x.x * 0.15 + 0.5, (x.z + walk) * 0.07), 3.0), fh) * 0.3;
            float caus = 0.0, shadow = 1.0;
            for (int i = 0; i < 8; ++i) {
                float k = k0 + float(i);
                vec3 c = vec3(1.3 * (hash11(k * 3.1) - 0.5) * 2.0, R, k * D - walk + 1.5);
                vec2 off = x.xz - (c.xz - L.xz / L.y * R * 1.6);            // where the light gathers behind it
                float dd = length(off);
                caus += exp(-dd * dd / (0.08 * R * R)) * (0.6 + 0.4 * cos(dd * 40.0 / R)) + 0.3 * exp(-dd / (0.4 * R));
                shadow *= 0.5 + 0.5 * smoothstep(0.6 * R, 1.1 * R, length(x.xz - (c.xz - L.xz / L.y * R)));
            }
            col = fl * shadow + famLight(fh, 0.6, 0.6) * caus * (0.2 + 0.9 * bass) * (0.4 + 0.8 * clamp(causticP, 0.0, 1.0)) * 0.6;
            col *= exp(-0.05 * tf);
        }
    } else if (tHit > 1e8) {
        col = famCol(fh, 0.4) * 0.03 + famLight(fh, 0.6, 0.5) * 0.12 * exp(-abs(p.y) * 6.0);
    }
    finish(col);
}
