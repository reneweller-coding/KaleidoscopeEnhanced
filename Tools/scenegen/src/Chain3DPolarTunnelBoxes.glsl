//@doc
 * @brief CHAIN3DPOLARTUNNELBOXES: a raymarched world built from a chain of continuous 3D space
 * transforms -- a tunnel whose wall is a mirrored ring of blocks, repeated along the flight.  We fly slowly through it; the surfaces are textured
 * with the photograph read through a 2D transform chain of its own
 * (triplanar), lit and fogged.
 * Every stage is continuous, so the structure morphs without jumps.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight (integrated, jump-free)
 *   audioPhase      -> the folds turn (integrated)
 *   audioSpread     -> the bodies thicken
 *   audioKick       -> the rims flare (light)
 *   audioMode       -> the light: cool in minor, warm in major
 *   audioSwell      -> the fog glow, the colour saturation and the width of the flight tube (slow)
 *   audioPhase      -> the surface colours wander (integrated, jump-free)
 *
 * Knobs: styleP (photo surface / glowing rims), speedP (flight speed), detailP (texture sharpness), paletteP (photo colours / a colour field
 * following the 2D chain), hueP.
//@params styleP speedP detailP paletteP
//@audio audioSpread audioKick audioMode audioSwell
//@body
float gT, gSpread, gRot;
float field3(vec3 p)
{
    vec3 q = fPolarZ(p, 12.0);
    q.x -= 2.2;
    q.z = 0.8 * (abs(mod(q.z / 0.8 - 1.0, 4.0) - 2.0) - 1.0);
    q = fRot(q, vec3(0.0, 0.0, 1.0), 0.3 * sin(gRot));
    gP = q * 2.0;
    return min(sdBox3(q, vec3(0.35, 0.25 + 0.2 * gSpread, 0.5)), 3.0 - length(p.xy));
}
// The surface colouring: a 2D chain of its own, applied triplanarly.
vec2 chain(vec2 uv)
{
    uv = tKaleido(uv, vec2(0.5), 8.0, gRot);
    uv = mirrorUV(uv);
    uv = tDroste(uv, vec2(0.5), 3.0, gT * 0.2);
    return uv;
}
// One plane: the photo through the chain, plus a colour field that follows
// the chain's own coordinates (mirrorUV keeps it seamless at the atan cuts).
vec3 chainPlane(vec2 uv, float lod, float pal)
{
    vec2 c = chain(uv);
    vec3 ph = imgLod(c, lod);
    vec2 m = mirrorUV(c);
    // The colours wander on their own (integrated music phase, jump-free), the
    // mode shifts the palette, the swell saturates it, the kick lights it.
    float h = hueP * 0.159 + 0.9 * m.x + 0.6 * m.y + 0.25 * luma(ph) + 0.12 * audioPhase + 0.004 * sceneTime + 0.3 * clamp(audioMode, 0.0, 1.0);
    float sat = 0.55 + 0.4 * clamp(audioSwell, 0.0, 1.0);
    vec3 fc = hsv2rgb(vec3(fract(h), sat, 1.0)) * (0.35 + 1.3 * luma(ph)) * (1.0 + 0.4 * clamp(audioKick, 0.0, 1.0));
    return mix(ph, fc, pal);
}
vec3 photoChain3(vec3 q, vec3 n, float lod, float pal)
{
    vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
    return chainPlane(q.yz * 0.35 + 0.5, lod, pal) * w.x + chainPlane(q.zx * 0.35 + 0.5, lod, pal) * w.y + chainPlane(q.xy * 0.35 + 0.5, lod, pal) * w.z;
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    gT = (0.15 + 0.25 * clamp(speedP, 0.0, 1.0)) * sceneTime + 1.5 * audioAdvance;
    gRot = 0.02 * sceneTime + 0.2 * audioPhase;
    gSpread = clamp(audioSpread, 0.0, 1.0);
    vec3 ro;
    mat3 cf = camFrame(gT, ro);
    gCam = ro;
    gTube = 0.4 + 0.15 * swell;                             // the carved tube breathes with the slow swell
    vec3 rd = cf * normalize(vec3(p, 1.1));
    float t = 0.05; float d = 1.0; bool hit = false; vec3 fp = vec3(0.0); float fdr = 1.0;
    for (int i = 0; i < 100; ++i) {
        d = fieldD(ro + rd * t);
        if (abs(d) < 0.0008 * t) { hit = true; fp = gP; fdr = gDR; break; }   // gP of the hit point: no extra evaluation
        t += d * 0.8;
        if (t > 30.0) break;
    }
    vec3 lc = mix(vec3(0.7, 0.85, 1.1), vec3(1.15, 0.9, 0.7), mode);
    // The fog takes the palette's hue (wandering with the music) rather than the photo's cast.
    vec3 fogPal = hsv2rgb(vec3(fract(hueP * 0.159 + 0.12 * audioPhase + 0.004 * sceneTime + 0.3 * mode + 0.5), 0.55, 1.0));
    vec3 fogC = mix(glowColour(imgK(vec2(0.5) + 0.2 * p, 5.0), p, hueP * 0.159), fogPal, 0.8 * clamp(paletteP, 0.0, 1.0)) * (0.05 + 0.1 * swell);
    vec3 col = fogC;
    if (hit) {
        vec3 q = ro + rd * t;
        vec3 n = normal3(q);
        float lod = clamp(log2(t * 2.0) + 1.5 * (1.0 - clamp(detailP, 0.0, 1.0)), 0.0, 7.0);
        vec3 tex = photoChain3(fp, n, lod, 0.2 + 0.7 * clamp(paletteP, 0.0, 1.0));
        float tm = luma(tex);
        tex = max((tex - tm) * 1.5 + tm, 0.0) * 1.5;           // livelier colour, brighter
        vec3 L = normalize(vec3(0.5, 0.7, -0.4));
        float diff = max(dot(n, L), 0.0);
        float ao = 0.0;
        for (int k = 1; k <= 2; ++k) { float h = 0.06 * float(k); ao += (h - fieldD(q + n * h)) / h; }
        ao = clamp(1.0 - 0.4 * ao, 0.2, 1.0);
        float fres = pow(1.0 - abs(dot(n, -rd)), 3.0);
        vec3 surf = tex * lc * (0.35 + 0.9 * diff) * ao;
        vec3 rimC = glowColour(tex, fp.xy, hueP * 0.159);
        vec3 rim = rimC * fres * (0.7 + 1.5 * kick) + surf * 0.4;       // lab audit: the glow style was half as bright
        float st = clamp(styleP, 0.0, 1.0);
        vec3 sc = mix(surf + rimC * fres * (0.15 + 0.6 * kick), rim * 1.3 + rimC * 0.12 * ao, smoothstep(0.5, 1.0, st));
        col = mix(fogC, sc, exp(-t * (0.06 + 0.04 * swell)));
    }
    finish(col);
}
