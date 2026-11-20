#version 330 core
/*****************************************************************************\
 *                              StereoProbe3D.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage of the stereo measuring scene: three flat cards at known distances (8, 24 and 60 units), red, green
 *  and blue, at fixed places on the screen -- see StereoProbe3D.frag.
 *
 *  Tools/stereo_disparity.py renders it in every stereo format and measures how far each card lies apart in the two
 *  eyes.  The eye offset follows the convention of every 3D scene (the camera moves by eyeOff, then the picture is
 *  pulled back by eyeOff * 0.045 in clip space, so the zero plane lies where projM[0][0] / z = 0.045 -- 24 units at
 *  16:9); the disparity the tool expects is computed from exactly these numbers.
 *
 *  @author René Weller
 */

in vec4 attrA; ///< Vertex attribute A (geom="quads": attrA.xy = the card's corner, attrA.w = the card's index).
in vec4 attrB; ///< Vertex attribute B (per-card seeds; unused).

uniform mat4  projM;  ///< Projection matrix.
uniform float eyeOff; ///< Stereo eye offset (0 in mono).

flat out int vCard; ///< Which card: 0 red (near), 1 green (at the zero plane), 2 blue (far).

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    int card = int( attrA.w + 0.5 );
    vCard = card;
    if ( card > 2 )
    {
        gl_Position = vec4( 0.0, 0.0, -3.0, 1.0 ); // the other 2997 quads: outside the clip volume
        return;
    }
    // Distance and place on the screen (in the mono picture): near on the left, zero plane in the middle, far on the
    // right.  The world position is solved from the projection so the place does not depend on the aspect.
    float z = card == 0 ? 8.0 : ( card == 1 ? 24.0 : 60.0 );
    float ndc_x = card == 0 ? -0.5 : ( card == 1 ? 0.0 : 0.5 );
    float sx = projM[0][0], sy = projM[1][1];
    vec2  half_size = vec2( 0.07 * z / sx, 0.12 * z / sy ); // 0.07 x 0.12 of the half screen
    vec2  corner = ( attrA.xy - 0.5 ) * 2.0 * half_size;
    vec3  vp = vec3( ndc_x * z / sx + corner.x, corner.y, z );

    vp.x -= eyeOff;
    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
