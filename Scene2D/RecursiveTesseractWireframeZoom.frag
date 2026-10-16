#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file RecursiveTesseractWireframeZoom.frag
 * @brief RECURSIVE TESSERACT WIREFRAME ZOOM: Continuous 4D-to-3D Schlegel projection
 * plunge through nested 8-cell Tesseract hypercube wireframe cages. Seamless 4D inner-outer
 * cell inversion, neon laser edge struts, and dimensional portal flashes.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous 4D rotation & forward plunge through hypercube cells
 *   audioKick    -> flashes 4D vertex nodes & triggers Schlegel cell inversion burst
 *   audioCentroid-> modulates 4D wireframe edge strut thickness & sharpness
 *   audioSubBass -> expands 4D hypercube spatial volume breathing
 *   audioChromaHue-> rotates the glowing 4D neon wireframe spectrum
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
uniform float tesseractScaleP;
uniform float rot4DP;
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

/// 4D isoclinic rotation
vec4 rot4D( vec4 p, float a1, float a2 )
{
    float c1 = cos( a1 ), s1 = sin( a1 );
    float c2 = cos( a2 ), s2 = sin( a2 );
    vec4  q = p;
    q.xy = vec2( c1 * p.x - s1 * p.y, s1 * p.x + c1 * p.y );
    q.zw = vec2( c2 * p.z - s2 * p.w, s2 * p.z + c2 * p.w );
    return q;
}

/// Distance to 2D line segment
float sdSegment( vec2 p, vec2 a, vec2 b )
{
    vec2  pa = p - a, ba = b - a;
    float h = clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 );
    return length( pa - ba * h );
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float t_scale = ( tesseractScaleP > 0.01 ) ? tesseractScaleP : 1.0;
    float r_4d = ( rot4DP > 0.01 ) ? rot4DP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.192 * spd + audioAdvance * 0.192 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Continuous 4D forward plunge: w component advances continuously
    float w_plunge = mod( t * 0.8, 2.0 ) - 1.0;

    // Sub-bass swells the projected hypercube itself. It scales the final 2D
    // projection radius, NOT the 4D rotation or plunge phase -- a plain
    // per-frame size factor can breathe freely without remapping any
    // accumulated angle.
    float vol_breath = 1.0 + 0.35 * audioSubBass;

    // Project 16 vertices of 4D Tesseract (+-1, +-1, +-1, +-1)
    vec2  proj_v[16];
    float rot_a1 = t * 0.25 * r_4d + audioPhase * 0.1;
    float rot_a2 = t * 0.18 * r_4d + audioSwell * 0.4;

    for ( int i = 0; i < 16; i++ )
    {
        vec4 v4 = vec4(
            ( i & 1 ) != 0 ? 1.0 : -1.0,
            ( i & 2 ) != 0 ? 1.0 : -1.0,
            ( i & 4 ) != 0 ? 1.0 : -1.0,
            ( i & 8 ) != 0 ? 1.0 : -1.0 );

        v4.w += w_plunge;
        v4 = rot4D( v4, rot_a1, rot_a2 );

        // 4D Perspective Schlegel projection to 3D, then 3D to 2D
        float d4 = 2.4 - v4.w * 0.5;
        vec3  v3 = v4.xyz / max( 0.2, d4 );

        float d3 = 2.0 - v3.z * 0.3;
        proj_v[i] = ( v3.xy / max( 0.2, d3 ) ) * ( 0.8 * t_scale * vol_breath );
    }

    // Accumulate distance to 32 Tesseract wireframe edges
    float min_edge_dist = 1e4;
    float min_vertex_dist = 1e4;

    for ( int i = 0; i < 16; i++ )
    {
        min_vertex_dist = min( min_vertex_dist, length( uv - proj_v[i] ) );

        for ( int bit = 0; bit < 4; bit++ )
        {
            int j = i ^ ( 1 << bit );
            if ( j > i )
            {
                float d_edge = sdSegment( uv, proj_v[i], proj_v[j] );
                min_edge_dist = min( min_edge_dist, d_edge );
            }
        }
    }

    // Sample distorted background photo
    vec2 sample_uv = fract( uv * 0.4 + 0.5 );
    vec3 tex_col = img( sample_uv );

    // Glowing 4D struts and vertex sparks. Near the vanishing point many of
    // the 32 projected edges cluster together, so min_edge_dist/min_vertex_dist
    // sit near 0 across a wide area -- and the tint constants alone (1.8,
    // 2.0) already exceed 1.0 even with NO kick, which is why the rounded
    // hypercube silhouette was blowing out to solid white on every frame,
    // not just on beats. Cap the glow*audio products directly.
    // 30 was far too soft: with 32 edges clustering near the vanishing
    // point the glow covered the whole silhouette and painted it solid
    // white.  A wireframe needs a falloff that only lights the LINE.
    float edge_glow = min( exp( -min_edge_dist * ( 150.0 + 40.0 * audioCentroid ) ) * glw * ( 1.0 + 2.0 * audioKick ),
                           0.9 );
    float vertex_glow = min( exp( -min_vertex_dist * 90.0 ) * ( 1.0 + 2.5 * audioKick ), 0.9 );

    // 4D hypercube neon palette
    vec3 pal_base = imgPalette( min_edge_dist * 0.5 + t * 0.05 );
    vec3 col = mix( tex_col * 0.3, pal_base, 0.45 );

    vec3 strut_tint = vec3( 0.85, 0.95, 1.5 ) * edge_glow;
    vec3 spark_tint = vec3( 1.3, 1.2, 1.6 ) * vertex_glow;

    col += strut_tint + spark_tint;

    // Center 4D singularity burst
    float center_bloom = min( exp( -length( uv ) * 14.0 ) * ( 0.5 + 1.2 * audioKick ), 0.35 );
    col += imgPalette( 0.85 ) * center_bloom;

    col = pow( col, vec3( 0.88 ) );
    vec3 cat_tone = clamp( col, 0.0, 1.0 );
    cat_tone /= 1.0 + 0.4 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    // One knee is enough: stacking a second one crushed the whole frame
    // under the 0.42 S-curve foot below, which then clamped the wires to
    // black and left only the centre bloom (the grey blob in the probe).
    cat_tone = clamp( ( cat_tone - 0.12 ) * 1.45, 0.0, 1.0 );
    fragColor = vec4( cat_tone, 1.0 );
}
