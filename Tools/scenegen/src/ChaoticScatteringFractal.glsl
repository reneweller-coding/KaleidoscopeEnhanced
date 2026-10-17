//@doc
 * @brief CHAOTIC SCATTERING FRACTAL: three mirrored spheres touching a triangle -- a light ray that enters the gap
 * between them may bounce from sphere to sphere many times before it escapes, and which way it leaves is chaotic:
 * in the gaps the spheres show reflections of reflections of reflections, a fractal of ever smaller copies of the
 * world.  The world is the photo, wrapped round like a sky; the spheres turn slowly and breathe apart and together.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the spheres' spacing (they nearly touch in quiet passages: the fractal deepens)
 *   audioPhase      -> the arrangement turns (integrated)
 *   audioKick       -> the deepest reflections flash (light)
 *
 * Knobs: spheresP (three or four spheres), closeP (how close the camera is), tintP (each sphere's tint), hueP.
//@params spheresP closeP tintP
//@audio audioSwell audioKick
//@body
/**  The photo as a sky round the scene: a direction looks up a point on the photo (mirrored, so it has no seam).
 *
 * @param d  The direction (unit). (in)
 *
 * @return
 *   The sky's colour in that direction.
 **/
vec3 sky(vec3 d)
{
    vec2 uv = vec2(atan(d.z, d.x) / 3.14159265, asin(clamp(d.y, -1.0, 1.0)) / 1.5707963) * 0.9 + 0.5;
    return imgLod(uv, 0.8);
}

void main()
{
    vec2 p = screenP();
    int n = 3 + int(clamp(spheresP, 0.0, 0.999) * 2.0);
    float sp = 1.0 + 0.2 * clamp(audioSwell, 0.0, 1.0);        // centre distance in sphere radii (1: touching)
    float spin = 0.08 * audioPhase + 0.03 * sceneTime;
    // the camera on the axis of the arrangement, looking at its centre
    float dist = 2.6 - 1.2 * clamp(closeP, 0.0, 1.0);
    vec3 ro = vec3(0.0, 0.0, dist);
    vec3 rd = normalize(vec3(p, -1.3));
    vec3 c[4];
    float rr = 1.0;
    float R = n == 3 ? sp * 2.0 / 1.7320508 : sp * 1.4142136;   // ring radius so neighbours are sp * 2 apart
    for (int i = 0; i < 4; ++i) {
        float a = 6.2831853 * float(i) / float(n) + spin;
        c[i] = vec3(R * cos(a), R * sin(a), 0.0) * rr;
    }
    vec3 att = vec3(1.0);
    float bounces = 0.0;
    int lastS = -1;
    for (int b = 0; b < 12; ++b) {
        float tBest = 1e9;
        int hit = -1;
        for (int i = 0; i < 4; ++i) {
            if (i >= n || i == lastS) continue;
            vec3 o = ro - c[i];
            float bq = dot(o, rd), cq = dot(o, o) - rr * rr, disc = bq * bq - cq;
            if (disc > 0.0) {
                float t = -bq - sqrt(disc);
                if (t > 1e-4 && t < tBest) { tBest = t; hit = i; }
            }
        }
        if (hit < 0) break;
        ro += rd * tBest;
        vec3 nrm = normalize(ro - c[hit]);
        rd = reflect(rd, nrm);
        vec3 tint = mix(vec3(1.0), imgPalette(float(hit) / float(n) + 0.03 * audioPhase) * 1.4, 0.3 * clamp(tintP, 0.0, 1.0));
        att *= 0.88 * tint;
        bounces += 1.0;
        lastS = hit;
    }
    vec3 col = sky(rd) * att;
    col += imgPalette(0.5 + 0.03 * audioPhase) * smoothstep(4.0, 9.0, bounces) * 0.3 * (0.4 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
