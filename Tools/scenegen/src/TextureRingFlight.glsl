//@doc
 * @brief TEXTURE RING FLIGHT: flying through an endless procession of
 * floating rings -- great hoops of the photograph, each tilted and turned
 * its own way, hang in a dark space one behind another along a gently
 * curving path, and we glide through them one by one, each ring sweeping
 * past the edge of the view; their rims glow, the ones far ahead are
 * small bright halos.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight (integrated, jump-free)
 *   audioPhase      -> the rings spin (integrated)
 *   audioSpread     -> the rings tilt more
 *   audioKick       -> the rims flash (light)
 *   audioMode       -> the light: cool in minor, warm in major
 *   audioSwell      -> the glow of the far rings (slow)
 *
 * Knobs: spacingP (ring spacing), bandP (ring band width), curveP (path curvature), hueP.
//@params spacingP bandP curveP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float travel = 0.5 * sceneTime + 3.5 * audioAdvance;
    float sp = 1.2 + 1.5 * clamp(spacingP, 0.0, 1.0);
    float curve = 0.15 + 0.35 * clamp(curveP, 0.0, 1.0);
    vec3 ro = vec3(0.0, 0.0, travel);
    vec3 rd = normalize(vec3(p, 1.2));
    vec3 lc = mix(vec3(0.7, 0.85, 1.1), vec3(1.15, 0.9, 0.7), mode);
    vec3 col = vec3(0.0);
    float trans = 1.0;
    float k0 = floor(travel / sp) + 1.0;
    float band = 0.05 + 0.1 * clamp(bandP, 0.0, 1.0);
    for (int i = 0; i < 14; ++i) {
        float k = k0 + float(i);
        float zc = k * sp;
        // The path bends: each ring's centre is offset sideways (camera follows the path at z = travel).
        vec2 off = curve * (vec2(sin(zc * 0.3), cos(zc * 0.23)) - vec2(sin(travel * 0.3), cos(travel * 0.23)));
        vec3 c = vec3(off, zc);
        float h = hash11(k * 0.713);
        // Ring plane normal: tilted and turned.
        float tilt = (0.35 + 0.5 * clamp(audioSpread, 0.0, 1.0)) * (h - 0.5) * 2.0;
        float az = h * 6.28 + 0.2 * sceneTime * (h - 0.5) + 0.5 * audioPhase;
        vec3 n = normalize(vec3(sin(tilt) * cos(az), sin(tilt) * sin(az), cos(tilt)));
        float den = dot(rd, n);
        if (abs(den) < 1e-3) continue;
        float t = dot(c - ro, n) / den;
        if (t <= 0.0) continue;
        vec3 hp = ro + rd * t - c;
        float R = 1.0 + 0.3 * h;
        float r = length(hp);
        float d = abs(r - R);
        float pxw = t / resolution.y * 2.0;
        float cover = smoothstep(band + pxw, band - pxw, d);
        if (cover <= 0.0) continue;
        // Ring surface: the photo around the hoop.
        vec3 u = normalize(cross(n, vec3(0.0, 1.0, 0.0)));
        vec3 v = cross(n, u);
        float ang = atan(dot(hp, v), dot(hp, u)) + 0.5 * audioPhase * (h - 0.5);
        vec2 uv = vec2(ang / 3.14159265, (r - R) / band * 0.25 + h * 3.0);
        float lod = clamp(log2(max(t * 0.6, 1.0)), 0.0, 6.0);
        vec3 ph = imgLod(uv, lod);
        float prof = 1.0 - (d / band) * (d / band);
        vec3 gc = glowColour(ph, vec2(k, 0.0), hueP * 0.159 + h * 0.3);
        vec3 rc = ph * lc * (0.4 + 0.8 * prof) + gc * smoothstep(band * 0.7, band, d) * (0.4 + 1.2 * kick);
        float fog = exp(-t * 0.08) * smoothstep(14.0 * sp, 10.0 * sp, t);   // far rings fade in, never pop
        rc = mix(gc * (0.2 + 0.5 * swell), rc, fog);
        col += trans * cover * rc;
        trans *= 1.0 - cover;
        if (trans < 0.02) break;
    }
    vec3 gc0 = glowColour(imgLod(vec2(0.5), 6.0), vec2(travel * 0.02, 0.0), hueP * 0.159);
    col += trans * gc0 * (0.03 + 0.15 * swell) * exp(-length(p) * 2.0);
    finish(col);
}
