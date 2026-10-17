//@doc
 * @brief MAGNETIC DIPOLE SWARM: a swarm of small magnetic spheres -- each a dipole, so they snap together head to tail
 * into chains, and short chains close on themselves into rings, the lowest-energy shape without an outside field.
 * When an outside field pulls (the bass), the rings break open and straighten into chains lined up along it; when it
 * lets go, the chains curl shut into rings again.  The field's direction turns slowly; the spheres are shaded little
 * balls carrying the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass       -> the outside field (smoothed on the state pass): rings open into chains along it
 *   audioPhase      -> the field's direction turns (integrated)
 *   audioAdvance    -> the swarm drifts (integrated)
 *   audioKick       -> the spheres' sheen flashes (light)
 *
 * Knobs: lengthP (spheres per chain), sizeP (the spheres' size), photoP (photo share), hueP.
//@params lengthP sizeP photoP
//@audio audioBass audioKick
//@state 1 1 60
//@body
/**  The state pass: the bass smoothed over about a third of a second, so the spheres glide between ring and chain.
 *
 * @return
 *   The smoothed bass, 0, 0, 1.
 **/
vec4 stateStep()
{
    float b = clamp(audioBass, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(b, 0.0, 0.0, 1.0);
    return vec4(mix(texelFetch(texState, ivec2(0, 0), 0).r, b, 0.05), 0.0, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float r = 0.012 + 0.008 * clamp(sizeP, 0.0, 1.0);
    float n = floor(6.0 + 6.0 * clamp(lengthP, 0.0, 1.0));
    float cellS = 2.0 * r * n * 0.42 + 4.0 * r;                // a ring's span plus a margin
    vec2 drift = vec2(0.012 * sceneTime + 0.03 * audioAdvance, 0.004 * sceneTime);
    vec2 q = p + drift;
    vec2 cell = floor(q / cellS);
    float fa = 0.02 * audioPhase + 0.03 * sceneTime;
    vec2 B = vec2(cos(fa), sin(fa));                            // the outside field's direction
    float pull = texelFetch(texState, ivec2(0, 0), 0).r;          // the bass, smoothed
    vec3 tone = imgPalette(0.3 + 0.03 * audioPhase);
    vec3 col = imgLod(p * 0.3 + 0.5, 5.0) * 0.1;
    float bestZ = -1.0;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 cc = cell + vec2(float(i), float(j));
        vec2 h = hash22(cc);
        vec2 ctr = (cc + 0.5) * cellS + (h - 0.5) * cellS * 0.25;
        // ring (m = 0) or chain (m = 1): the stronger the field and the weaker this group's own closure, the straighter
        float m = smoothstep(0.0, 1.0, clamp(1.6 * pull - 0.9 * h.x + 0.15, 0.0, 1.0));
        float spin = 0.15 * sceneTime * (h.y - 0.5);
        float R = n * 2.0 * r / 6.2831853;
        for (int k = 0; k < 12; ++k) {
            if (float(k) >= n) break;
            float fk = float(k);
            float ang = 6.2831853 * fk / n + spin;
            vec2 ringP = R * vec2(cos(ang), sin(ang));
            vec2 chainP = B * (fk - 0.5 * (n - 1.0)) * 2.0 * r;
            vec2 bp = ctr + mix(ringP, chainP, m);
            vec2 d = q - bp;
            float dd = dot(d, d);
            if (dd < r * r) {
                float z = sqrt(1.0 - dd / (r * r));
                if (z > bestZ) {
                    bestZ = z;
                    vec3 nrm = vec3(d / r, z);
                    vec3 photo = imgLod((bp - drift) * 0.55 + 0.5 + d * 0.5, 0.8);
                    float diff = 0.35 + 0.65 * max(dot(nrm, normalize(vec3(-0.4, 0.5, 0.75))), 0.0);
                    float spec = pow(max(dot(reflect(vec3(0.0, 0.0, -1.0), nrm), normalize(vec3(-0.4, 0.5, 0.75))), 0.0), 30.0);
                    col = mix(tone * 1.2, photo * 1.5, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0)) * diff
                          + spec * (0.3 + 0.6 * clamp(audioKick, 0.0, 1.0));
                }
            }
        }
    }
    finish(col);
}
