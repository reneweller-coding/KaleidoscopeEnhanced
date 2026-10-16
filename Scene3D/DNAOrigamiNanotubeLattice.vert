#version 330 core
/**
 * @file DNAOrigamiNanotubeLattice.vert
 * @brief Vertex stage companion to DNAOrigamiNanotubeLattice.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; ///< x = t [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; ///< 4 seeds in [0,1)

out vec2  vUV;         ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out float vSide;       ///< Which side of a strip (from the vertex stage).
out float vRibbonID;   ///< Ribbon ID (from the vertex stage).
out vec3  vCol;        ///< Colour (from the vertex stage).
out float vFluorPulse; ///< Fluor pulse (from the vertex stage).
out float vDepthShade; ///< Depth shade (from the vertex stage).

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

uniform float tubeRadiusP;  ///< Tube radius knob, 0.4..1.
uniform float helixTurnsP;  ///< Helix turns knob, 4..12.
uniform float ribbonWidthP; ///< Ribbon width knob, 0.02..0.08.

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

    float t = time * 0.35 + audioAdvance * 0.3;

    // ---- A LATTICE of DNA origami bundles ------------------------------
    // The scene is called a lattice, but it used to build ONE bundle in the
    // middle of the frame.  Each of the 20 ribbons is cut into two independent
    // STRANDS (tapered to nothing at the cut, so the quad that bridges them is
    // degenerate and invisible), giving 40 strands = ten 4-helix bundles on a
    // slowly turning ring lattice.
    float piece = min( floor( t_coord * 2.0 ), 1.0 ); // which half of the ribbon
    float lt = t_coord * 2.0 - piece;                 // 0..1 along this strand
    float s_idx = r_index * 2.0 + piece;              // 0..39 strands
    float tube_i = floor( s_idx * 0.25 );             // 0..9 bundles
    float h_idx = mod( s_idx, 4.0 );                  // helix within the bundle

    vUV = vec2( lt, side * 0.5 + 0.5 );

    // Taper AND fade both ends of a strand: this is what hides the bridging
    // quad between piece 0 and piece 1 (zero width, zero light).
    float end_fade = smoothstep( 0.0, 0.05, lt ) * smoothstep( 1.0, 0.95, lt );

    const float TanY = 0.5206; // 55 deg vertical FOV
    float       aspect = ( resolution.y > 0.5 ) ? resolution.x / resolution.y : 1.7778;

    // Lattice site: an outer ring of six, an inner ring of three, one centre.
    // The outer ring stops at 0.80 of the frustum half-extent, not 1.00: a
    // bundle centred exactly ON the frame border throws half of its own light
    // off-screen, which is coverage paid for and then thrown away.
    float ring_a, ring_r;
    if ( tube_i < 6.0 )
    {
        ring_a = tube_i * 1.04719755;
        ring_r = 0.80;
    }
    else if ( tube_i < 9.0 )
    {
        ring_a = ( tube_i - 6.0 ) * 2.0943951 + 1.0472;
        ring_r = 0.40;
    }
    else
    {
        ring_a = 0.0;
        ring_r = 0.0;
    }
    ring_a += t * 0.16; // the crystal turns slowly
    vec2 site = vec2( cos( ring_a ), sin( ring_a ) ) * ring_r;

    // Each bundle sits at its OWN depth in the culture.  Because the site is in
    // frustum coordinates and every length below is scaled by ang = dz/6, the
    // bundle keeps its screen position and its angular size whatever depth it
    // gets -- so the depth buys light/dark separation (see vDepthShade) without
    // costing any screen coverage.
    float dz = 4.2 + 5.2 * fract( tube_i * 0.618 );
    float ang = dz / 6.0;
    float half_h = dz * TanY;
    float half_w = half_h * aspect;
    vec3  cell_c = vec3( site.x * half_w, site.y * half_h, dz );

    // Each bundle is tilted off the view axis so it SWEEPS across the frame as
    // it recedes instead of collapsing into a ring seen end-on.  The tilt
    // direction follows the bundle's own lattice angle, so the crystal splays
    // outward and the ten bundles between them reach every corner.
    float ax_a = 0.52 + 0.18 * sin( t * 0.13 ) + ring_a;
    vec3  A = normalize( vec3( cos( ax_a ) * 0.62, sin( ax_a ) * 0.62, 1.0 ) );
    vec3  U = normalize( cross( A, vec3( 0.0, 0.0, 1.0 ) ) );
    vec3  V = cross( A, U );

    float r_b = 0.30 * clamp( ( tubeRadiusP > 0.01 ? tubeRadiusP : 0.65 ) / 0.65, 0.7, 1.5 ) * ang;
    float tube_l = 7.8 * ang;
    float s_ax = ( lt - 0.5 ) * tube_l;

    // DNA helical twist along the bundle axis.  Dividing by ang keeps the
    // number of turns per strand fixed, so a far bundle is not a finer,
    // sub-pixel corkscrew than a near one.
    float turns = ( helixTurnsP > 0.01 ? helixTurnsP : 8.0 );
    float twist_k = turns * 0.09 / ang;
    float helix_angle = s_ax * twist_k + h_idx * 1.5707963 + t * 1.2;

    // Each duplex also wraps its own small double-helix path
    float dh = r_b * 0.22;
    vec3  local = vec3( cos( helix_angle ) * r_b + cos( helix_angle * 4.0 ) * dh,
                        sin( helix_angle ) * r_b + sin( helix_angle * 4.0 ) * dh,
                        s_ax );

    vec3 tangent = normalize( vec3( -sin( helix_angle ) * r_b * twist_k,
                                    cos( helix_angle ) * r_b * twist_k, 1.0 ) );
    vec3 binormal = normalize( cross( tangent, vec3( cos( helix_angle ), sin( helix_angle ), 0.0 ) ) );

    // ribbonWidthP is compressed into 0.040..0.072 rather than used raw: at its
    // 0.02 end a raw value makes the backbone ~5 px wide in a 720p recording,
    // which is thin enough to average away to nothing at measuring resolution
    // and takes the whole scene's brightness with it.
    float w_base = 0.030 + 0.52 * clamp( ( ribbonWidthP > 0.001 ? ribbonWidthP : 0.05 ), 0.02, 0.08 );
    float width = w_base * clamp( r_b / ( 0.35 * ang ), 0.5, 1.8 ) * 1.9 * ang
                  * ( 1.0 + 0.3 * audioSwell ) * end_fade;
    local += binormal * ( side * width );

    // Fluorescent dye fluorophore tagging pulses along DNA origami scaffold
    float pulse = exp( -abs( fract( lt * 12.0 - t * 2.0 + s_idx * 0.1 ) - 0.5 ) * 16.0 ) * ( 1.0 + 3.0 * audioKick );
    vFluorPulse = pulse * end_fade;

    vCol = imgPalette( fract( s_idx * 0.083 + lt * 0.25 + audioCentroid ) ) * end_fade;

    // Camera Transform (V3)
    vec3 vp = cell_c + U * local.x + V * local.y + A * local.z;
    vp.z = max( vp.z, 0.9 );
    vp.x -= eyeOff;

    // Depth shading: the near bundles of the crystal are lit, the far ones sink
    // into the medium.  This is the scene's light/dark separation -- without it
    // every strand lands in the same luminance bucket and the frame reads flat
    // however much of it is covered.
    vDepthShade = clamp( 6.4 / vp.z, 0.30, 1.45 );

    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
