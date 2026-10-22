//@doc
 * @brief TORUS KNOT INTERIOR: a ride inside a winding tube whose wall is a lattice of glowing lines -- rings round
 * it and seams along it -- the tube bending steadily into new directions like the inside of a knotted hose.  The
 * tube's centre line is a sum of slow sines (an epicycle path), the view looks along it and turns with it; where the
 * wall bends away, its lines stretch, where it bends close, they crowd.  One colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the path's amplitudes ahead glide with every chord change: the coming bends sharpen or
 *                       ease (near the eye the path stays as it is, so the view never turns on the music)
 *   audioAdvance     -> the ride (integrated)
 *   audioSwell       -> the lines' glow widens
 *   audioOnset       -> light runs down the seams
 *
 * Knobs: lineP (how many seams), bendP (how far the tube bends), hueP.
//@params lineP bendP
//@audio audioHarmAdvance audioSwell audioOnset
//@body
vec2 gAmp = vec2(1.0);     // the path's two amplitude scales ahead (set per frame)
float gRide = 0.0;         // where the eye is

/**  The tube's centre line across, at depth z.
 *
 * @param z  The depth. (in)
 *
 * @return
 *   The centre's x and y.
 **/
vec2 pathXY(float z)
{
    // near the eye the path is fixed; the music only reshapes the bends further ahead
    vec2 amp = mix(vec2(1.0), gAmp, smoothstep(gRide + 3.0, gRide + 15.0, z));
    return amp * vec2(2.6 * sin(0.11 * z) + 0.9 * sin(0.29 * z + 1.0), 2.3 * cos(0.13 * z) + 0.8 * sin(0.23 * z + 2.0));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float bend = 0.6 + 0.6 * clamp(bendP, 0.0, 1.0);
    gAmp = vec2(1.0 + 0.35 * sin(0.8 * h), 1.0 + 0.35 * cos(0.55 * h + 1.0));
    float seams = floor(10.0 + 10.0 * clamp(lineP, 0.0, 1.0));
    float width = 0.018 + 0.016 * clamp(audioSwell, 0.0, 1.0);
    float ride = 0.6 * sceneTime + 2.6 * audioAdvance;
    gRide = ride;
    vec3 ro = vec3(bend * pathXY(ride), ride);
    vec3 ahead = vec3(bend * pathXY(ride + 3.0), ride + 3.0);
    vec3 fw = normalize(ahead - ro);
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    float roll = 0.1 * sceneTime;
    vec2 pr = rot2(roll) * p;
    vec3 rd = normalize(fw * 1.0 + rt * pr.x + up * pr.y);
    const float R = 1.0;
    float runL = 0.9 * audioAdvance + 0.05 * sceneTime;
    float onset = clamp(audioOnset, 0.0, 1.0);
    vec3 col = vec3(0.0);
    float t = 0.02;
    for (int i = 0; i < 90; ++i) {
        vec3 x = ro + rd * t;
        vec2 o = x.xy - bend * pathXY(x.z);
        float r = length(o);
        float d = R - r;
        // the wall's lines, seen as a glow that grows near the wall
        float a = atan(o.y, o.x) / 6.2831853 * seams;
        float ring = abs(fract(x.z * 0.8) - 0.5) * 1.25;
        float seam = abs(fract(a) - 0.5) * 6.2831853 * R / seams;
        float line = min(ring, seam);
        float near = exp(-pow(max(d, 0.0) / 0.05, 2.0));
        float g = exp(-pow(line / width, 2.0)) * near;
        float run = pow(0.5 + 0.5 * cos(6.2831853 * (0.12 * x.z - runL + 3.0 * floor(a) / seams)), 10.0);
        float fade = exp(-0.06 * t);
        col += famLight(fh, 0.2 + 0.6 * fract(x.z * 0.031), 0.15 + 0.4 * run * onset) * g * (1.0 + 2.0 * run * onset) * fade * 0.4;
        col += famCol(fh, 0.4) * near * 0.006 * fade;
        if (d < 0.002) break;
        t += clamp(0.5 * d, 0.01, 0.4);
        if (t > 40.0) break;
    }
    finish(col);
}
