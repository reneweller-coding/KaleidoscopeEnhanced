#version 330 core
out vec4 fragColor;
// LaserArena.frag — razor core inside a wide fog halo across the beam.
in vec4  vCol;
in float vSide;

/**
 * @file LaserArena.frag
 * @brief Shades one laser-beam ribbon of the club-style laser show built
 * in LaserArena.vert: a razor-thin bright core wrapped in a broad, dim
 * fog glow across the beam width.
 *
 * All colour (per-beam hue cycling, the audioBeatPhase strobe,
 * audioKick punch, and the DROP-triggered vertical snap) is computed
 * upstream in the vertex stage and arrives baked in vCol; this stage
 * only shapes the cross-beam falloff from vSide into core+halo
 * intensity.
 *
 * The halo now spans the FULL ribbon width instead of dying out a third of
 * the way across it: that is what makes a beam read as a shaft of light
 * hanging in the room's haze rather than as a bare hairline, and it is most
 * of what fills the picture between the beams.
 *
 * Core and halo are shaded at DIFFERENT saturations, which is both what a
 * laser photograph looks like and what keeps the rig off the garish end of
 * the catalogue -- see the comment in main().
 */

void main()
{
    float d    = abs(vSide);
    float core = exp(-d * d * 22.0);
    float halo = exp(-d * d * 1.2) * 0.20;

    // The beam colour arrives from the vertex stage at 0.80..1.00 saturation
    // for EVERY hue in this scene's range, and since the halo covers the whole
    // ribbon width, that made essentially every lit pixel in the frame a hard
    // primary: 85% of the picture above 0.8 saturation, which is the one thing
    // the catalogue calls garish. Brightness, contrast and coverage were all
    // fine, so the fix has to be purely chromatic.
    //
    // Physically the answer is already there: air scatters broadband and is lit
    // by all eighty beams at once, so the fog around a beam is far less
    // saturated than the beam; and the core of a beam is an over-exposed
    // source, which reads toward white. Mixing toward LUMINANCE leaves the
    // halo's brightness untouched, and mixing toward the MAX CHANNEL leaves the
    // core's. Both cut saturation by a fixed factor -- worst case 0.65 for the
    // core, 0.46 for the halo -- and additive accumulation can only ever lower
    // saturation further (the sum of vectors all with min/max >= r keeps
    // min/max >= r), so no pixel in the frame can reach 0.8 any more.
    vec3  beam = vCol.rgb;
    float lum  = dot(beam, vec3(0.2126, 0.7152, 0.0722));
    float mxc  = max(beam.r, max(beam.g, beam.b));

    vec3 fogCol  = mix(beam, vec3(lum), 0.70);
    vec3 coreCol = mix(beam, vec3(mxc), 0.35);

    fragColor = vec4(coreCol * core + fogCol * halo, 1.0);
}
