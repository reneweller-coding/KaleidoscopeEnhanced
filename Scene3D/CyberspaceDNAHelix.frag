#version 330 core
/*****************************************************************************\
 *                              CyberspaceDNAHelix.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Lighting for the double-helix DNA strand: colours each base-pair rung by nucleotide
 *  (Adenine/Thymine/Cytosine/Guanine, cycled along the strand) and flashes it toward white as a transcription pulse
 *  travels past.
 *
 *  The transcription pulse itself (vTranscription, which drives both the
 *  brightness boost and the colour mix toward the pulse colour) is generated
 *  per-vertex in CyberspaceDNAHelix.vert, where audioKick sharpens it and
 *  audioSwell widens the strand-unzipping fork at the helix's centre; this
 *  fragment stage reads vTranscription back, colours the bases by musical
 *  mode, and applies the preset hue rotation (hueP).
 *
 *  Audio Reactivity:
 *    audioMode      -> nucleotide palette temperature: a minor key cools the
 *                      whole A/T/C/G set toward steel-cyan, a major key lets
 *                      the full warm base spectrum through
 *    (audioKick / audioSwell / audioAdvance / audioHarmChange / audioUpperMid
 *     all act upstream in CyberspaceDNAHelix.vert -- see that file.)
 *
 *  @author René Weller
 */
in vec3  vPos;           ///< Position (from the vertex stage).
in vec2  vUV;            ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in float vStrandID;      ///< Strand ID (from the vertex stage).
in float vTranscription; ///< Transcription (from the vertex stage).

out vec4 fragColor; ///< The pixel's colour (output).

uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance; ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                            ///< backwards).
uniform float audioKick;    ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;    ///< Bass band level, 0..1.
uniform float audioMid;     ///< Mid band level, 0..1.
uniform float audioHigh;    ///< High band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioMode;    ///< 0 = minor / dark, 1 = major / resolved (slow ~3 s)

uniform float glowP;  ///< Glow / afterglow knob, 0..1.
uniform float helixP; ///< Helix knob, 0.5..2.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  Rotates a colour's hue by an angle (about the grey axis).
 *
 * @param c  The colour. (in)
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The colour with its hue turned.
 **/
vec3 hueRot( vec3 c, float a )
{
    vec3  k = vec3( 0.57735026919 );
    float cs = cos( a ), sn = sin( a );
    return c * cs + cross( k, c ) * sn + k * dot( k, c ) * ( 1.0 - cs );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float glw = ( glowP > 0.0 ) ? glowP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    float edge = smoothstep( 0.5, 0.1, abs( vUV.y - 0.5 ) );

    // DNA nucleotide base color mapping (Adenine=Green, Thymine=Red, Cytosine=Cyan, Guanine=Gold)
    float base_idx = mod( floor( vUV.x * 40.0 ), 4.0 );
    vec3  base_color = vec3( 0.0 );
    if ( base_idx == 0.0 )
        base_color = vec3( 0.1, 0.9, 0.3 ); // Adenine
    else if ( base_idx == 1.0 )
        base_color = vec3( 1.0, 0.2, 0.3 ); // Thymine
    else if ( base_idx == 2.0 )
        base_color = vec3( 0.1, 0.8, 1.0 ); // Cytosine
    else
        base_color = vec3( 1.0, 0.8, 0.2 ); // Guanine

    // Musical mode sets the sequencer's colour temperature: minor keys drain
    // the four bases toward a cold steel-cyan readout, major keys let the full
    // warm A/T/C/G spectrum come back. Colour only -- luminance never rises.
    vec3 cold_base = mix( vec3( 0.15, 0.55, 0.85 ), base_color, 0.35 );
    base_color = mix( cold_base, base_color, clamp( audioMode, 0.0, 1.0 ) );

    // Transcription laser pulse
    vec3 pulse_color = vec3( 1.0, 1.0, 0.8 );
    vec3 col = mix( base_color, pulse_color, vTranscription * 0.7 );
    col *= ( 0.8 + 2.0 * vTranscription ) * edge * glw;

    if ( hue > 0.001 )
        col = hueRot( col, hue );

    fragColor = vec4( col * 1.7, edge * 0.95 );
}
