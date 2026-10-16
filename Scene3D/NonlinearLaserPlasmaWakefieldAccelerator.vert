#version 330 core
/*****************************************************************************\
 *                              NonlinearLaserPlasmaWakefieldAccelerator.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to NonlinearLaserPlasmaWakefieldAccelerator.frag -- see that file's header for this
 *  scene's description.
 *
 *  The accelerator channel is a TUBE, and a tube can only ever be a band across
 *  the picture -- lengthening it further just made a longer band.  So every
 *  ribbon's 300 segments are split into two runs: the first draws the cavity
 *  train's sheath as before (all twenty strands, now on a longer, fatter
 *  channel), the second draws one ionisation filament of the ambient plasma the
 *  channel is bored through, laid out in FRUSTUM coordinates so the twenty
 *  filaments criss-cross the entire frame at every depth.  The quad that
 *  bridges the two runs is pinched to zero width and zero brightness by the
 *  end taper, so no sheet is ever drawn between them.
 *
 *  @author René Weller
 */

in vec4 attrA; ///< x = t [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; ///< 4 seeds in [0,1)

out vec2  vUV;          ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out float vSide;        ///< Which side of a strip (from the vertex stage).
out float vRibbonID;    ///< Ribbon ID (from the vertex stage).
out vec3  vCol;         ///< Colour (from the vertex stage).
out float vBubblePulse; ///< Bubble pulse (from the vertex stage).

uniform mat4  projM;      ///< Projection matrix.
uniform float eyeOff;     ///< Stereo eye offset (0 in mono).
uniform float time;       ///< Seconds since the program started (never reset; see sceneTime).
uniform vec2  resolution; ///< Size of the render target in pixels.

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

uniform float bubbleRadiusP;    ///< Bubble radius knob, 0.5..1.5.
uniform float ribbonWidthP;     ///< Ribbon width knob, 0.02..0.1.
uniform float wakefieldLengthP; ///< Wakefield length knob, 2..6.

/// The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
const float TanY = 0.5206;

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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float t_coord = attrA.x;
    float side = attrA.y;
    float r_index = attrA.w;

    vSide = side;
    vRibbonID = r_index;

    float aspect = ( resolution.y > 0.5 ) ? resolution.x / resolution.y : 1.7778;

    float t = time * 0.45 + audioAdvance * 0.4;

    // Two runs per ribbon: 0 = accelerator channel, 1 = ambient plasma.
    float g = min( floor( t_coord * 2.0 ), 1.0 );
    float u = clamp( t_coord * 2.0 - g, 0.0, 1.0 );
    vUV = vec2( u, side * 0.5 + 0.5 );

    // Exactly zero at both ends of a run, so the bridging quad degenerates.
    float taper = smoothstep( 0.0, 0.10, u ) * ( 1.0 - smoothstep( 0.90, 0.99, u ) );

    float w_base = ( ribbonWidthP > 0.001 ? ribbonWidthP : 0.045 )
                   * ( 1.0 + 0.3 * audioSwell );

    vec3 vp;

    if ( g < 0.5 )
    {
        // ---- The accelerator channel ---------------------------------
        // Laser plasma wakefield "bubble" regime: ultraintense laser expels
        // electrons creating a spherical ion cavity.
        float r_bubble = ( bubbleRadiusP > 0.01 ? bubbleRadiusP : 0.85 ) * 2.4;
        float z_len = ( wakefieldLengthP > 0.01 ? wakefieldLengthP : 3.6 ) * 3.6;
        float z_pos = ( u - 0.5 ) * z_len;

        // A wake is a TRAIN of cavities, not a single bubble: the plasma
        // oscillates behind the driver at the plasma wavelength, so the
        // blowout repeats down the channel.  The train damps with distance
        // behind the driver but never pinches shut, so the whole channel
        // carries structure.
        float z_laser = sin( t * 1.5 ) * 1.6;
        float lam = 2.15 * r_bubble; // plasma wavelength
        float d_cav = abs( fract( ( z_pos - z_laser ) / lam + 0.5 ) - 0.5 ) * lam;
        float damp = 0.55 + 0.45 * exp( -abs( z_pos - z_laser ) * 0.14 );
        float r_loc = r_bubble * damp;
        // Each cavity spans a whole half-period, so the train is a chain of
        // touching cavities: damping narrows them without opening bare gaps
        // of axis between them.
        float u_cav = d_cav / ( 0.5 * lam );
        float bubble_r = r_loc * sqrt( max( 0.0, 1.0 - u_cav * u_cav ) );

        // One strand per ribbon.
        float n_strands = 20.0;
        float phi = r_index * ( 6.2831853 / n_strands ) + z_pos * 2.0 + t * 2.0;

        vec3 center_pos = vec3( cos( phi ) * ( bubble_r + 0.22 ),
                                sin( phi ) * ( bubble_r + 0.22 ),
                                z_pos );

        vec3 binormal = vec3( cos( phi ), sin( phi ), 0.0 );

        float width = w_base * 1.6 * taper;
        vec3  world_pos = center_pos + binormal * ( side * width );

        // Trapped relativistic electron bunch self-injection flash at the
        // back of the bubble.
        float at_back = exp( -pow( z_pos - ( z_laser - r_bubble ), 2.0 ) * 6.0 );
        vBubblePulse = at_back * ( 1.0 + 3.5 * audioKick ) * taper;

        vCol = imgPalette( fract( r_index * 0.166 + u * 0.3 + audioCentroid ) ) * taper;

        // Camera Transform (V3): the channel turns broadside and end-on.
        vp = world_pos;
        float c = cos( t * 0.15 ), s = sin( t * 0.15 );
        vp = vec3( vp.x * c - vp.z * s, vp.y, vp.x * s + vp.z * c );
        // Far enough back that the lengthened channel (half-length up to 6.5
        // units) cannot swing through the eye when the rotation turns it
        // broadside-on, close enough that the cavity train still fills the
        // frame.
        vp.z += 11.0;
    }
    else
    {
        // ---- Ambient plasma: ionisation filaments --------------------
        // The gas jet the channel is bored through is not empty -- it glows
        // in fine striations along the laser's own polarisation.  Twenty of
        // them, each a long wavy cord crossing the picture at its own angle
        // and depth, which is what carries the frame outside the channel.
        float fs = fract( r_index * 0.618034 + 0.19 );
        float fd = 6.5 + fract( r_index * 0.371 + 0.53 ) * 15.5; // depth 6.5 .. 22
        float half_h = fd * TanY;

        float a_fil = fs * 3.14159265;
        vec2  dir = vec2( cos( a_fil ), sin( a_fil ) );
        vec2  nrm = vec2( -dir.y, dir.x );

        // Screen-normalised coordinates: y spans +-1, x spans +-aspect.  The
        // cord runs past both edges whichever way it is pointing.
        float s = ( u - 0.5 ) * 2.0;
        float off_n = ( fract( r_index * 0.917 + 0.31 ) - 0.5 ) * 2.0 * 1.15;
        float wob = sin( s * 3.4 + time * 0.37 + r_index * 1.7 + audioPhase * 0.25 ) * 0.20
                    + sin( s * 8.1 - time * 0.23 + r_index ) * 0.08;

        vec2 sxy = dir * ( s * 2.3 ) + nrm * ( off_n + wob );

        float width = ( 0.010 + 0.006 * fs ) * half_h
                      * ( 1.0 + 0.3 * audioSwell ) * taper;

        vp = vec3( sxy.x * half_h + nrm.x * side * width,
                   sxy.y * half_h + nrm.y * side * width,
                   fd );

        // Betatron sparkle running along the cord.
        vBubblePulse = 0.10 * pow( 0.5 + 0.5 * sin( s * 26.0 + t * 2.4 + r_index * 2.0 ), 3.0 )
                       * ( 1.0 + 2.0 * audioKick ) * taper;

        // Background layer: clearly dimmer than the channel, but bright
        // enough that no tile of the picture is ever empty.
        vCol = imgPalette( fract( r_index * 0.083 + u * 0.15 + audioCentroid ) ) * 0.42 * taper;
    }

    vp.x -= eyeOff;

    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if ( vp.z < 0.4 )
        gl_Position = vec4( 0.0, 0.0, -3.0, 1.0 );
}
