#version 330 core
/*****************************************************************************\
 *                              StereoProbe3D.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  The stereo measuring scene (20.11.2026): three flat cards at known distances -- red at 8 units (in front of the
 *  zero plane), green at 24 (on it), blue at 60 (behind it) -- on black.
 *
 *  Not part of any preset.  Tools/stereo_disparity.py puts it into a scratch preset, renders it in every stereo format
 *  (live and in the video export) and finds each card in the left and the right eye: the horizontal distance is the
 *  disparity, compared with what StereoProbe3D.vert's numbers give.  Flat colours on black, so a card is found by
 *  its colour channel alone.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

flat in int vCard; ///< Which card (from the vertex stage).

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec3 c = vCard == 0 ? vec3( 1.0, 0.0, 0.0 ) : ( vCard == 1 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 0.0, 0.0, 1.0 ) );
    fragColor = vec4( c, 1.0 );
}
