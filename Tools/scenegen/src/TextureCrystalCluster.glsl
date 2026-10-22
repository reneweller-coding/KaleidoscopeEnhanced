//@doc
 * @brief TEXTURE CRYSTAL CLUSTER: a cluster of crystals seen close up, filling the picture: long six-sided prisms
 * with pointed tips rising from below, the photo glowing inside them and shifted by every facet, their edges bright; a
 * light wanders round with the music's phase, the crystals' inner glow grows as it swells, and kicks make single facets
 * flash.  Each crystal is a prism along its own direction, drawn from the back ones to the front: a place inside it
 * lies on one of its three visible faces or on a face of its tip; every face has its normal, lit by the wandering
 * light, and shows the photo displaced by that normal.  The flashing facets are drawn from the crystal's and face's
 * number.  The crystals take the photo's colours, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase  -> the light wanders round the cluster (integrated)
 *   audioSwell  -> the crystals' inner glow grows
 *   audioKick   -> single facets flash
 *
 * Knobs: countP (how many crystals), refractP (how far the faces shift the photo), hueP.
//@params countP refractP
//@audio audioPhase audioSwell audioKick
//@body
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
    vec2 p = screenP();
    float fh = famHue();
    float n = floor(7.0 + 6.0 * clamp(countP, 0.0, 1.0));
    float refr = 0.05 + 0.1 * clamp(refractP, 0.0, 1.0);
    float la = 0.04 * sceneTime + 0.4 * audioPhase;
    vec3 L = normalize(vec3(cos(la), sin(la), 0.8));
    float sw = clamp(audioSwell, 0.0, 1.0), kick = clamp(audioKick, 0.0, 1.0);
    float px = 1.0 / resolution.y;
    vec3 col = tone(imgLod(vec2(0.5) + p * 0.2, 5.0), fh) * 0.08;    // the dark matrix behind
    for (int k = 0; k < 13; ++k) {
        float i = float(k);
        if (i >= n) break;
        vec2 h = hash22(vec2(i, 4.2));
        vec2 base = vec2((h.x - 0.5) * 2.6, -0.7 - 0.25 * h.y);
        float ang = 1.5707963 + (h.x - 0.5) * 1.3 + 0.5 * (h.y - 0.5);
        vec2 ax = vec2(cos(ang), sin(ang));
        float len = 0.9 + 0.7 * hash11(i * 7.1), W = 0.11 + 0.08 * hash11(i * 3.7);
        vec2 q = p - base;
        float u = dot(q, ax), v = dot(q, vec2(-ax.y, ax.x));
        float tip = 0.25 + 0.15 * hash11(i * 5.3);
        float wv = W * clamp((len + tip - u) / tip, 0.0, 1.0);        // the width, narrowing at the tip
        if (u < 0.0 || u > len + tip || abs(v) > wv) continue;
        // which face: three along the prism, three more on the tip
        float face = v < -wv / 3.0 ? 0.0 : (v > wv / 3.0 ? 2.0 : 1.0);
        bool onTip = u > len;
        float fa = (face - 1.0) * 0.9;
        vec3 nrm = normalize(vec3(-ax.y * sin(fa), ax.x * sin(fa), cos(fa)) + (onTip ? vec3(ax * 0.7, 0.0) : vec3(0.0)));
        float diff = max(dot(nrm, L), 0.0);
        float spec = pow(max(dot(reflect(-L, nrm), vec3(0.0, 0.0, 1.0)), 0.0), 24.0);
        vec3 inner = tone(imgLod(fract(vec2(0.5) + p * 0.45 + nrm.xy * refr * 3.0 + h * 0.3), 1.0), fh);
        float glowIn = 0.45 + 0.7 * sw * (1.0 - abs(v) / max(wv, 1e-3));
        float fid = i * 6.0 + face + (onTip ? 3.0 : 0.0);
        float flash = kick * step(0.8, hash11(fid * 1.31));             // the same few facets flash on every kick
        vec3 c = inner * (0.35 + 0.65 * diff) * glowIn + famLight(fh, 0.6, 0.8) * (spec * 0.8 + flash * 0.6);
        // the edges between the faces and round the outline
        float e = min(abs(abs(v) - wv / 3.0), wv - abs(v));
        e = min(e, abs(u - len) + max(abs(v) - wv, 0.0));
        c += famLight(fh, 0.6, 0.7) * exp(-pow(e / (1.5 * px + 0.002), 2.0)) * 0.5;
        col = c;                                                      // the nearer crystal covers the ones behind
    }
    finish(col);
}
