//@doc
 * @brief STELLARATOR FLUX SURFACES: a ride along the magnetic axis of a stellarator: round the eye the nested flux
 * surfaces -- tubes of elliptic cross-section that twist as they run -- glow faintly, and on each one the field lines
 * wind round as luminous helices; the twist of the field lines changes with the chords.  The view looks along the axis;
 * a surface is met where the ray's distance from the axis equals the ellipse's radius at the ray's angle, the ellipse
 * turned by the depth (found by a few fixed-point steps); there the field lines are the lines of constant poloidal angle
 * minus the rotational transform times the depth.  Inner surfaces glow over the outer.  Distinct from TokamakFusionCore,
 * which shows the core.  The surfaces are shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the ride along the axis (integrated)
 *   audioHarmAdvance -> the field lines' twist (the rotational transform) glides with the chords
 *   audioSwell       -> the surfaces' glow
 *
 * Knobs: lineP (how many field lines), ellipseP (how elliptic the surfaces are), hueP.
//@params lineP ellipseP
//@audio audioHarmAdvance audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float nl = floor(6.0 + 6.0 * clamp(lineP, 0.0, 1.0));
    float ecc = 0.25 + 0.3 * clamp(ellipseP, 0.0, 1.0);
    float fly = 0.4 * sceneTime + 1.5 * audioAdvance;
    float h = max(audioHarmAdvance, 0.0);
    float iota = 0.25 + 0.2 * sin(0.6 * h);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float rp = max(length(p), 1e-3), th = atan(p.y, p.x);
    vec3 col = famCol(fh, 0.45) * 0.015;
    for (int k = 0; k < 4; ++k) {                                    // from the innermost surface outward
        float fk = float(k);
        float a = 0.25 + 0.22 * fk;
        float ea = a * (1.0 + ecc), eb = a * (1.0 - ecc);
        float z = a / rp;
        for (int it = 0; it < 4; ++it) {
            float al = th - 0.6 * (z + fly) - 0.4 * fk;                 // the ellipse turns with the depth
            float re = ea * eb / sqrt(pow(eb * cos(al), 2.0) + pow(ea * sin(al), 2.0));
            z = re / rp;
        }
        float al = th - 0.6 * (z + fly) - 0.4 * fk;
        float u = al / 6.2831853 * nl - iota * (z + fly) * nl * 0.5;
        float px = 1.5 / (resolution.y * rp) * nl / 6.2831853 * 1.2;
        float lines = exp(-pow(abs(fract(u + 0.5) - 0.5) / max(px, 0.04), 2.0));
        float fade = exp(-0.12 * z) * smoothstep(0.0, 0.3, z);
        col += famLight(fh, 0.3 + 0.15 * fk, 0.5) * (0.06 + 0.7 * lines) * fade * glow * (1.0 - 0.15 * fk);
    }
    col += famLight(fh, 0.5, 0.8) * exp(-rp / 0.04) * 0.25;           // the axis ahead
    finish(col);
}
