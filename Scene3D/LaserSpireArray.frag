#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).

/**
 * @file LaserSpireArray.frag
 * @brief Shades the crystalline laser-spire array extruded by
 * LaserSpireArray.geom: lit hexagonal pillar facets, or (where gBeam
 * marks a beam quad) a pure emissive skyward laser column.
 *
 * All colour, including the audioSpectrum-driven per-spire height/hue
 * and the audioKick pulse baked into gCol by the geometry stage, arrives
 * pre-computed; this fragment stage only adds a fixed-direction diffuse
 * and specular term to the pillar facets and adds a height-based energy
 * glow (brighter with world-space Y) on top, while beam quads are
 * written out unlit.
 *
 * Audio Reactivity:
 *   audioUpperMid -> the METAL in the material: a scraping, industrial
 *                    2-6 kHz band pulls the facet highlight into a tight
 *                    chrome glint, a warm dull mix leaves a broad matte
 *                    sheen (energy-balanced -- the wide highlight is dimmed
 *                    by as much as it spreads)
 *   (audioSpectrum / audioKick / audioAdvance / audioBuildUp / audioTrebRel
 *    all act upstream in LaserSpireArray.geom -- see that file.)
 */

in vec3  gNormal; ///< Normal (from the geometry stage).
in vec3  gWorld;  ///< World (from the geometry stage).
in vec4  gCol;    ///< The colour gathered so far for this pixel.
in float gBeam;   ///< Beam (from the geometry stage).

uniform float audioUpperMid; ///< 2-6 kHz metallic / industrial edge

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    if ( gBeam > 0.5 )
    {
        // Laser beam emission
        fragColor = gCol;
        return;
    }

    vec3  n = normalize( gNormal );
    vec3  light_dir = normalize( vec3( 0.5, 0.8, -0.6 ) );
    float diff = max( dot( n, light_dir ), 0.0 ) * 0.7 + 0.3;

    // Specular highlight — the industrial 2-6 kHz band decides how metallic
    // the crystal reads: dull/warm gives a broad matte sheen, scraping-bright
    // gives a hard chrome glint.  Gain drops as the highlight widens, so the
    // total specular energy stays put.
    float mtl = clamp( audioUpperMid, 0.0, 1.0 );
    vec3  view_dir = normalize( -gWorld );
    vec3  refl = reflect( -light_dir, n );
    float spec = pow( max( dot( view_dir, refl ), 0.0 ), mix( 8.0, 48.0, mtl ) )
                 * mix( 0.5, 1.0, mtl );

    vec3 col = gCol.rgb * diff + spec * vec3( 1.0, 1.0, 1.0 );

    // Height energy glow
    col += gCol.rgb * smoothstep( -4.0, 15.0, gWorld.y ) * 0.8;

    col /= 1.0 + 0.60 * max( col.r, max( col.g, col.b ) ); // over-bright tail (final review)
    fragColor = vec4( col, 1.0 );
}
