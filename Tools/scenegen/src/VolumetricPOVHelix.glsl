//@doc
 * @brief VOLUMETRIC POV HELIX: a wall of spinning LED helices -- a volumetric persistence-of-vision display: each
 * column's helical blade sweeps a cylinder so fast that, in the eye's memory, its LEDs fill it; together the columns
 * show one large glowing 3D form that slowly turns into another.  The display is the form intersected with the
 * columns' cylinders, its light banded by the helices' pitch; it is rendered by marching through the volume and
 * gathering light wherever a point is inside the form and inside a column.  The LEDs' colours are shades of one
 * colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the form morphs with the chord changes (sphere, torus, a twisted blob)
 *   audioAdvance     -> the helices' spin moves the bands (integrated) and the form turns
 *   audioSwell       -> the LEDs' brightness
 *
 * Knobs: columnP (how close the columns stand), pitchP (the helices' pitch), hueP.
//@params columnP pitchP
//@audio audioHarmAdvance audioSwell
//@body
/**  The displayed form's distance (negative inside).
 *
 * @param x     The point. (in)
 * @param kind  The form, fractional: blended between sphere (0), torus (1) and twisted blob (2). (in)
 * @param turn  The form's turn. (in)
 *
 * @return
 *   The signed distance.
 **/
float formD(vec3 x, float kind, float turn)
{
    x.xz = rot2(turn) * x.xz;
    float sph = length(x) - 0.75;
    float tor = length(vec2(length(x.xz) - 0.6, x.y)) - 0.25;
    vec3 y = x;
    y.xz = rot2(2.0 * y.y) * y.xz;
    float blob = length(y * vec3(1.0, 0.7, 1.4)) - 0.65 + 0.12 * sin(5.0 * y.x) * sin(4.0 * y.z);
    float k = mod(kind, 3.0);
    // blending distances is fine here: the form is a volume, and every blend is a volume too
    return k < 1.0 ? mix(sph, tor, smoothstep(0.0, 1.0, k)) : k < 2.0 ? mix(tor, blob, smoothstep(1.0, 2.0, k))
                   : mix(blob, sph, smoothstep(2.0, 3.0, k));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float kind = h * 0.5;
    float G = 0.13 + 0.07 * clamp(columnP, 0.0, 1.0);          // the columns' spacing
    float pitch = 18.0 + 18.0 * clamp(pitchP, 0.0, 1.0);
    float spin = 0.5 * sceneTime + 2.0 * audioAdvance;
    float turn = 0.04 * sceneTime + 0.15 * audioAdvance;
    float bright = 0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 ro = vec3(0.0, 0.15, -2.1);
    vec3 rd = normalize(vec3(p, 1.3));
    rd.yz = rot2(-0.06) * rd.yz;
    vec3 col = vec3(0.0);
    float t = 0.9;
    for (int i = 0; i < 90; ++i) {
        vec3 x = ro + rd * t;
        float d = formD(x, kind, turn);
        if (d < 0.0) {
            // inside the form: is the point inside a column's swept cylinder, and on a helical band
            vec2 cell = x.xz / G;
            vec2 cid = floor(cell + 0.5);
            vec2 off = (cell - cid) * G;
            float rc = length(off);
            float inCol = smoothstep(0.45 * G, 0.38 * G, rc);
            float ang = atan(off.y, off.x);
            float band = pow(0.5 + 0.5 * cos(pitch * x.y + ang - spin + 3.0 * fract(sin(dot(cid, vec2(12.9898, 78.233))) * 43758.5453)), 6.0);
            float shade = 0.3 + 0.4 * fract(cid.x * 0.13 + cid.y * 0.07) + 0.3 * (x.y + 0.8) / 1.6;
            col += famLight(fh, shade, 0.3 * band) * inCol * (0.15 + band) * 0.03 * bright;
        }
        t += max(abs(d) * 0.5, 0.02);
        if (t > 4.2) break;
    }
    // the dark frame of the display's columns
    col += famCol(fh, 0.45) * 0.015;
    finish(col);
}
