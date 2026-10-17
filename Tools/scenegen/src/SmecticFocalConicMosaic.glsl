//@doc
 * @brief SMECTIC FOCAL-CONIC MOSAIC: the focal-conic texture of a smectic liquid crystal -- a mosaic of domains, each
 * filled with a family of nested ellipses crossed by hyperbolas (the shadows of Dupin cyclides), seen between
 * crossed polarisers: interference colours banded along the ellipses, and dark Maltese-cross brushes wherever the
 * layers stand parallel to a polariser.  The polarisers turn, so the brushes sweep round every domain; the photo
 * shines through in its own colours.
 *
 * Audio Reactivity (structure, not only light):
 *   audioChromaHue  -> the domain size breathes with the key's hue (continuous)
 *   audioPhase      -> the polarisers turn (integrated): the dark brushes sweep
 *   audioSwell      -> the layer count in each domain (thicker film, more colour bands)
 *   audioKick       -> the domain walls flash (light)
 *
 * Knobs: domainP (domain size), bandsP (colour bands per domain), photoP (how much of the photo shines through),
 * hueP.
//@params domainP bandsP photoP
//@audio audioSwell audioKick
//@body
void main()
{
    vec2 p = screenP();
    float S = (0.2 + 0.2 * clamp(domainP, 0.0, 1.0)) * (1.0 + 0.2 * sin(audioChromaHue));
    vec2 g = p / S;
    vec2 cell = floor(g);
    // the domain: the nearest of the jittered, slowly drifting centres; the second nearest gives the wall
    float d1 = 1e9, d2 = 1e9;
    vec2 cId = vec2(0.0), cPos = vec2(0.0);
    for (int j = -1; j <= 1; ++j)
        for (int i = -1; i <= 1; ++i) {
            vec2 c = cell + vec2(i, j);
            vec2 h = hash22(c);
            vec2 o = c + 0.5 + 0.38 * sin(6.2831853 * h + 0.05 * sceneTime * (0.5 + h.yx));
            float d = length(g - o);
            if (d < d1) { d2 = d1; d1 = d; cId = c; cPos = o; }
            else if (d < d2) d2 = d;
        }
    vec2 h = hash22(cId + 7.3);
    float phi = 6.2831853 * h.x + 0.02 * sceneTime;
    float f = 0.15 + 0.3 * h.y;                                 // the focal distance (eccentricity)
    vec2 q = rot2(phi) * (g - cPos);
    float r1 = length(q - vec2(f, 0.0)), r2 = length(q + vec2(f, 0.0));
    float mu = log((r1 + r2) / (2.0 * f) + sqrt(max((r1 + r2) * (r1 + r2) / (4.0 * f * f) - 1.0, 0.0)));
    // the layers' normal: the gradient of mu (normal to the ellipses)
    float e = 0.01;
    vec2 qx = q + vec2(e, 0.0), qy = q + vec2(0.0, e);
    float mux = log((length(qx - vec2(f, 0.0)) + length(qx + vec2(f, 0.0))) / (2.0 * f) + 1.0);
    float muy = log((length(qy - vec2(f, 0.0)) + length(qy + vec2(f, 0.0))) / (2.0 * f) + 1.0);
    float mu0 = log((r1 + r2) / (2.0 * f) + 1.0);
    vec2 nrm = rot2(-phi) * vec2(mux - mu0, muy - mu0);
    float theta = atan(nrm.y, nrm.x);
    float pol = 0.25 * audioPhase + 0.03 * sceneTime;
    float brush = pow(sin(2.0 * (theta - pol)), 2.0);           // dark where the layers stand along a polariser
    float bands = (3.0 + 5.0 * clamp(bandsP, 0.0, 1.0)) * (1.0 + 0.4 * clamp(audioSwell, 0.0, 1.0));
    float ret = mu * bands + h.x * 3.0;
    vec3 film = 0.5 + 0.5 * cos(6.2831853 * (ret * vec3(1.0, 1.15, 1.32) * 0.25 + vec3(0.0, 0.1, 0.2)));
    vec3 photo = imgLod(p * 0.7 + 0.5, 0.8);
    // the photo carries the picture; the film only tints it, the brushes darken it
    float tintAmt = 0.25 + 0.3 * (1.0 - clamp(photoP, 0.0, 1.0));
    vec3 col = photo * (0.2 + 1.1 * brush) * mix(vec3(1.0), film * 1.6, tintAmt);
    float wall = 1.0 - smoothstep(0.0, 0.06, d2 - d1);
    vec3 tone = imgPalette(0.5 + 0.03 * audioPhase);
    col = mix(col, mix(tone, vec3(1.0), 0.4) * (0.3 + 0.6 * clamp(audioKick, 0.0, 1.0)), wall * 0.7);
    finish(col);
}
