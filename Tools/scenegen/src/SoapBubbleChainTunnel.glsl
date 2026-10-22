//@doc
 * @brief SOAP BUBBLE CHAIN TUNNEL: a chain of soap bubbles strung along the flight, and the view flies through their
 * shimmering skins one after another -- the next bubble's front ahead, the one around the eye opening as its skin
 * passes; the bubbles swell and settle with the music.  Every bubble is a sphere on the axis; the ray meets each skin
 * in front and behind, and every meeting adds a thin film's light: its thickness swirls slowly and drains toward the
 * bottom, its interference picks between shades of the photo's colour family, and the skin shines strongest where it
 * is seen at a grazing angle.  The skins let most light through, so the chain shows far into the distance.  The photo
 * gives the skins' brightness.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the bubbles swell and settle
 *   audioAdvance -> the flight through the chain (integrated)
 *   audioPhase   -> the films swirl (integrated)
 *
 * Knobs: sizeP (the bubbles' size), filmP (how thick the films are), hueP.
//@params sizeP filmP
//@audio audioSwell audioPhase
//@body
/**  A soap film's light where the ray meets a skin.
 *
 * @param n    The skin's normal there. (in)
 * @param rd   The ray's direction. (in)
 * @param k    The bubble's number. (in)
 * @param th0  The film's mean thickness (in wavelengths). (in)
 * @param fh   The family's hue. (in)
 *
 * @return
 *   The film's light.
 **/
vec3 film(vec3 n, vec3 rd, float k, float th0, float fh)
{
    float swirl = 0.05 * sceneTime + 0.3 * audioPhase;
    vec2 q = vec2(2.0 * n.x + n.y, 2.0 * n.z - n.y);                   // no seam round the sphere
    float thick = th0 * (0.5 + 1.2 * fbm(q * 1.3 + vec2(swirl, 0.3 * swirl) + hash11(k) * 9.0)) * (1.15 - 0.35 * n.y);
    float c = abs(dot(n, rd));
    float ph = 6.2831853 * 2.0 * thick * sqrt(max(1.0 - (1.0 - c * c) / 1.77, 0.0));
    vec3 tone = mix(famLight(fh, 0.2, 0.5), famLight(fh, 0.8, 0.5), 0.5 + 0.5 * cos(ph));
    tone = mix(tone, famLight(fh, 0.5, 0.8), 0.5 + 0.5 * cos(2.0 * ph + 1.0) * 0.5);
    float fres = 0.2 + 0.9 * pow(1.0 - c, 2.0);
    float bands = pow(0.5 + 0.5 * cos(ph), 2.0);                       // the film's light and dark bands
    vec3 photo = imgLod(vec2(0.5 + 0.35 * n.x, 0.5 + 0.35 * n.y), 3.0);
    float glint = pow(max(dot(n, normalize(vec3(-0.5, 0.6, -0.6))), 0.0), 60.0) * 2.0;   // a window's reflection
    return tone * fres * (0.1 + 1.1 * bands) * (0.6 + 1.0 * luma(photo)) + famLight(fh, 0.5, 0.9) * glint;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float D = 1.6, F = 1.1;
    float fly = 0.3 * sceneTime + 1.0 * audioAdvance;
    float grow = (0.85 + 0.25 * clamp(sizeP, 0.0, 1.0)) * (0.95 + 0.1 * clamp(audioSwell, 0.0, 1.0));
    float th0 = 0.9 + 0.8 * clamp(filmP, 0.0, 1.0);
    vec3 rd = normalize(vec3(p, F));
    vec3 col = vec3(0.0);
    float trans = 1.0;
    float k0 = floor(fly / D) - 1.0;
    for (int i = 0; i < 9; ++i) {
        float k = k0 + float(i);
        float R = D * 0.62 * (0.88 + 0.24 * hash11(k * 3.7)) * grow;
        vec3 c = vec3(0.12 * sin(1.7 * k), 0.1 * cos(2.3 * k), k * D - fly);   // the chain sways a little
        float b = dot(rd, c), q = dot(c, c) - R * R;
        float disc = b * b - q;
        if (disc <= 0.0) continue;
        float sq = sqrt(disc);
        float tFar = b + sq, tNear = b - sq;
        float fade = exp(-0.06 * max(tNear, 0.0));
        if (tNear > 0.0) {                                            // the front skin ahead
            col += trans * film(normalize(rd * tNear - c), rd, k, th0, fh) * fade;
            trans *= 0.85;
        }
        if (tFar > 0.0) {                                             // the back skin
            col += trans * film(normalize(rd * tFar - c), rd, k + 0.5, th0, fh) * exp(-0.06 * tFar);
            trans *= 0.85;
        }
    }
    col += famCol(fh, 0.45) * (0.05 + 0.2 * exp(-length(p) * 3.0)) * trans;
    finish(col);
}
