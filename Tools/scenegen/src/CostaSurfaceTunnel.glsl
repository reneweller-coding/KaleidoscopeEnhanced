//@doc
 * @brief COSTA SURFACE TUNNEL: a flight through a world built from Costa-like surfaces -- floors stacked one above the
 * other, pierced by hourglass tubes, and wherever a tube meets a floor the crossing is resolved Costa's way: the tube
 * opens alternately up into the floor and down into it, four saddles round each waist, so floors and tubes are one
 * single surface with tunnels.  The eye glides between the floors and past the tubes; the photo lies on the surface.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight (integrated: the music's drive)
 *   audioSwell      -> the saddles open wider
 *   audioKick       -> the surface's sheen flashes (light)
 *
 * Knobs: waistP (the tubes' waist), handleP (the saddles' base size), photoP (photo share), hueP.
//@params waistP handleP photoP
//@audio audioSwell audioKick
//@body
float gEps = 0.1;          // the saddles' size
float gWaist = 0.5;        // the tubes' waist radius

/**  The Costa-like world's distance estimate: (r - R(y)) sin(pi y / P) - eps cos(2 phi) near each waist, divided
 * by its gradient's length.
 *
 * @param x  The point. (in)
 *
 * @return
 *   The distance estimate.
 **/
float costaD(vec3 x)
{
    const float P = 4.0;
    vec2 cxz = x.xz - P * floor(x.xz / P + 0.5);
    float yl = x.y - P * floor(x.y / P + 0.5);
    float r = max(length(cxz), 1e-4);
    float w = 6.2831853 / P;
    float R = gWaist + 0.6 * (0.5 - 0.5 * cos(w * yl));        // the hourglass tube, narrow at each floor
    float dR = 0.6 * 0.5 * w * sin(w * yl);
    float A = r - R;
    float B = sin(0.5 * w * x.y) / (0.5 * w);                   // zero on every floor, changing sign from floor to floor
    float dB = cos(0.5 * w * x.y);
    float phi = atan(cxz.y, cxz.x);
    float loc = exp(-((r - gWaist) * (r - gWaist) + yl * yl) * 3.0);
    float f = A * B - gEps * cos(2.0 * phi) * loc;
    vec3 g = vec3(B * cxz.x / r, -B * dR + A * dB, B * cxz.y / r);
    return abs(f) / max(length(g), 0.15) * 0.7 - 0.01;
}

void main()
{
    vec2 p = screenP();
    gWaist = 0.4 + 0.3 * clamp(waistP, 0.0, 1.0);
    gEps = (0.08 + 0.12 * clamp(handleP, 0.0, 1.0)) * (0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    float s = 0.45 * sceneTime + 1.6 * audioAdvance;
    // the eye between the floors, beside the tube columns, looking about slowly
    vec3 ro = vec3(s, 2.0 + 0.35 * sin(0.21 * sceneTime), 2.0 + 0.3 * sin(0.13 * sceneTime));
    float ya = 0.35 * sin(0.05 * sceneTime), pa = 0.15 * sin(0.07 * sceneTime);
    vec3 fw = normalize(vec3(cos(ya) * cos(pa), sin(pa), sin(ya) * cos(pa)));
    vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw)), up = cross(fw, rt);
    vec3 rd = normalize(fw * 1.2 + rt * p.x + up * p.y);
    float t = 0.0;
    bool hit = false;
    for (int i = 0; i < 110; ++i) {
        float d = costaD(ro + rd * t);
        if (d < 0.001 * (1.0 + t)) { hit = true; break; }
        t += max(d, 0.004);
        if (t > 24.0) break;
    }
    vec3 tone = imgPalette(0.35 + 0.03 * audioPhase);
    vec3 fog = imgLod(p * 0.3 + 0.5, 4.0) * 0.25 + tone * 0.08;
    vec3 col = fog;
    if (hit) {
        vec3 x = ro + rd * t;
        vec2 e = vec2(0.003, 0.0);
        vec3 n = normalize(vec3(costaD(x + e.xyy) - costaD(x - e.xyy), costaD(x + e.yxy) - costaD(x - e.yxy),
                                costaD(x + e.yyx) - costaD(x - e.yyx)));
        vec2 uv = mirrorUV(vec2(x.x * 0.11 + x.z * 0.04, x.y * 0.11 + x.z * 0.09));
        vec3 photo = imgLod(uv, 0.4);
        float diff = 0.3 + 0.7 * abs(dot(n, normalize(vec3(0.3, 0.8, -0.4))));
        float head = abs(dot(n, rd));
        float spec = pow(head, 20.0) * (0.2 + 0.8 * clamp(audioKick, 0.0, 1.0));
        float level = fract(x.y / 8.0);                         // floors alternate tint
        vec3 c = mix(imgPalette(0.2 + 0.4 * step(0.5, level) + 0.03 * audioPhase) * 1.2, photo * 1.3,
                     0.45 + 0.45 * clamp(photoP, 0.0, 1.0)) * (0.4 * diff + 0.6 * head) + spec * 0.4;
        col = mix(fog, c, exp(-0.09 * t));
    }
    finish(col);
}
