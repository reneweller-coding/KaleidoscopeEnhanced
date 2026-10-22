//@doc
 * @brief LASER CONE TUNNEL: a tunnel of laser light in haze, as in a club: sheets of laser fanned out of many beams
 * form a turning polygon round the flight, two cones of light open from the far end, and the whole tunnel narrows as
 * the music swells; it turns with the tempo.  A sheet is a plane beside the flight: a ray meets it at the depth where
 * its distance is reached, and the haze there glows by how steeply the ray crosses it; the beams within a sheet are
 * stripes across it, scanning.  A cone from the far apex is met at one depth for every distance from the middle.  The
 * polygon turns by the beats counted in a small field of the scene's own (a turn every sixteen beats), which also
 * smooths the swell for the narrowing.  Two shades of one colour family from the photo, alternating.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase -> the tunnel turns with the tempo (beats counted)
 *   audioSwell     -> the tunnel narrows (smoothed)
 *   audioAdvance   -> the flight (integrated)
 *   audioOnset     -> the haze flashes softly (light)
 *
 * Knobs: sheetP (how many sheets), beamP (how many beams a sheet has), hueP.
//@params sheetP beamP
//@audio audioBeatPhase audioSwell audioOnset
//@state 1 1 60 32
//@body
/**  The state pass: the beats counted by summing the beat phase's steps, and the swell smoothed.
 *
 * @return
 *   x the beats so far, y the last beat phase, z the smoothed swell, 1.
 **/
vec4 stateStep()
{
    float bp = clamp(audioBeatPhase, 0.0, 1.0), sw = clamp(audioSwell, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(0.0, bp, sw, 1.0);
    vec4 old = texelFetch(texState, ivec2(0, 0), 0);
    float d = fract(bp - old.y + 1.0);
    if (d > 0.5) d = 0.0;
    return vec4(mod(old.x + d, 4096.0), bp, mix(old.z, sw, 0.02), 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float fly = 0.3 * sceneTime + 1.1 * audioAdvance;
    vec4 st = texelFetch(texState, ivec2(0, 0), 0);
    float dl = fract(clamp(audioBeatPhase, 0.0, 1.0) - st.y + 1.0);
    float beats = st.x + (dl < 0.5 ? dl : 0.0);                       // the count carried on to this frame
    float NS = floor(5.0 + 3.0 * clamp(sheetP, 0.0, 1.0));
    float nb = 6.0 + 10.0 * clamp(beamP, 0.0, 1.0);
    float dist = 0.5 * (1.0 - 0.35 * st.z);                           // the polygon's inradius
    float rot = 6.2831853 * beats / 16.0;
    vec3 lA = famLight(fh, 0.25, 0.6), lB = famLight(fh, 0.75, 0.6);
    float rlen = sqrt(dot(p, p) + 1.0);
    vec3 col = vec3(0.0);
    // the nearest sheet is the tunnel's wall and shows its polygon; the sheets behind it glow fainter
    float zmin = 1e9;
    for (int i = 0; i < 8; ++i) {
        float an = rot + float(i) * 6.2831853 / NS;
        float np = dot(vec2(cos(an), sin(an)), p);
        if (float(i) < NS && np > 0.0) zmin = min(zmin, dist / np);
    }
    for (int i = 0; i < 8; ++i) {
        float fi = float(i);
        if (fi >= NS) break;
        float an = rot + fi * 6.2831853 / NS;
        vec2 n = vec2(cos(an), sin(an));
        float np = dot(n, p);
        if (np <= 0.0) continue;
        float z = dist / np;                                          // where the ray meets this sheet
        if (z > 40.0) continue;
        float side = dot(vec2(-n.y, n.x), p) * z;                     // across the sheet
        float beams = pow(0.5 + 0.5 * cos(6.2831853 * (side * nb * 0.5 + 0.3 * beats)), 16.0);
        // the scan lines: rings along the flight, drawn as polygons where the sheets are the wall
        float u = (z + fly) / 1.2;
        float du = z * z / (dist * 1.2) / resolution.y;
        float scan = exp(-pow((0.5 - abs(fract(u) - 0.5)) / (1.5 * du + 0.01), 2.0));
        float front = 0.3 + 0.7 * exp(-(z - zmin) * 1.5);
        float steep = min(rlen / (np * 25.0), 1.0);                   // grazing rays gather more haze
        float fade = exp(-0.07 * z);
        col += (mod(fi, 2.0) < 0.5 ? lA : lB) * (beams * 0.18 + 0.06 + 1.1 * scan) * (0.3 + steep) * fade * front;
    }
    // two cones opening from the far apex
    float r = length(p);
    for (int c = 0; c < 2; ++c) {
        float tb = c == 0 ? 0.08 : 0.16;                              // the cones' half-angle tangents
        float Z0 = 30.0;
        float z = Z0 * tb / (r + tb);
        float a = atan(p.y, p.x) - rot * (c == 0 ? 0.5 : -0.5);
        float beams = pow(0.5 + 0.5 * cos(a * (c == 0 ? 12.0 : 18.0)), 16.0);
        col += (c == 0 ? lB : lA) * beams * exp(-0.07 * z) * 0.5 * smoothstep(0.0, 0.05, r);
    }
    col += mix(lA, lB, 0.5) * (0.04 + 0.08 * clamp(audioOnset, 0.0, 1.0)) * exp(-r * 1.5);   // the haze
    col += mix(lA, lB, 0.5) * exp(-r * 12.0) * 0.6;                   // the far apex
    finish(col);
}
