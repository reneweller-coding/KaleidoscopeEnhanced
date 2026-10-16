#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file KaleidoscopicLichtenbergZoom.frag
 * @brief KALEIDOSCOPIC LICHTENBERG ZOOM: Infinite recursive zoom into high-voltage
 * dielectric Lichtenberg electrical discharge trees folded across hexagonal mirror
 * symmetries with searing lightning sparks, charge streamers, and kick flashes.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous deep lightning tree zoom trajectory
 *   audioKick    -> strikes violent high-voltage discharge arcs & flashes
 *   audioCentroid-> modulates streamer branching frequency & electrical spark density
 *   audioSubBass -> expands plasma tree voltage glow
 *   audioChromaHue-> rotates the electrical discharge spectrum
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
uniform float speedP;   ///< Speed knob, 0..1.
uniform float voltageP; ///< Voltage knob, 0.8..1.5.
uniform float branchP;  ///< Branching knob, 0..1.
uniform float glowP;    ///< Glow / afterglow knob, 0..1.
uniform float hueP;     ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/**  The photo at a coordinate: the cross-fade of tex0 and tex1.
 *
 * @param uv  Coordinate in the photo, 0..1. (in)
 *
 * @return
 *   The cross-faded photo colour (RGB).
 **/
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}

/**  The house palette: a colour of the photo on an arc that turns with the music's hue.
 *
 * @param t  Position on the palette arc, 0..1 for one turn. (in)
 *
 * @return
 *   The palette colour (RGB).
 **/
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/**  Overall level of the photo currently on the texture units, from a fixed 5-tap grid.
 *
 * @return
 *   The photo's average level, 0..1.
 *
 * Every base colour here is photo-derived and the library spans near-black to near-white, so a bright photo left the
 * additive discharge arcs no headroom at all. The probe rides the tex0/tex1 crossfade, so the gain it feeds can never
 * pop, and because it is one number for the whole frame it rescales exposure without touching local contrast.
 **/
float photoLevel()
{
    vec3 s = img( vec2( 0.25, 0.25 ) ) + img( vec2( 0.75, 0.25 ) )
             + img( vec2( 0.25, 0.75 ) ) + img( vec2( 0.75, 0.75 ) )
             + img( vec2( 0.50, 0.50 ) );
    return dot( s * 0.2, vec3( 0.299, 0.587, 0.114 ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float volt = ( voltageP > 0.01 ) ? voltageP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.210 * spd + audioAdvance * 0.210 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Logarithmic zoom into the discharge core, ping-ponged. The old
    // exp(mod(t * 0.7, 5.0)) snapped from e^5 (148x) back to e^0 every
    // ~7.1 s -- a hard cut. A raised cosine over the same period dives in and
    // eases back out instead: continuous in value AND velocity (the
    // derivative vanishes at both turns), so no seam anywhere.
    float zc = 0.5 - 0.5 * cos( 6.2831853 * fract( t * 0.7 / 5.0 ) ); // 0..1..0
    float zoom_level = exp( zc * 5.0 );
    vec2  p = uv / zoom_level;

    // 6-Fold hexagonal kaleidoscope symmetry
    float a = atan( p.y, p.x );
    float r = length( p );
    float seg = 3.14159265 / 3.0;
    a = mod( a + seg * 0.5, seg ) - seg * 0.5;
    a = abs( a );
    vec2 z = vec2( cos( a ), sin( a ) ) * r;

    // Lichtenberg recursive electrical tree calculation
    float min_arc_dist = 1e5;
    float plasma_energy = 0.0;

    for ( int i = 0; i < 8; ++i )
    {
        float fi = float( i );
        // Jagged electrical noise offset
        float zig = sin( z.y * ( 10.0 + fi * 4.0 ) + t * 3.0 + fi ) * 0.08 * volt;
        float d_line = abs( z.x - zig );

        // Normalise by the SAME per-iteration scale the fold below actually
        // applies (1.45) -- the previous 1.35 divisor didn't match, so the
        // reported distance drifted further from correct at every iteration.
        min_arc_dist = min( min_arc_dist, d_line / pow( 1.45, fi ) );

        // Scale and branch fold
        z = abs( z ) - vec2( 0.25 + 0.05 * sin( t * 2.0 + fi ), 0.35 );
        float rot_arc = 0.6 + 0.2 * sin( t + fi );
        z = mat2( cos( rot_arc ), -sin( rot_arc ), sin( rot_arc ), cos( rot_arc ) ) * z;
        z *= 1.45;

        plasma_energy += exp( -d_line * 15.0 );
    }

    // Dynamic texture sample mapped across plasma tree
    vec2 sample_uv = fract( z * 0.25 + 0.5 );
    vec3 tex_col = img( sample_uv );

    // Glowing lightning arc lines. min_arc_dist's per-iteration numerator stays
    // a bounded, O(0.01-0.1) quantity while its pow(1.45,fi) divisor keeps
    // growing, so by i=7 it's crushed near zero for almost every pixel (not
    // just ones truly near an arc) -- matching the normalisation constant to
    // the fold's real scale factor (see min_arc_dist above) wasn't enough on
    // its own, the decay here also has to be sharp enough to turn that
    // near-zero-everywhere value back into real near/far contrast. It is
    // slightly shallower than before because the arcs were never actually
    // missing -- they were being drawn on top of a photo base already sitting
    // near 1.0, so the entire dynamic range of this term was clipped away.
    // Sub-bass divides the falloff instead of adding light: a shallower
    // exponent widens the band each arc occupies, so the discharge tree's
    // corona swells on drones without lifting its peak.
    float arc_glow = exp( -min_arc_dist * ( 130.0 + 60.0 * audioCentroid ) / ( 1.0 + 0.4 * audioSubBass ) ) * glw;
    float core_spark = exp( -min_arc_dist * 500.0 );

    // Palette mixing
    vec3 pal_a = imgPalette( plasma_energy * 0.15 + t * 0.1 );
    vec3 pal_b = imgPalette( plasma_energy * 0.15 + 0.5 );
    vec3 col = mix( pal_a, pal_b, 0.5 + 0.5 * sin( plasma_energy + t ) );

    col = mix( col, tex_col, 0.35 + 0.15 * audioValence );

    // Hold the dielectric field back to a fixed dark base. A Lichtenberg
    // figure only reads if the medium around it is dark: with a bright photo
    // the base alone sat near 1.0 and the arcs had nowhere left to go, which
    // is what flattened the whole frame to a near-white wash.
    float exp_gain = clamp( 0.22 / max( 0.05, photoLevel() ), 0.22, 2.4 );
    col *= exp_gain;

    // Add high-voltage electric blue/violet arcs & white spark cores. The tint
    // constants exceed 1.0 per channel on their own, so the TINTED vectors are
    // capped -- capping only the scalar glow left them unbounded.
    vec3 arc_color = min( vec3( 1.1, 1.4, 1.9 ) * arc_glow * ( 1.0 + 2.5 * audioKick ), vec3( 1.25 ) );
    vec3 spark_color = min( vec3( 1.8, 1.8, 2.0 ) * core_spark * ( 1.5 + 3.5 * audioKick ), vec3( 1.5 ) );
    col += arc_color + spark_color;

    // Ambient discharge haze (on the same exposure gain as the base, since it
    // is a photo sample too -- plasma_energy can reach 8 and a bright photo
    // would otherwise re-introduce an unbounded lift here)
    col += imgPalette( 0.8 ) * exp_gain * plasma_energy * 0.08 * audioLevel;

    col = pow( col, vec3( 0.86 ) );
    vec3 cat_tone = clamp( col, 0.0, 1.0 );
    cat_tone /= 1.0 + 0.30 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    // Polarity flip: the fractal renders dark filaments on a pale field,
    // but Lichtenberg figures ARE light on dark.  Invert, then a mild
    // gamma to keep the filigree crisp.
    cat_tone = pow( clamp( 1.0 - cat_tone, 0.0, 1.0 ), vec3( 1.35 ) ) * 1.15;
    cat_tone = clamp( cat_tone, 0.0, 1.0 );
    fragColor = vec4( cat_tone * 0.86, 1.0 ); // measured luma 0.743: over the 0.72 white line
}
