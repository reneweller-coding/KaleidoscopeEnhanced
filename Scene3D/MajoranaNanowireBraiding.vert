#version 330 core
/**
 * @file MajoranaNanowireBraiding.vert
 * @brief Vertex stage companion to MajoranaNanowireBraiding.frag -- see that file's
 * header for this scene's description.
 *
 * SCREEN FILL: all 20 ribbons used to braid inside ONE bundle 1.3 units across,
 * lying on the view axis 4.5 units out -- a small knot of hair-thin threads in
 * the middle of a black frame (occ 0.31), and half of every wire turned
 * edge-on because the ribbon widened around the wire's own axis instead of
 * across the screen.  The 20 ribbons are now THREE braided bundles standing
 * side by side across the whole picture width, their wire axes running
 * vertically past both the top and bottom edges, plus two wide backdrop bands
 * that keep the superconducting vacuum around them off pure black.
 */

in vec4 attrA; ///< x = t [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; ///< 4 seeds in [0,1)

out vec2  vUV;               ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out float vSide;             ///< Which side of a strip (from the vertex stage).
out float vRibbonID;         ///< Ribbon ID (from the vertex stage).
out vec3  vCol;              ///< Colour (from the vertex stage).
out float vMajoranaZeroMode; ///< Majorana zero mode (from the vertex stage).
out float vKind;             ///< 0 = nanowire worldline, 1 = backdrop band

uniform mat4  projM;  ///< Projection matrix.
uniform float eyeOff; ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float ribbonWidthP; ///< Ribbon width knob, 0.02..0.1.
uniform float braidSpeedP;  ///< Braid speed knob, 0.6..2.5.

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
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  col = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float g = dot( col, vec3( 0.333 ) );
    return mix( vec3( g ), col, 0.55 + 0.45 * audioValence );
}

/**  House tint: bend a colour toward the photo palette while keeping its luminance.
 *
 * @param c  The colour. (in)
 * @param t  Position on the palette, 0..1. (in)
 * @param k  Strength of the tint, 0..1. (in)
 *
 * @return
 *   The tinted colour.
 *
 * The raw palette was used directly before, so a dark corner of the slideshow image handed every wire a near-black
 * worldline.
 **/
vec3 palTint( vec3 c, float t, float k )
{
    vec3 tp = imgPalette( t );
    tp *= dot( c, vec3( 0.3333 ) ) / max( dot( tp, vec3( 0.3333 ) ), 1e-3 );
    return mix( c, tp, k );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float t_coord = attrA.x;
    float side = attrA.y;
    float r_index = attrA.w;

    vSide = side;
    vRibbonID = r_index;
    vUV = vec2( t_coord, side * 0.5 + 0.5 );

    float t = time * 0.35 + audioAdvance * 0.3;
    float v_braid = ( braidSpeedP > 0.01 ? braidSpeedP : 1.2 );

    vec3  world_pos;
    vec3  col;
    float mzm = 0.0;

    if ( r_index < 17.5 )
    {
        // ---- THREE BRAIDED BUNDLES, 3 nanowire PAIRS each -------------
        vKind = 0.0;
        float b = floor( r_index / 6.0 ); // bundle 0..2
        float s_idx = r_index - b * 6.0;  // strand 0..5
        float strand_phase = s_idx * 1.04719755 + b * 0.73;

        // The worldline axis runs up the frame and past both edges.
        float y_pos = ( t_coord - 0.5 ) * 6.4;

        // Non-Abelian braiding permutations (braid group generators sigma_1, sigma_2)
        float braid_time = y_pos * 1.15 + t * v_braid;
        float r_braid = ( 0.92 + 0.40 * sin( braid_time * 0.5 + strand_phase ) )
                        * ( 1.0 + 0.10 * audioSwell );
        float phi_braid = strand_phase + sin( braid_time + strand_phase ) * 1.2;

        float bx = ( b - 1.0 ) * 2.75;
        vec3  center_pos = vec3( bx + cos( phi_braid ) * r_braid,
                                 y_pos,
                                 sin( phi_braid ) * r_braid );

        // Ribbon frame: widen ACROSS THE SCREEN (perpendicular to the wire and
        // to the view axis), so a wire on the far side of the braid stays a
        // drawn line instead of turning edge-on and vanishing.
        vec3 tangent = normalize( vec3( -sin( phi_braid ) * r_braid, 1.0,
                                        cos( phi_braid ) * r_braid ) );
        vec3 binormal = normalize( cross( tangent, vec3( 0.0, 0.0, 1.0 ) ) );

        float width = ( ribbonWidthP > 0.001 ? ribbonWidthP : 0.045 )
                      * ( 1.0 + 0.3 * audioSwell ) * 2.6;
        world_pos = center_pos + binormal * ( side * width );

        // Majorana Zero Mode localized wavepackets at the wire ends
        // (t_coord near 0 and 1 -- now the top and bottom of the frame).
        float end_proximity = max( exp( -t_coord * 14.0 ), exp( -( 1.0 - t_coord ) * 14.0 ) );
        mzm = end_proximity * ( 1.0 + 3.5 * audioKick );

        // Each PAIR of strands shares a colour: the two halves of one
        // fermion, cyan through violet across the three pairs.
        float pair = floor( s_idx * 0.5 ); // 0..2
        vec3  base = mix( vec3( 0.30, 0.78, 1.00 ), vec3( 0.72, 0.40, 1.00 ), pair * 0.5 );
        col = palTint( base, fract( r_index * 0.166 + t_coord * 0.2 + audioCentroid ), 0.35 );
    }
    else
    {
        // ---- BACKDROP: the superconducting vacuum --------------------
        // Two wide bands covering the whole frame behind the braids, carrying
        // a slow Andreev interference fringe.  Dim by design: it only keeps
        // the space between the wires off pure black.
        vKind = 1.0;
        float bi = r_index - 18.0; // 0 or 1
        float x = ( t_coord - 0.5 ) * 13.6;
        float yb = ( bi - 0.5 ) * 3.4;
        float wav = 0.22 * sin( x * 0.8 - t * 0.5 + bi * 1.7 );
        world_pos = vec3( x, yb + wav + side * 2.0, 1.6 );

        float fringe = 0.5 + 0.5 * sin( x * 1.7 - t * 0.9 + bi * 2.2 ) * cos( x * 0.6 + t * 0.28 );
        col = palTint( vec3( 0.34, 0.52, 0.95 ), fract( 0.3 + bi * 0.17 + audioCentroid ), 0.35 )
              * ( 0.115 + 0.105 * fringe ) * ( 0.85 + 0.35 * audioSwell );
        mzm = 0.0;
    }

    vMajoranaZeroMode = mzm;
    vCol = col;

    // Camera Transform (V3).  The old full turntable swung the bundle edge-on
    // twice a turn; a shallow sway keeps the braid field facing the camera.
    vec3  vp = world_pos;
    float ra = 0.20 * sin( t * 0.18 );
    float c = cos( ra ), s = sin( ra );
    vp = vec3( vp.x * c - vp.z * s, vp.y, vp.x * s + vp.z * c );
    vp.z += 4.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
