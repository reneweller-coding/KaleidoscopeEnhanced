#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file CelticMandelbrotGothicVault.frag
 * @brief CELTIC MANDELBROT GOTHIC VAULT: Celtic Mandelbrot variation z -> |Re(z^2)| + i*Im(z^2) + c.
 * Gothic cathedral tracery arches, lancet church window filigree, stained-glass luminescence,
 * and continuous deep plunge through endless vaulted fractal naves.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous deep plunge through Gothic cathedral arches
 *   audioKick    -> flashes stained-glass rosette window cores & cathedral flares
 *   audioCentroid-> sharpens lancet arch tracery & rib-vault boundaries
 *   audioSubBass -> expands cathedral nave arch width breathing
 *   audioChromaHue-> rotates the glowing stained-glass cathedral spectrum
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
uniform float zoomP;  ///< Zoom knob, 0..1.
uniform float traceryP;
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

/// Overall level of the photo currently bound, from a fixed 5-tap grid. The
/// stained-glass base is entirely photo-derived and the library spans
/// near-black to near-white, which is half of why this vault sat near black.
/// The probe rides the tex0/tex1 crossfade so the gain can never pop, and one
/// number for the whole frame rescales exposure without touching contrast.
float photoLevel()
{
    vec3 s = img( vec2( 0.25, 0.25 ) ) + img( vec2( 0.75, 0.25 ) )
             + img( vec2( 0.25, 0.75 ) ) + img( vec2( 0.75, 0.75 ) )
             + img( vec2( 0.50, 0.50 ) );
    return dot( s * 0.2, vec3( 0.299, 0.587, 0.114 ) );
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float zm = ( zoomP > 0.01 ) ? zoomP : 1.0;
    float trc = ( traceryP > 0.01 ) ? traceryP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.150 * spd + audioAdvance * 0.150 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Zoom target on a Gothic lancet arch cusp. The old centre (-0.1, 0.65)
    // sits well OUTSIDE this variation's set -- it escapes in six iterations
    // -- so once the zoom passed a few times magnification every pixel in the
    // frame shared the same escape count and the vault flattened into one
    // featureless exterior field. (-0.02, 0.34) straddles the boundary (0.30
    // is interior, and the centre itself escapes only at iteration 18 of 48),
    // so the arches stay in shot. The zoom cycle is bounded to ~7x for the
    // same reason: the old exp(mod(t, 5.5)) reached 244x on top of the base
    // scale, far narrower than the filigree it is supposed to fly through.
    // Measured busy region (NumPy scan of the Celtic set: iteration-variance
    // maximum with ~20% interior at window half-widths 0.15 AND 0.05) -- the
    // old centre sat on a featureless smooth cusp and rendered as two-tone
    // stripes at every zoom depth.
    vec2 c_center = vec2( -1.34, 0.23 );
    // exp(mod(t * 0.65, 2.0)) snapped from e^2 (7x) back to e^0 every ~3.1 s
    // -- a hard cut. A raised cosine over the same period dives in and eases
    // back out instead: continuous in value AND velocity (the derivative
    // vanishes at both turns), so no seam anywhere.
    float zc = 0.5 - 0.5 * cos( 6.2831853 * fract( t * 0.65 / 2.0 ) ); // 0..1..0
    float zoom_level = exp( zc * 2.3 ) * ( 1.6 * zm );
    // Sub-bass narrows the sampled c-window across the nave axis only, so the
    // arches widen sideways instead of the whole vault simply zooming.
    // Langsame Fensterrotation (Nutzerwunsch: "mindestens noch eine
    // Rotation") -- das Fraktal selbst ist nicht rotationssymmetrisch,
    // also dreht die KAMERA.
    float v_rot = time * 0.06 + audioAdvance * 0.05;
    vec2  ruv = mat2( cos( v_rot ), -sin( v_rot ), sin( v_rot ), cos( v_rot ) ) * uv;
    vec2  c = c_center + vec2( ruv.x / ( 1.0 + 0.3 * audioSubBass ), ruv.y ) / zoom_level;

    vec2  z = c;
    float iter_count = 0.0;
    float trap = 1e5;
    float der = 1.0; // |dz/dc| magnitude for distance estimation

    // Celtic Mandelbrot loop: z = |Re(z^2)| + i*Im(z^2) + c
    for ( int i = 0; i < 48; ++i )
    {
        der = der * 2.0 * max( length( z ), 1e-6 ) + 1.0;
        // z^2 = (x^2 - y^2) + 2ixy
        float real_part = abs( z.x * z.x - z.y * z.y );
        float imag_part = 2.0 * z.x * z.y;
        z = vec2( real_part, imag_part ) + c;

        float r2 = dot( z, z );
        trap = min( trap, abs( z.x ) + abs( z.y ) );

        if ( r2 > 16.0 )
        {
            iter_count = float( i ) - log2( max( 1.0, log2( r2 ) ) );
            break;
        }
    }

    if ( iter_count == 0.0 )
        iter_count = 48.0;

    // Distance estimate -> crisp boundary filigree at every zoom depth. The
    // bare iteration count only made smooth STRIPES; the vault's ribs are the
    // set boundary itself.
    float lz = max( length( z ), 1.0001 );
    float de = lz * log( lz ) / max( der, 1e-9 );
    float ribs = 1.0 / ( 1.0 + de * zoom_level * 600.0 );

    // Sample distorted background photo
    vec2 sample_uv = fract( z * 0.25 + 0.5 );
    vec3 tex_col = img( sample_uv );

    // Glowing Gothic lancet arch tracery lines. trap is an orbit trap on
    // |Re| + |Im|, which for a bounded orbit essentially never drops below
    // ~0.2 -- against a falloff of 22 that evaluated to exp(-4.4) or less for
    // every pixel on screen, so the tracery this scene is named after was
    // simply not being drawn. Match the falloff to the quantity's real range.
    float arch_glow = exp( -trap * ( 4.5 + 2.5 * audioCentroid ) * trc ) * glw;

    // Stained-glass PANES: one hashed palette tone per integer iteration
    // band, so the exterior reads as discrete leaded-glass segments instead
    // of a smooth striped gradient.
    float band = floor( iter_count );
    float pane_hue = fract( band * 0.6180339887 );
    vec3  pal_a = imgPalette( pane_hue * 0.8 );
    vec3  pal_b = imgPalette( pane_hue * 0.8 + 0.45 );
    vec3  vault_col = mix( pal_a, pal_b, 0.5 + 0.5 * sin( band * 1.7 + t * 0.5 ) );

    vault_col = mix( vault_col, tex_col, 0.35 + 0.15 * audioValence );
    // Open exterior (low escape count) falls into shadow -- the vault's
    // light lives at the tracery, not in the empty nave.
    vault_col *= 0.30 + 0.70 * smoothstep( 0.0, 14.0, band );

    // Put the stained glass on a fixed exposure rather than inheriting
    // whatever photo is bound -- a dark image is what sank the whole nave.
    float exp_gain = clamp( 0.20 / max( 0.05, photoLevel() ), 0.22, 2.8 );
    vault_col *= exp_gain;

    // Add glowing Gothic tracery ribbing and rosette window flashes. Both
    // tints exceed 1.0 per channel on their own, so the TINTED vectors are
    // what gets capped.
    vec3 tracery_tint = min( vec3( 1.4, 1.2, 1.8 ) * arch_glow * ( 1.0 + 2.5 * audioKick ), vec3( 1.2 ) );
    vault_col += tracery_tint;
    // The DE ribs: bright leading between the glass panes.
    vault_col += vec3( 1.2, 1.1, 0.85 ) * ribs * ( 0.55 + 0.45 * audioLevel ) * glw;

    // Rosette window central bloom, tightened so it stays a rosette rather
    // than a haze over the whole vault now that trap actually reads.
    float rosette_bloom = exp( -trap * 12.0 ) * ( 0.8 + 1.8 * audioKick );
    vault_col += min( imgPalette( 0.85 ) * exp_gain * 2.5 * rosette_bloom, vec3( 1.1 ) );

    vault_col = pow( vault_col, vec3( 0.88 ) );
    vec3 cat_tone = clamp( vault_col, 0.0, 1.0 );
    cat_tone /= 1.0 + 0.30 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    cat_tone = clamp( ( cat_tone - 0.28 ) * 1.65 + 0.13, 0.0, 1.0 ); // washed-out fix: contrast S-curve, darker fog
                                                                     // floor
    fragColor = vec4( cat_tone, 1.0 );
}
