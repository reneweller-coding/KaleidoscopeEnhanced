//@doc
 * @brief BILLIARD CAUSTIC RAYS: an endless field of mirror billiards, each an ellipse whose walls breathe in and out
 * together; inside every one a point of light sends out a fan of rays that bounce off the walls, and where the
 * reflected rays crowd together they draw bright caustic envelopes -- cusps and arcs of light.  Each ray is traced
 * for four bounces off the ellipse (the line-ellipse intersection, then the mirror reflection about the wall's
 * normal), drawn as faint glowing segments; the caustics appear by themselves where many segments pass close.  The
 * light is a shade of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the walls' shape glides with the chord changes (from circle toward a long ellipse)
 *   audioAdvance     -> the light sources wander inside their billiards (integrated)
 *   audioSwell       -> the walls breathe
 *
 * Knobs: rayP (how many rays), cellP (the billiards' size), hueP.
//@params rayP cellP
//@audio audioHarmAdvance audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float S = 0.5 + 0.3 * clamp(cellP, 0.0, 1.0);
    float rays = floor(40.0 + 24.0 * clamp(rayP, 0.0, 1.0));
    float ecc = 0.75 + 0.2 * sin(0.6 * h);                      // the walls' aspect (b / a)
    float breathe = 1.0 + 0.04 * clamp(audioSwell, 0.0, 1.0) * sin(0.6 * sceneTime);
    float wander = 0.05 * sceneTime + 0.2 * audioAdvance;
    vec2 cid = floor(p / S + 0.5);
    vec2 q = (p - cid * S) / S;
    float hc = fract(sin(dot(cid, vec2(12.9898, 78.233))) * 43758.5453);
    vec2 ab = vec2(0.46, 0.46 * ecc) * breathe;                  // the ellipse's half axes (cell units)
    vec2 src = vec2(0.6 * ab.x * sin(wander + 6.0 * hc), 0.6 * ab.y * cos(0.7 * wander + 3.0 * hc));
    float light = 0.0;
    for (int i = 0; i < 64; ++i) {
        float fi = float(i);
        if (fi >= rays) break;
        float ang = 6.2831853 * (fi + 0.5) / rays + hc;
        vec2 o = src, d = vec2(cos(ang), sin(ang));
        for (int b = 0; b < 4; ++b) {
            // the wall ahead: (o + t d) on the ellipse x^2/a^2 + y^2/b^2 = 1
            vec2 oa = o / ab, da = d / ab;
            float A = dot(da, da), B = 2.0 * dot(oa, da), C = dot(oa, oa) - 1.0;
            float t = (-B + sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A);
            vec2 hit = o + d * t;
            // this segment's light
            vec2 e = hit - o;
            float hh = clamp(dot(q - o, e) / dot(e, e), 0.0, 1.0);
            float dist = length(q - o - e * hh);
            light += exp(-dist * dist / 0.00002) * (1.0 - 0.18 * float(b));
            // reflect about the wall's normal
            vec2 n = normalize(hit / (ab * ab));
            d = reflect(d, n);
            o = hit - n * 1e-4;
        }
    }
    // the walls themselves: a thin mirror line
    float wall = abs(length(q / ab) - 1.0) * min(ab.x, ab.y);
    vec3 col = famLight(fh, 0.3 + 0.4 * hc, 0.25 * smoothstep(1.0, 4.0, light)) * light * 0.22;
    col += famCol(fh, 0.5) * exp(-wall / 0.004) * 0.2;
    col += famLight(fh, 0.6, 0.8) * exp(-length(q - src) / 0.012) * 0.4;
    finish(famExpose(col, 1.85, 1.00, 0.00, fh));
}
