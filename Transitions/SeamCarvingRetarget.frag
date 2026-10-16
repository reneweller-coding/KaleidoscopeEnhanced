#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file SeamCarvingRetarget.frag
 * @brief TRANSITION SEAM CARVING RETARGET: seams of lowest energy are taken out
 * of the outgoing scene and seams of the incoming one are pushed in, so the
 * frame is squeezed together unevenly -- quiet areas vanish first and edges
 * hold their ground.
 *
 * The point of seam carving is that it is CONTENT AWARE: it does not scale, it
 * removes the paths a picture can least afford to lose.  So the compression
 * here is driven by an energy profile measured from the picture itself -- the
 * gradient magnitude accumulated down each column -- and the displacement at a
 * point is how much low-energy width lies to its left.  A uniform squeeze would
 * be a scale, which is exactly the thing seam carving exists to avoid.
 *
 * The two pictures are carved in opposite directions: the outgoing one loses
 * seams and pulls together, the incoming one gains them and opens out, so at
 * the middle of the turn both are distorted and the join is invisible.
 *
 * Audio Reactivity:
 *   audioFlux -> the carving rate: how many seams go per moment (slow)
 *   audioHigh -> the light along a seam as it closes (light)
 *   audioSwell -> how far the frame is retargeted (slow)
 *
 * Per-activation variety: energyP, amountP, hueP.
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioSwell;     ///< slow loudness swell: the only envelope allowed to shape geometry
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float energyP; ///< Energy knob, 0..1.
uniform float amountP; ///< Amount knob, 0.6..1.4.
uniform float hueP;    ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

const float Pi = 3.14159265358979; ///< Pi.

/**  Luminance of a colour.
 *
 * @param c  The colour. (in)
 *
 * @return
 *   The luminance (Rec. 709).
 **/
float lum( vec3 c )
{
    return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
}

/**  How much a column is worth keeping: the gradient it carries, sampled down its height.
 *
 * @param tx            The texture. (in)
 * @param x             The column, 0..1. (in)
 * @param colourWeight  Weight of the colour edges against the luma edges. (in)
 *
 * @return
 *   The energy.
 *
 * A cheap stand-in for the full energy map, and it is the same quantity -- edges are expensive, flat areas are not.
 **/
float columnEnergy( sampler2D tx, float x, float colourWeight )
{
    float e = 0.0;
    for ( int i = 0; i < 5; ++i )
    {
        float y = ( float( i ) + 0.5 ) / 5.0;
        vec3  a = textureLod( tx, clamp( vec2( x - 0.006, y ), 0.0, 1.0 ), 0.0 ).rgb;
        vec3  b = textureLod( tx, clamp( vec2( x + 0.006, y ), 0.0, 1.0 ), 0.0 ).rgb;
        e += abs( lum( b ) - lum( a ) ) + colourWeight * length( b - a );
    }
    return e / 5.0;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float ew = clamp( energyP, 0.0, 1.0 );
    float amt = ( amountP > 0.0 ) ? amountP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution;

    float d = clamp( 1.0 - interpolation, 0.0, 1.0 );
    float arc = sin( d * Pi );

    // What counts as energy: pure luminance edges, or colour changes too.
    float colourWeight = ew; // constant: an envelope on a scale re-lays the whole pattern (speed pass 14.09.2026)

    // Walk from the left edge to this pixel, accumulating how much of what we
    // passed was cheap enough to carve away.
    const int N = 20;
    float     cheap_left0 = 0.0, cheap_left1 = 0.0, total_cheap0 = 0.0, total_cheap1 = 0.0;
    for ( int i = 0; i < N; ++i )
    {
        float x = ( float( i ) + 0.5 ) / float( N );
        float c0 = 1.0 / ( 1.0 + 26.0 * columnEnergy( tex0, x, colourWeight ) );
        float c1 = 1.0 / ( 1.0 + 26.0 * columnEnergy( tex1, x, colourWeight ) );
        total_cheap0 += c0;
        total_cheap1 += c1;
        if ( x < uv.x )
        {
            cheap_left0 += c0;
            cheap_left1 += c1;
        }
    }
    cheap_left0 /= max( total_cheap0, 1e-4 );
    cheap_left1 /= max( total_cheap1, 1e-4 );

    // How far the frame is retargeted right now.
    float carve = arc * amt * ( 0.55 + 0.45 * clamp( audioSwell, 0.0, 1.0 ) )
                  * ( 0.85 + 0.4 * clamp( audioFlux * 2.0, 0.0, 1.0 ) );
    carve = clamp( carve, 0.0, 1.0 );

    // The outgoing picture loses seams and pulls together; the incoming one
    // gains them and opens out.  Both distortions are content aware.
    // A fifth of the way toward the cumulative profile: at half, the frame
    // collapsed into its own centre and read as a zoom, which is precisely what
    // seam carving is not.
    float u0 = uv.x + ( cheap_left0 - uv.x ) * carve * 0.22;
    float u1 = uv.x - ( cheap_left1 - uv.x ) * carve * 0.22;

    vec3 a = textureLod( tex0, clamp( vec2( u0, uv.y ), 0.0, 1.0 ), 0.0 ).rgb;
    vec3 b = textureLod( tex1, clamp( vec2( u1, uv.y ), 0.0, 1.0 ), 0.0 ).rgb;
    vec3 col = mix( a, b, smoothstep( 0.30, 0.70, d ) );

    // A seam closing pinches the light along it.  The seams are where the
    // compression is steepest, which is where the cheap columns were.
    float pinch = clamp( ( cheap_left0 - uv.x ) * 6.0, -1.0, 1.0 );
    float seam = exp( -pow( fract( uv.x * 34.0 + pinch * 3.0 ) - 0.5, 2.0 ) / 0.02 ) * carve;
    vec3  glow = mix( vec3( 0.90, 0.94, 1.0 ), vec3( 1.0, 0.95, 0.86 ), fract( hue * 0.159 ) );
    col += glow * seam * ( 0.03 + 0.12 * clamp( audioHigh * 2.0, 0.0, 1.0 ) );

    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
