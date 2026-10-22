//@doc
 * @brief FUSOR STAR MODE: inside the cage of a fusor: a spherical grid of wires surrounds the eye, and through every
 * opening in it a beam of plasma shoots inward toward the glowing core, dozens of beams converging from all directions
 * past the eye -- the star mode of an inertial electrostatic fusor; the cage turns slowly.  The eye sits a little off
 * the centre looking at the core; each view ray meets the cage from inside (its latitude-longitude wires glow there)
 * and passes near the beams, segments from each opening's middle to the centre; a beam's glow is the ray's closest
 * approach to it, brighter toward the core.  The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the beams' brightness
 *   audioAdvance -> the cage turns (integrated) and the eye drifts round the core
 *
 * Knobs: gridP (how fine the cage is), beamP (the beams' width), hueP.
//@params gridP beamP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float nLat = floor(5.0 + 3.0 * clamp(gridP, 0.0, 1.0));
    float nLon = 2.0 * nLat;
    float bw = 0.006 + 0.008 * clamp(beamP, 0.0, 1.0);
    float bright = 0.4 + 0.9 * clamp(audioSwell, 0.0, 1.0);
    float run = 0.02 * sceneTime + 0.08 * audioAdvance;
    vec3 ro = vec3(0.3 * sin(run), 0.15 * cos(0.7 * run), -0.38 + 0.05 * sin(0.5 * run));
    vec3 fw = normalize(-ro);
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0))), up = cross(rt, fw);
    vec3 rd = normalize(fw * 0.9 + rt * p.x + up * p.y);
    float tu = 0.6 * run;
    mat3 R = mat3(cos(tu), 0.0, -sin(tu), 0.0, 1.0, 0.0, sin(tu), 0.0, cos(tu));   // the cage's turn
    // the cage: where the ray meets the sphere from inside
    float b = dot(ro, rd), c = dot(ro, ro) - 1.0;
    float th = -b + sqrt(max(b * b - c, 0.0));
    vec3 hg = R * (ro + rd * th);
    float lat = asin(clamp(hg.y, -1.0, 1.0)), lon = atan(hg.z, hg.x);
    float dl = abs(fract(lat / 3.14159265 * nLat + 0.5) - 0.5) * 3.14159265 / nLat;
    float dn = abs(fract(lon / 6.2831853 * nLon + 0.5) - 0.5) * 6.2831853 / nLon * cos(lat);
    float wpx = 1.5 / resolution.y * th;
    float wire = exp(-pow(dl / wpx, 2.0)) + exp(-pow(dn / wpx, 2.0));
    vec3 col = famCol(fh, 0.45) * 0.02 + famLight(fh, 0.35, 0.4) * wire * 0.35 * exp(-0.3 * th);
    // the beams: from each opening's middle to the centre
    float acc = 0.0;
    for (int i = 0; i < 8; ++i) {
        float fi = float(i);
        if (fi >= nLat) break;
        float la = ((fi + 0.5) / nLat - 0.5) * 3.14159265;
        for (int j = 0; j < 16; ++j) {
            float fj = float(j);
            if (fj >= nLon) break;
            float lo = (fj + 0.5) / nLon * 6.2831853;
            vec3 o = transpose(R) * vec3(cos(la) * cos(lo), sin(la), cos(la) * sin(lo));
            // the closest approach of the ray (ro + rd t) and the segment s o, s in 0..1
            vec3 w0 = ro;
            float a1 = dot(o, o), b1 = dot(o, rd), d1 = dot(o, w0), e1 = dot(rd, w0);
            float den = a1 - b1 * b1;
            float s = clamp((d1 - b1 * e1) / max(den, 1e-5), 0.0, 1.0);
            float t = max(dot(s * o - ro, rd), 0.0);
            float dd = length(ro + rd * t - s * o);
            acc += exp(-pow(dd / bw, 2.0)) * (0.3 + 0.7 * (1.0 - s));
        }
    }
    col += famLight(fh, 0.6, 0.6) * acc * bright * 0.35;
    // the core
    float dc = length(cross(-ro, rd));
    col += famLight(fh, 0.5, 0.9) * (exp(-dc * dc / 0.0015) + 0.3 * exp(-dc / 0.08)) * bright;
    finish(col);
}
