#version 330 core
/*****************************************************************************\
 *                              AnglerfishAbyss.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  ANGLERFISH ABYSS: black water, and the only light is the fish's own lure -- a small lamp that hangs in front of
 *  it and tints with the melody.
 *
 *  The body is lit by that lamp alone (plus a faint blue from far above), marine snow drifts through the beam, and
 *  a drop makes the lamp flare and the bioluminescent flanks pulse.  Dark, but staged: the whole scene is one pool
 *  of light in the dark.  No camera motion of any kind.
 *
 *  Audio Reactivity:
 *    audioMelodyPitch -> lamp colour (light)
 *    audioDrop        -> lamp flare (light)
 *    audioKick        -> flank bioluminescence pulses (light)
 *    audioSwell       -> the faint light from above (slow)
 *    audioLevel       -> lamp brightness
 *
 *  @author René Weller
 */
out vec4               fragColor;             ///< The pixel's colour (output).
uniform sampler2DArray texMeshMaterial;       ///< The mesh's material textures (albedo, roughness, normal ...).
uniform int            texMeshMaterialLayers; ///< Number of layers in texMeshMaterial.
uniform sampler2D      tex0;                  ///< The current photo.
uniform sampler2D      tex1;                  ///< The next photo (cross-faded in by interpolation).
uniform float          interpolation;         ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float time;             ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform float sceneTime;        ///< Seconds since this scene was activated.
uniform float audioAdvance;     ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                ///< backwards).
uniform float audioMelodyPitch; ///< Pitch of the melody, 0..1 over the tracked range.
uniform float audioDrop;        ///< Drop envelope: high after a detected drop, decaying.
uniform float audioKick;        ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;       ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;       ///< Overall loudness, 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;     ///< Mood valence: 0 dark .. 1 bright.
uniform float hueP;             ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

in vec2  vUV;     ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3  vNormal; ///< Surface normal (from the vertex stage).
in vec3  vPos;    ///< Position (from the vertex stage).
in float vBg;     ///< Background flag (from the vertex stage).

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

/**  Pseudo-random number 0..1 from a 3D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash13( vec3 p )
{
    p = fract( p * 0.3183099 + vec3( 0.71, 0.113, 0.419 ) );
    p *= 17.0;
    return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}

/**  Exposure that brings the material's average brightness to a common level.
 *
 * @param tex  The material texture array (layer 0 is the albedo). (in)
 *
 * @return
 *   The exposure factor, 0.3..2.
 **/
float materialExposure( sampler2DArray tex )
{
    vec3  avg = textureLod( tex, vec3( 0.5, 0.5, 0.0 ), 20.0 ).rgb;
    float l = dot( avg, vec3( 0.299, 0.587, 0.114 ) );
    return clamp( 0.20 / max( l, 0.02 ), 0.30, 2.0 );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float hue = ( hueP > 0.001 ) ? hueP : 0.0;
    // The lamp: in front of and above the fish, between it and the camera.
    vec3 lamp_pos = vec3( 3.0, 8.0, 27.0 );
    vec3 lamp_col = mix( imgPalette( hue * 0.159 + 0.5 ), imgPalette( hue * 0.159 + 0.05 ),
                         clamp( audioMelodyPitch, 0.0, 1.0 ) );
    lamp_col = mix( lamp_col, vec3( 0.7, 0.9, 1.0 ), 0.3 );
    float lamp_pow = ( 0.7 + 0.6 * audioLevel ) * ( 1.0 + 2.5 * clamp( audioDrop, 0.0, 1.0 ) );

    if ( vBg > 0.5 )
    {
        // The abyss: black, a faint blue from far above on the swell, marine
        // snow drifting down (positions on the scene clock), and the lamp's
        // glow as a halo in the water.
        vec3 d = normalize( vPos );
        vec3 col = vec3( 0.0, 0.01, 0.02 ) + vec3( 0.02, 0.05, 0.09 ) * max( d.y, 0.0 ) * clamp( audioSwell, 0.0, 1.0 );
        // Marine snow: ROUND flakes, jittered inside their cells, of varying
        // size -- a whole lit grid cell reads as a giant pixel (rule V8e).
        vec3  sp = d * 40.0 + vec3( 0.0, sceneTime * 0.6, 0.0 );
        vec3  cell = floor( sp );
        float hs = hash13( cell );
        vec3  off = vec3( hash13( cell + 1.7 ), hash13( cell + 5.3 ), hash13( cell + 9.1 ) ) - 0.5;
        vec3  f = fract( sp ) - 0.5 - off * 0.6;
        float sz = 0.06 + 0.10 * hash13( cell + 13.0 );
        float flake = smoothstep( sz, sz * 0.3, length( f ) ) * step( 0.975, hs );
        col += lamp_col * flake * 0.35 * ( 0.4 + 0.6 * hash13( cell + 2.2 ) );
        // Lamp halo seen against the water.
        vec3  to_lamp = normalize( lamp_pos );
        float halo = pow( max( dot( d, to_lamp ), 0.0 ), 40.0 );
        col += lamp_col * halo * 0.4 * lamp_pow;
        fragColor = vec4( col, 1.0 );
        return;
    }

    vec4 base = texture( texMeshMaterial, vec3( vUV, 0.0 ) );
    if ( base.a < 0.1 )
        discard;
    vec3  n = normalize( vNormal );
    vec3  to_lamp = lamp_pos - vPos;
    float dist2 = dot( to_lamp, to_lamp );
    vec3  L = to_lamp / sqrt( dist2 );
    float diff = max( dot( n, L ), 0.0 ) * 900.0 / ( dist2 + 30.0 );
    vec3  view_dir = normalize( -vPos );
    vec3  half_v = normalize( L + view_dir );
    float spec = pow( max( dot( n, half_v ), 0.0 ), 40.0 );

    float expose = materialExposure( texMeshMaterial );
    vec3  col = base.rgb * expose * lamp_col * diff * lamp_pow;
    col += lamp_col * spec * 0.4 * lamp_pow;
    // Faint blue from above.
    col += base.rgb * expose * vec3( 0.05, 0.1, 0.18 ) * max( n.y, 0.0 )
           * ( 0.3 + 0.7 * clamp( audioSwell, 0.0, 1.0 ) );
    // Bioluminescent flanks pulse on the kick: photophores where the surface
    // faces sideways.
    float flank = pow( abs( n.x ), 3.0 );
    float dots = smoothstep( 0.9, 1.0, hash13( floor( vPos * 1.5 ) ) );
    col += imgPalette( hue * 0.159 + 0.45 ) * flank * dots * ( 0.3 + 1.5 * audioKick );
    // The lamp itself, if this fragment is near it (the lure).
    float lure = exp( -length( vPos - lamp_pos ) * 0.8 );
    col += lamp_col * lure * 2.0 * lamp_pow;

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
