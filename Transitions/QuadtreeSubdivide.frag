#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file QuadtreeSubdivide.frag
 * @brief TRANSITION QUADTREE SUBDIVIDE: Hierarchical recursive quadtree partitioning
 * dividing the viewport into multi-scale tiles. Smaller sub-quads flip and
 * resolve with cybernetic neon boundary grids to reveal the incoming scene.
 *   interpolation -> drives recursive quadtree depth & tile flip progress
 *   audioKick     -> flashes quadtree partition grid lines
 *
 * Per-activation variety:
 *   depthP float maximum quadtree recursion depth (0.5..2.2)
 *   gridP  float partition grid line intensity   (0.5..2.0)
 *   speedP float animation speed multiplier      (0.5..2.0)
 *   hueP   float partition line hue offset       (0..6.28)
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioSwell;     ///< slow loudness swell: the only envelope allowed to shape geometry
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float depthP; ///< Depth knob, 0..1.
uniform float gridP;  ///< Grid knob, 0..1.
uniform float speedP; ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot( vec3 c, float a )
{
    vec3  k = vec3( 0.57735026919 );
    float cs = cos( a ), sn = sin( a );
    return c * cs + cross( k, c ) * sn + k * dot( k, c ) * ( 1.0 - cs );
}

/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21( vec2 p )
{
    p = fract( p * vec2( 534.34, 835.21 ) );
    p += dot( p, p + 62.32 );
    return fract( p.x * p.y );
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float dpt = ( depthP > 0.0 ) ? depthP : 1.0;
    float grd = ( gridP > 0.0 ) ? gridP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;

    float t = time * 0.4 * spd; // clock only: audioAdvance integrates transients and sped the motion up on every surge
    float t_prog = clamp( interpolation, 0.0, 1.0 );
    float mid_transition = sin( t_prog * 3.14159265 );

    // Quadtree hierarchy: level 1 (2x2), level 2 (4x4), level 3 (8x8), level 4 (16x16)
    float grid_border = 0.0;
    float tile_seed = 0.0;
    vec2  cur_uv = uv;

    float scale = 2.0;
    for ( int lvl = 0; lvl < 4; ++lvl )
    {
        vec2 cell = floor( cur_uv * scale );
        vec2 f = fract( cur_uv * scale );

        tile_seed += hash21( cell + float( lvl ) * 13.7 ) * ( 1.0 / float( lvl + 1 ) );

        // Border detection -- sharp falloff: four overlaid levels of the
        // old exp(-b*30) glow covered most of the frame.
        float b = min( min( f.x, 1.0 - f.x ), min( f.y, 1.0 - f.y ) );
        grid_border = max( grid_border, exp( -b * 80.0 ) );

        scale *= 2.0;
    }

    // Staggered tile flip.  audioBass undulates the subdivision threshold, i.e.
    // how far apart the tiles' flip times are spread.  The (t_prog - d*s)/(1-s)
    // form is written so the divisor tracks the threshold: it still self-clamps
    // to exactly 0 at t_prog = 0 and exactly 1 at t_prog = 1 for any s < 1, and
    // mid_transition additionally returns s to its base 0.35 at both endpoints.
    float subdiv_threshold = 0.35; // constant: an envelope on a scale re-lays the whole pattern (speed pass 14.09.2026)
    float tile_delay = fract( tile_seed * 3.1415 );
    float tile_prog = clamp( ( t_prog - tile_delay * subdiv_threshold ) / ( 1.0 - subdiv_threshold ), 0.0, 1.0 );
    tile_prog = smoothstep( 0.0, 1.0, tile_prog );

    // Tile flip 3D illusion
    float flip_angle = ( 1.0 - tile_prog ) * 3.14159265 * mid_transition;
    vec2  tile_uv = uv + vec2( sin( flip_angle ), 0.0 ) * 0.02;

    vec4 c1 = texture( tex1, fract( tile_uv ) );
    vec4 c0 = texture( tex0, fract( tile_uv ) );

    vec4 col = mix( c1, c0, tile_prog );

    // Neon grid border glow -- calibrated so the tiles' content stays
    // visible between the lines (old gain 1.2+kick*3 washed it cyan).
    float border_glow = grid_border * mid_transition * grd;
    col.rgb += border_glow * vec3( 0.1, 0.9, 1.0 ) * ( 0.3 + audioKick * 0.35 );

    if ( audioChromaHue != 0.0 )
        col.rgb = hueRot( col.rgb, audioChromaHue * mid_transition );
    if ( hue > 0.001 )
        col.rgb = hueRot( col.rgb, hue * mid_transition );

    fragColor = col;
}
