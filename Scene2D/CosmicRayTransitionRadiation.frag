#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file CosmicRayTransitionRadiation.frag
 * @brief COSMIC RAY TRANSITION RADIATION: Ultra-relativistic charged particles traversing periodic
 * multilayer foil stacks (mylar/polypropylene radiator). Sudden dielectric boundary crossings emit
 * highly collimated forward X-ray transition radiation cones with photo-derived interference fringes.
 *   audioAdvance -> accelerates relativistic particle beam traversing radiator stack
 *   audioKick    -> flashes boundary crossing X-ray photon emission bursts
 *   audioSwell   -> widens foil stack cross-section & forward X-ray cone brightness
 *   audioCentroid-> shifts X-ray transition radiation spectral interference peaks
 *   audioHigh    -> modulates high-frequency formation zone interference ripples
 *
 * Per-activation variety:
 *   foilDensityP float multilayer radiator foil stack density    (4.0..14.0)
 *   coneAngleP   float transition radiation cone opening angle   (0.3..1.2)
 *   xrayGlowP    float X-ray emission peak luminance gain        (0.8..2.5)
 *   gammaLorentzP float particle Lorentz factor gamma parameter   (0.6..2.2)
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
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.

uniform float foilDensityP;
uniform float coneAngleP;
uniform float xrayGlowP;
uniform float gammaLorentzP;

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  col = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float g = dot( col, vec3( 0.333 ) );
    return mix( vec3( g ), col, 0.55 + 0.45 * audioValence );
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2  uv = ( gl_FragCoord.xy - 0.5 * resolution ) / min( resolution.x, resolution.y );
    float t = time * 0.45 + audioAdvance * 0.4;

    // Multilayer radiator foil interfaces along Y-axis
    float f_dens = ( foilDensityP > 0.01 ? foilDensityP : 8.0 );
    float foil_y = fract( uv.y * f_dens ) - 0.5;
    float foil_id = floor( uv.y * f_dens );

    float gamma = ( gammaLorentzP > 0.01 ? gammaLorentzP : 1.3 );
    float glow_k = ( xrayGlowP > 0.01 ? xrayGlowP : 1.3 );

    // THREE relativistic particles drifting across the foil stack.  The old
    // build drew ONE fixed track and ONE fixed cone: on screen that was a
    // static white phi-glyph, and nothing about it read as radiation.
    vec3  col_acc = vec3( 0.0 );
    float track_acc = 0.0;
    for ( int k = 0; k < 3; ++k )
    {
        float fk = float( k );
        // Each particle wanders horizontally on its own slow path.
        float px = sin( t * ( 0.31 + 0.09 * fk ) + fk * 2.4 ) * 0.62;
        float p_track = exp( -abs( uv.x - px ) * 60.0 );
        track_acc += p_track;

        // The particle's head sweeps downward through the foils, one pass
        // per couple of seconds; a radiation cone RING EXPANDS from every
        // boundary it has just crossed.
        float head_phase = fract( t * 0.30 + fk * 0.37 );
        float head_y = 0.75 - 1.5 * head_phase;
        float ring_age = fract( head_phase * f_dens );
        float ring_y = ( floor( head_phase * f_dens ) + 0.5 ) / f_dens * -1.5 + 0.75;
        float rr = length( vec2( uv.x - px, uv.y - ring_y ) );
        float ring_r = ring_age * ( 0.55 + 0.25 / gamma );
        float cone_ring = exp( -abs( rr - ring_r ) * 26.0 ) * ( 1.0 - ring_age * 0.8 );

        // Formation-zone fringes ride ON the expanding ring.
        float fringes = 0.5 + 0.5 * sin( rr * 34.0 - audioPhase * 2.0 );
        fringes = mix( 0.7, fringes, clamp( 0.6 + 0.8 * audioHigh, 0.0, 1.3 ) );

        vec3 c_cone = imgPalette( fract( 0.13 + fk * 0.29 + ring_age * 0.2 ) );
        col_acc += c_cone * cone_ring * fringes * 1.7;
        // Bright head spark where the particle currently is.
        float head = exp( -length( vec2( ( uv.x - px ) * 2.2, uv.y - head_y ) ) * 26.0 );
        col_acc += vec3( 0.95, 0.97, 1.0 ) * head * ( 1.1 + 2.2 * audioKick );
    }

    float boundary_cross = exp( -abs( foil_y ) * 35.0 );
    vec3  col_foil = imgPalette( fract( foil_id * 0.11 + 0.45 ) ) * 1.5;

    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 bg = img( bg_uv ) * 0.30;

    vec3 col = bg;
    col += col_foil * boundary_cross * ( 0.55 + 0.35 * audioSwell );
    col += col_acc * glow_k;
    col += vec3( 0.9, 0.93, 1.0 ) * track_acc * 0.5 * ( 1.0 + 1.2 * audioKick );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
