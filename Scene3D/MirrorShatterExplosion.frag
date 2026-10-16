#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).

in vec3 gNormal;
in vec3 gWorld;
in vec3 gCol;

/**
 * @file MirrorShatterExplosion.frag
 * @brief Shades one triangular mirror shard from MirrorShatterExplosion.geom: a lit glinting
 * facet (fixed-direction diffuse + tight specular) with a Fresnel rim so shards read as sharp
 * glass/mirror fragments rather than flat matte confetti. All placement, colour and the beat-
 * synced explosion are computed in the geometry stage and arrive pre-baked in gCol.
 */

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec3 n = normalize( gNormal );
    vec3 view_dir = normalize( -gWorld );
    if ( dot( n, view_dir ) < 0.0 )
        n = -n;

    vec3  light_dir = normalize( vec3( 0.5, 0.8, -0.5 ) );
    float diff = max( dot( n, light_dir ), 0.0 ) * 0.6 + 0.4;

    vec3  refl = reflect( -light_dir, n );
    float spec = pow( max( dot( view_dir, refl ), 0.0 ), 40.0 );

    float fres = pow( 1.0 - clamp( dot( n, view_dir ), 0.0, 1.0 ), 3.0 );

    vec3 col = gCol * diff;
    col += gCol * spec * 1.1;
    col += gCol * fres * 0.8;

    vec3 cat_tone = clamp( col, 0.0, 1.0 ) * 0.9;
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    cat_tone *= 3.13; // measured-dark lift (visual pass)
    fragColor = vec4( cat_tone, 1.0 );
}
