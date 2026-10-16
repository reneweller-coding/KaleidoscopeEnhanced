#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file RosslerAttractorHyperRibbon.frag
 * @brief ROSSLER ATTRACTOR HYPER RIBBON: Chaotic Rössler attractor system dx/dt = -y - z,
 * dy/dt = x + ay, dz/dt = b + z(x - c). Smooth logarithmic spiral disk with explosive
 * chaotic vertical Z-popping loop excursions and twisting Möbius ribbon sheets.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous integration of Rössler attractor ribbon
 *   audioKick    -> flashes vertical chaotic Z-escape pulses & burst loops
 *   audioCentroid-> modulates parameter c & attractor trajectory sharpness
 *   audioSubBass -> expands spiral disk diameter breathing
 *   audioChromaHue-> rotates the chaotic Rössler ribbon spectrum
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
uniform float paramCP;
uniform float ribbonP;
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

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float c_mod = ( paramCP > 0.01 ) ? paramCP : 1.0;
    float rbn = ( ribbonP > 0.01 ) ? ribbonP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.192 * spd + audioAdvance * 0.192 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Rössler parameters: a = 0.2, b = 0.2, c = 5.7 (chaotic regime)
    float a = 0.2;
    float b = 0.2;
    float c = ( 5.7 + 1.2 * sin( t * 0.3 ) + 0.8 * audioCentroid ) * c_mod;

    // Screen coordinate frame
    float rot_a = t * 0.15 + audioPhase * 0.1;
    float cs = cos( rot_a ), sn = sin( rot_a );
    // Sub-bass shrinks the world-units-per-screen factor, which magnifies the
    // spiral disk on screen -- the attractor state itself must stay untouched,
    // since its trajectory is an integration and rescaling it mid-flight would
    // jump the traced curve.
    vec2 p_rot = mat2( cs, -sn, sn, cs ) * uv * ( 22.0 + 4.0 * sin( audioSwell * 2.0 ) )
                 / ( 1.0 + 0.35 * audioSubBass );

    // Numerical integration along a Rössler trajectory seeded from a FIXED
    // point shared by every pixel -- not the pixel's own position -- so the
    // traced curve is one real spatial path instead of every pixel trivially
    // starting AT distance zero from itself (which washed the whole frame
    // out to a near-uniform glow).
    vec3  p_rossler = vec3( 2.0, 1.0, 0.2 );
    float min_dist = 1e5;
    float z_escape_acc = 0.0;

    float dt = 0.02 * rbn;

    for ( int i = 0; i < 28; i++ )
    {
        // Rössler ODE equations
        float dx = -p_rossler.y - p_rossler.z;
        float dy = p_rossler.x + a * p_rossler.y;
        float dz = b + p_rossler.z * ( p_rossler.x - c );

        p_rossler += vec3( dx, dy, dz ) * dt;

        float d = length( p_rot - p_rossler.xy );
        min_dist = min( min_dist, d );

        // Accumulate high-z excursions (the chaotic pop-up loop)
        if ( p_rossler.z > 2.0 )
        {
            z_escape_acc += exp( -d * 0.8 ) * ( p_rossler.z * 0.2 );
        }
    }

    // Sample distorted background photo
    vec2 sample_uv = fract( p_rot * 0.06 + 0.5 );
    vec3 tex_col = img( sample_uv );

    // Glowing trajectory ribbon
    float line_glow = exp( -min_dist * ( 2.0 + 1.5 * audioCentroid ) ) * glw;

    // Palette mixing
    float phase = atan( p_rot.y, p_rot.x ) / 6.2831853 + length( p_rot ) * 0.03;
    vec3  pal_a = imgPalette( phase + t * 0.05 );
    vec3  pal_b = imgPalette( phase + 0.5 );
    vec3  col = mix( pal_a, pal_b, 0.5 + 0.5 * sin( z_escape_acc * 0.6 ) );

    col = mix( col, tex_col, 0.35 + 0.15 * audioValence );

    // Add glowing ribbon sheets and chaotic Z-pop flashes
    vec3 ribbon_tint = vec3( 1.3, 1.1, 1.8 ) * line_glow * ( 1.0 + 2.5 * audioKick );
    vec3 z_pop_tint = vec3( 1.8, 1.5, 0.4 ) * z_escape_acc * ( 1.0 + 3.0 * audioKick );
    col += ribbon_tint + z_pop_tint;

    col = pow( col, vec3( 0.88 ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
