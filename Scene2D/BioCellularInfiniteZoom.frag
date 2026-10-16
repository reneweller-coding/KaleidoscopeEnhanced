#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file BioCellularInfiniteZoom.frag
 * @brief BIO CELLULAR INFINITE ZOOM: Continuous multi-scale infinite zoom dive
 * transitioning from cosmic spiral galaxies down to biological cellular organelles,
 * crystal lattices, and subatomic quantum foam in an endless self-similar loop.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous scale plunge across cosmic/biological scales
 *   audioKick    -> flashes cellular nucleus mitosis & quantum foam shockwave
 *   audioCentroid-> modulates organelle membrane ripple frequency
 *   audioSubBass -> drives deep cellular respiration breathing
 *   audioChromaHue-> steers the bio-luminescent scale transition palette
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

// Per-activation variety
uniform float speedP; ///< Speed knob, 0..1.
uniform float scaleP; ///< Scale knob.
uniform float membraneP;
uniform float glowP; ///< Glow / afterglow knob, 0..1.
uniform float hueP;  ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/// Overall level of the photo currently on the texture units, from a fixed
/// 5-tap grid. Every base colour here is photo-derived, so a bright photo left
/// the additive membrane/nucleus glows no headroom at all. The probe rides the
/// tex0/tex1 crossfade, so the gain it feeds can never pop, and being one
/// number for the whole frame it rescales exposure without touching local
/// contrast.
float photoLevel()
{
    vec3 s = img( vec2( 0.25, 0.25 ) ) + img( vec2( 0.75, 0.25 ) )
             + img( vec2( 0.25, 0.75 ) ) + img( vec2( 0.75, 0.75 ) )
             + img( vec2( 0.50, 0.50 ) );
    return dot( s * 0.2, vec3( 0.299, 0.587, 0.114 ) );
}

/// Procedural cellular Voronoi / membrane noise
vec3 cellularNoise( vec2 p, float t )
{
    vec2  ip = floor( p );
    vec2  fp = fract( p );
    float min_dist = 1e4;
    vec2  min_pt = vec2( 0.0 );

    for ( int y = -1; y <= 1; y++ )
    {
        for ( int x = -1; x <= 1; x++ )
        {
            vec2  neighbor = vec2( float( x ), float( y ) );
            vec2  rand_pt = sin( ip + neighbor + vec2( t * 0.3, t * 0.4 ) ) * 0.4 + 0.5;
            vec2  diff = neighbor + rand_pt - fp;
            float d = dot( diff, diff );
            if ( d < min_dist )
            {
                min_dist = d;
                min_pt = neighbor + rand_pt;
            }
        }
    }
    return vec3( sqrt( min_dist ), min_pt );
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float memb = ( membraneP > 0.01 ) ? membraneP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.192 * spd + audioAdvance * 0.192 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Logarithmic scale factor across 3 repeating major visual scales:
    // Scale 0: Cosmic Galaxy / Nebula
    // Scale 1: Biological Cell / Organelle
    // Scale 2: Quantum Foam / Crystal Lattice
    float log_scale = mod( t * 0.5, 3.0 );
    float scale_frac = fract( log_scale );
    int   current_scale = int( floor( log_scale ) );

    vec3  col_acc = vec3( 0.0 );
    float weight_acc = 0.0;

    // Hold the cytoplasm back to a fixed dark base. Every scale's colour is
    // mix(photo, imgPalette) -- with a bright photo that base alone already sat
    // near 1.0 and the glowing membranes had nowhere left to go, which flattened
    // the whole dive to a milky wash.
    float exp_gain = clamp( 0.26 / max( 0.05, photoLevel() ), 0.26, 2.4 );

    for ( int s = 0; s < 3; s++ )
    {
        float sf = float( s );
        float rel_scale = mod( sf - log_scale + 3.0, 3.0 );
        float zoom_factor = exp( rel_scale * 2.2 );

        // Blending weight between scales
        float w = smoothstep( 0.0, 0.5, rel_scale ) * smoothstep( 3.0, 2.0, rel_scale );
        if ( w <= 0.001 )
            continue;

        vec2 p_scale = uv * zoom_factor;

        // Swirling rotation per scale
        float rot_a = t * 0.2 * ( s % 2 == 0 ? 1.0 : -1.0 ) + length( p_scale ) * 0.1;
        float cs = cos( rot_a ), sn = sin( rot_a );
        p_scale = mat2( cs, -sn, sn, cs ) * p_scale;

        // Cellular membranes & organelle structure
        // Brightness drives the organelle lattice frequency (finer ripple),
        // sub-bass pushes the glowing membrane shell outward so the cells
        // visibly inflate and relax -- both are pure shape terms, so neither
        // can remap the accumulated swirl phase.
        vec3  cell_info = cellularNoise( p_scale * ( 1.5 + 0.6 * audioCentroid ), t + sf );
        float d_memb = cell_info.x;
        float memb_glow = exp( -abs( d_memb - 0.45 * ( 1.0 + 0.3 * audioSubBass ) ) * 12.0 * memb ) * glw;

        // Sample texture on cellular coordinate
        vec2 sample_uv = fract( p_scale * 0.2 + cell_info.yz * 0.1 + 0.5 );
        vec3 tex_col = img( sample_uv );
        vec3 pal_col = imgPalette( sf * 0.33 + d_memb * 0.3 );

        vec3 scale_col = mix( tex_col, pal_col, 0.5 ) * exp_gain;

        // Add glowing membrane walls & nucleus. The tint constants exceed 1.0
        // per channel, so the TINTED vectors carry the caps -- bounding only
        // the scalar glow left vec3(1.2,1.4,1.8) * it running past white. The
        // nucleus rides the same exposure gain as the base, since imgPalette()
        // is a photo sample too.
        float nucleus_glow = exp( -length( p_scale ) * 3.5 ) * ( 1.0 + 2.0 * audioKick );
        scale_col += min( vec3( 1.2, 1.4, 1.8 ) * memb_glow * ( 0.8 + 1.5 * audioKick ), vec3( 0.85 ) );
        scale_col += min( imgPalette( 0.85 ) * exp_gain * nucleus_glow, vec3( 0.70 ) );

        col_acc += scale_col * w;
        weight_acc += w;
    }

    vec3 final_col = col_acc / max( 0.001, weight_acc );

    // Respiration pulse
    final_col *= ( 0.85 + 0.15 * sin( audioSwell * 3.0 ) );

    final_col = pow( final_col, vec3( 0.88 ) );
    vec3 cat_tone = clamp( final_col, 0.0, 1.0 );
    cat_tone /= 1.0 + 0.28 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
