#version 330 core
/*****************************************************************************\
 *                              Present.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Final present pass.
 *
 *  Two jobs:
 *
 *   1) A GLOBAL MOOD GRADE applied once to the finished frame, so EVERY effect
 *      (not just Tunnel/Kaleidoscope) reacts to the music's mood:
 *        audioValence  -> colour temperature + brightness (happy=warm/bright,
 *                         sad=bluish/darker; Palmer 2013 mapping canon)
 *        audioArousal  -> saturation (energetic=vivid, still=muted)
 *        audioCentroid -> minority share of the temperature (bright timbre)
 *        audioLevel    -> brightness (loudness)
 *        audioFlux     -> shimmer on spectral change
 *      The host feeds GATED values, so in non-music mode they sit at neutral
 *      (centroid/valence 0.5, level/flux 0) and the grade is a no-op.
 *   2) The photosensitivity brightness limit (uniform `scale`), applied last.
 *
 *  @author René Weller
 */
// Shader-storage blocks are a 4.3 feature; requesting the extension keeps this
// shader at 330 so it still links against the shared 330 fullscreen vertex
// shader that every other 2D pass uses.
#extension GL_ARB_shader_storage_buffer_object : require
out vec4 fragColor; ///< The pixel's colour (output).

/// GPU auto-exposure.  Blend/CfxHistogram.comp builds a luminance histogram of
/// the finished frame and writes the exposure its percentiles justify into this
/// buffer; reading it straight from the fragment shader avoids the GPU->CPU
/// readback the old mean-luminance path needed.  autoExposure <= 0 means the
/// compute path is unavailable, and the pass falls back to 1.0.
layout( std430, binding = 3 ) readonly buffer AutoExp
{
    float autoExposure;
    float lumaP50;
    float lumaP98;
    float limScale; ///< The photosensitivity limit (Engine/SafetyLimit.comp), 0..1; 0 = no limiter pass.
};
uniform sampler2D tex;        ///< The input picture.
uniform vec2      resolution; ///< Size of the render target in pixels.
uniform float     scale;      ///< Blackout, DJ-stop and fade dimming (and the limiter where limScale is 0), last.

uniform float     audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float     audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float     audioArousal;   ///< canon: arousal drives saturation
uniform float     audioLevel;     ///< Overall loudness, 0..1.
uniform float     audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float     audioChromaHue; ///< harmony → global hue shift (0 = neutral in non-music)
uniform float     audioBeat;      ///< beat → extra bloom on hits
uniform float     audioDownbeat;  ///< bigger accent on the bar's "1"
uniform float     audioOnset;     ///< full-spectrum onset (snares/claps/melodic) → cone pulse
uniform float     time;           ///< for the slow moving-head beam sweep
uniform float     audioChase;     ///< 0..1, glides 1/4 per onset (~200 ms) → corner-cone colour chase
uniform float     lightShow;      ///< 1 = stage lamps (cones/haze/mirror-ball/gobo) on, 0 = off
uniform float     audioSwell;     ///< slow loudness build (ambient dynamics) → glow breathing
uniform float     audioBarPhase;  ///< 0..1 position within the 4-beat bar → per-bar lamp sweep
uniform sampler2D bloomTex;       ///< 2-pass Gaussian bloom (quarter res), when useBloom = 1
uniform float     useBloom;       ///< 1 = bloomTex valid, 0 = fall back to the mip tap
uniform float     sharpen;        ///< CAS-style sharpen amount (host: >0 when renderScale < 1)
uniform vec2      srcTexel;       ///< 1 / render resolution (the sampled texture)
uniform float     camZoom;        ///< virtual camera: punch-in zoom (host keeps >= 1)
uniform float     camRot;         ///< virtual camera: small roll (radians)
uniform vec2      camOff;         ///< virtual camera: drift + shake offset (uv units)
uniform sampler2D titleTex;       ///< track-title reveal texture (transparent bg)
uniform float     titlePhase;     ///< 0..1 while the reveal runs; >= 1 = off
uniform float     titleAspect;    ///< title texture width/height
uniform int       titleStyle;     ///< reveal style 0..23 (host-rolled, mood-matched)
uniform float     titleSeed;      ///< per-reveal random seed
uniform int       stereoMode;     ///< 0 off, 1 side-by-side, 2 top-bottom, 3 anaglyph
uniform float     stereoDepth;    ///< disparity strength 0..2 (host, key c/m)
uniform int       stereoSource;   ///< 1 = source is ALREADY eye-packed (true 3D stereo)

// ---- Lyrics overlay (LRCLIB; key 'w': off / scroll / karaoke) ----
uniform sampler2D lyricsTex;     ///< tall texture of the lines (transparent background)
uniform float     lyricsAlpha;   ///< 0 = off (the host fades smoothly)
uniform float     lyricsScrollV; ///< the texture V that lies at the picture's centre
uniform float     lyricsAspect;  ///< texture width / height
uniform vec3      lyricsHl;      ///< karaoke: the active line v0, v1, the progress (v0<0 = off)
uniform float     lyricsUScale;  ///< nominal / actual texture width (<=1, see TrackMedia)
uniform vec2      lyricsFocusV;  ///< V band of the line being read (x<0 = none), both modes
uniform float     lyricsScrollU; ///< marquee offset (texture U) for the focused line

// ---- Artist picture overlay (Deezer; key 'o') ----
uniform sampler2D artistTex;    ///< Picture of the playing artist (overlay).
uniform float     artistAlpha;  ///< 0 = off (the host fades smoothly + rotates the pictures)
uniform float     artistAspect; ///< picture width / height

// ---- Time direction: frame-history ring (third resolution, last ~3 s) ----
uniform sampler2DArray histTex;    ///< unit 5 - ALWAYS a unit of its own (sampler type!)
uniform vec2           rewind;     ///< x = mix 0..1, y = ring layer (the past)
uniform vec2           echo;       ///< x = strength, y = ring layer (~1.4 s back)
uniform float          breath;     ///< build-up "hold your breath": desaturate / dim / vignette
uniform vec4           sceneGrade; ///< scene grade: x/z the look (0 off, 1 faded, 2 grey, 3 sepia) of the
                                   ///< outgoing / incoming scene, y/w its weight (the cross-fade included)
uniform float audioDrop;           ///< drop / slam pulse (streak boost, rewind seasoning)

// ---- Wave 2 ----
uniform float     letterbox;     ///< CinemaScope bars 0..1 (the drop tears them open)
uniform vec2      shock;         ///< bass shock wave: x = radius, y = amplitude
uniform float     lyricsLineAge; ///< seconds since the active karaoke line changed
uniform vec3      paletteA;      ///< cover palette: the dominant colour (lights)
uniform vec3      paletteB;      ///< the second colour (shadows)
uniform float     paletteAmt;    ///< 0 = neutral (no cover, or a colourless one)
uniform sampler2D sceneDepth;    ///< unit 6: depth of the ACTIVE scene (2.5D parallax)
uniform float     depthPar;      ///< parallax strength (the scene's slewed 3D-ness)
uniform vec2      nearFar2;      ///< clip planes for the linearisation

/**  Pseudo-random number 0..1 from a 2D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash21( vec2 p )
{
    return fract( sin( dot( p, vec2( 41.3, 289.1 ) ) ) * 43758.5453 );
}

/**  Hue rotation around the (1,1,1) luminance axis (Rodrigues), turns in [0,1].
 *
 * @param c      The colour. (in)
 * @param turns  The turn, 0..1. (in)
 *
 * @return
 *   The colour.
 **/
vec3 hueRotate( vec3 c, float turns )
{
    float a = turns * 6.28318530718;
    vec3  k = vec3( 0.57735026919 );
    float cs = cos( a ), sn = sin( a );
    return c * cs + cross( k, c ) * sn + k * dot( k, c ) * ( 1.0 - cs );
}

/**  2D rotation matrix.
 *
 * @param v  The vector. (in)
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The rotated vector.
 **/
vec2 rot2( vec2 v, float a )
{
    float c = cos( a ), s = sin( a );
    return mat2( c, -s, s, c ) * v;
}

// ---- Track-title reveal helpers ----
/**  Smooth 2D value noise, 0..1.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value.
 **/
float vnoise2( vec2 p )
{
    vec2 i = floor( p ), f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    float a = hash21( i ), b = hash21( i + vec2( 1.0, 0.0 ) );
    float cc = hash21( i + vec2( 0.0, 1.0 ) ), dd = hash21( i + vec2( 1.0, 1.0 ) );
    return mix( mix( a, b, f.x ), mix( cc, dd, f.x ), f.y );
}
/**  Coordinate in the title texture of a centred screen point.
 *
 * @param q  The centred point. (in)
 *
 * @return
 *   The coordinate.
 **/
vec2 titleUV( vec2 q )
{
    return vec2( q.x / 1.10, -q.y / ( 1.10 / titleAspect ) ) + 0.5;
}
/**  The title texture at a coordinate (transparent outside it).
 *
 * @param t  The coordinate. (in)
 *
 * @return
 *   The colour (RGBA).
 **/
vec4 titleTap( vec2 t )
{
    if ( t.x <= 0.0 || t.x >= 1.0 || t.y <= 0.0 || t.y >= 1.0 )
        return vec4( 0.0 );
    return texture( titleTex, t );
}

/**  A spotlight CONE emanating from `origin` along `dir`: brightest at the source, widening and fading along the
 * beam.
 *
 * @param p       The point. (in)
 * @param origin  Position of the lamp. (in)
 * @param dir     Direction of the beam (unit length). (in)
 * @param spread  Widening of the beam. (in)
 * @param reach   Length of the beam. (in)
 *
 * @return
 *   The light, 0..1.
 *
 * Returns 0..1.
 **/
float coneLight( vec2 p, vec2 origin, vec2 dir, float spread, float reach )
{
    vec2  v = p - origin;
    float t = dot( v, dir ); // distance along the beam
    if ( t < 0.0 )
        return 0.0;                           // behind the lamp
    float perp = length( v - t * dir );       // distance from the beam axis
    float half_width = spread * ( t + 0.04 ); // cone widens with distance
    float across = clamp( 1.0 - perp / half_width, 0.0, 1.0 );
    across = across * across; // soft edges
    float along = exp( -t / reach ) * ( 0.35 + 0.65 * clamp( 1.0 - t * 0.3, 0.0, 1.0 ) );
    return across * along;
}

/**  Pseudo-depth for the stereoscopic reprojection: smoothed brightness (the blurred bloom buffer doubles as a depth
 * cue) pops bright structures toward the viewer; the radial term sinks the tunnel centre behind the screen.
 *
 * @param puv  Coordinate in the frame. (in)
 * @param cuv  Centred coordinate. (in)
 *
 * @return
 *   The depth, 0..1.
 **/
float stereoDepthAt( vec2 puv, vec2 cuv )
{
    float bl = ( useBloom > 0.5 )
                   ? dot( texture( bloomTex, puv ).rgb, vec3( 0.299, 0.587, 0.114 ) )
                   : dot( texture( tex, puv, 4.0 ).rgb, vec3( 0.299, 0.587, 0.114 ) );
    return clamp( bl * 1.4, 0.0, 1.0 ) * 0.7
           + clamp( length( cuv ) * 1.5, 0.0, 1.0 ) * 0.3;
}

/**  Scene grade looks: 1 faded (most colour gone, blacks lifted like old print), 2 grey (a cool black-and-white), 3
 * sepia (warm brown toning).
 *
 * @param c     The colour. (in)
 * @param mode  The look: 0 none, 1 faded, 2 grey, 3 sepia. (in)
 *
 * @return
 *   The graded colour.
 **/
vec3 sceneGradeCol( vec3 c, float mode )
{
    float y = dot( c, vec3( 0.299, 0.587, 0.114 ) );
    if ( mode < 0.5 )
        return c;
    if ( mode < 1.5 )
        return mix( vec3( y ), c, 0.3 ) * 0.9 + 0.035;
    if ( mode < 2.5 )
        return vec3( y ) * vec3( 0.96, 1.0, 1.05 );
    return vec3( y ) * vec3( 1.08, 0.94, 0.74 ) + vec3( 0.025, 0.012, 0.0 );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;

    // Stereoscopic split: each half shows the FULL logical frame for one eye
    // (side-by-side "half" / top-bottom — the display or HMD player
    // unsqueezes them, so every uv-based computation below stays correct).
    float eye_sign = 0.0; // -1 left eye, +1 right eye
    if ( stereoMode == 1 )
    {
        eye_sign = ( uv.x < 0.5 ) ? -1.0 : 1.0;
        uv.x = fract( uv.x * 2.0 );
    }
    else if ( stereoMode == 2 )
    {
        eye_sign = ( uv.y >= 0.5 ) ? -1.0 : 1.0; // top half = left eye
        uv.y = fract( uv.y * 2.0 );
    }

    // Subtle whole-scene beat pulse: a gentle zoom "breath" on each beat (a little
    // bigger on the downbeat).  It's motion, not a flash, and uses the already
    // slew-limited beat, so it reads as a soft pump rather than a strobe - easy on
    // the eyes.  Sampled from puv; the corner lights below keep the un-zoomed uv.
    // Damped (was unclamped up to 1.0 -> a 4% zoom pulse on EVERY beat):
    // user feedback, the reaction to the beat was too present overall.
    float scene_pulse = clamp( audioBeat + 0.4 * audioDownbeat, 0.0, 1.0 ) * 0.6;
    // Virtual camera: aspect-true roll + punch-in zoom + drift/shake offset,
    // combined with the beat "breath".  The host guarantees the zoom covers
    // the offset + rotation, so no edge ever samples outside the frame
    // (camZoom defaults to 0 when unset -> the max() keeps it a no-op).
    float aspect2 = resolution.x / resolution.y;
    vec2  cuv = uv - 0.5;
    cuv.x *= aspect2;
    cuv = rot2( cuv, camRot );
    cuv.x /= aspect2;
    float camz = ( 1.0 + 0.040 * scene_pulse ) * max( camZoom, 1.0 );
    vec2  puv = cuv / camz + 0.5 - camOff;

    // --- 2.5D parallax: the camera drift moves NEAR structures up to 1.8x
    // more than the frame itself (depth of the active 3D scene, linearised).
    // A 2D scene has its depth cleared to far -> nearness 0 -> neutral.  The
    // host covers the extra offset in the zoom.
    if ( depthPar > 0.001 )
    {
        float zr = texture( sceneDepth, clamp( puv, 0.0, 1.0 ) ).r;
        float lin = nearFar2.x * nearFar2.y
                    / max( nearFar2.y - zr * ( nearFar2.y - nearFar2.x ), 1e-4 );
        float nearness = 1.0 - clamp( ( lin - nearFar2.x ) / ( nearFar2.y - nearFar2.x ), 0.0, 1.0 );
        puv -= camOff * ( 1.8 * nearness * depthPar );
    }

    // --- Bass shock wave: an expanding ring of distortion from the centre
    // (small on a kick, large on a drop).  Pure displacement - no brightness.
    if ( shock.y > 0.0005 )
    {
        vec2 sd = puv - 0.5;
        sd.x *= aspect2;
        float rr = length( sd );
        float wave = exp( -abs( rr - shock.x ) * 14.0 ) * shock.y;
        vec2  dir = ( rr > 1e-4 ) ? sd / rr : vec2( 0.0 );
        dir.x /= aspect2;
        puv += dir * wave;
    }

    // Stereoscopic reprojection: shift the sampling per eye by the local
    // pseudo-depth (crossed disparity -> bright structures float in front of
    // the screen, the tunnel centre recedes).  Anaglyph packs both eyes into
    // one frame: red = left eye, green/blue = right eye.
    vec3 c;
    if ( stereoMode == 1 || stereoMode == 2 )
    {
        if ( stereoSource == 1 )
        {
            // TRUE stereo: the 3D scene already rendered one view per half —
            // just sample the matching half (no reprojection).
            if ( stereoMode == 1 )
                puv = vec2( puv.x * 0.5 + ( ( eye_sign > 0.0 ) ? 0.5 : 0.0 ), puv.y );
            else // top half = left eye
                puv = vec2( puv.x, puv.y * 0.5 + ( ( eye_sign < 0.0 ) ? 0.5 : 0.0 ) );
        }
        else
            puv.x += stereoDepth * 0.007
                     * ( stereoDepthAt( puv, cuv ) - 0.45 ) * eye_sign;
        c = texture( tex, puv ).rgb;
    }
    else if ( stereoMode == 3 )
    {
        float disp = stereoDepth * 0.006 * ( stereoDepthAt( puv, cuv ) - 0.45 );
        vec3  cl = texture( tex, puv + vec2( -disp, 0.0 ) ).rgb; // left eye
        vec3  cr = texture( tex, puv + vec2( disp, 0.0 ) ).rgb;  // right eye
        c = vec3( cl.r, cr.g, cr.b );
    }
    else
        c = texture( tex, puv ).rgb;

    // --- Drop rewind / break scrub: instead of the live picture a frame from
    // the history ring plays - with a VHS seasoning (line jitter, chroma
    // offset, scanlines) that makes the "tape rewinding" readable at once and
    // hides the ring's third resolution on the side.  All of it BEFORE the
    // grade, so that the mood colours and the limiter keep working as usual.
    if ( rewind.x > 0.001 )
    {
        vec2  ruv = puv;
        float ln = floor( ruv.y * 240.0 );
        ruv.x += ( hash21( vec2( ln, floor( time * 27.0 ) ) ) - 0.5 ) * 0.007 * rewind.x;
        vec3 hc;
        hc.g = texture( histTex, vec3( ruv, rewind.y ) ).g;
        hc.r = texture( histTex, vec3( ruv + vec2( 0.0016, 0.0 ), rewind.y ) ).r;
        hc.b = texture( histTex, vec3( ruv - vec2( 0.0016, 0.0 ), rewind.y ) ).b;
        hc *= 0.90 + 0.10 * sin( ruv.y * resolution.y * 3.14159 ); // scanlines
        hc += ( hash21( gl_FragCoord.xy + fract( time * 17.0 ) * 61.0 ) - 0.5 )
              * 0.05; // tape noise
        c = mix( c, hc, rewind.x );
    }

    // --- Time echo: the scene of ~1.4 s ago as a ghost layer (screen blend,
    // scaled slightly larger -> it visibly comes apart from the live picture).
    // Dreams in ambient passages and flashes up as a flashback after a drop.
    if ( echo.x > 0.001 )
    {
        vec2 euv = ( puv - 0.5 ) / 1.045 + 0.5;
        vec3 g = texture( histTex, vec3( euv, echo.y ) ).rgb;
        c = 1.0 - ( 1.0 - c ) * ( 1.0 - g * echo.x );
    }

    // CAS-style sharpening: when the internal render scale is below 1 the
    // frame is upsampled here — a neighbourhood-clamped unsharp mask (no
    // halos) restores the crispness the downscale cost.  sharpen = 0 → off.
    if ( sharpen > 0.001 && stereoMode != 3 ) // CAS would fringe the anaglyph
    {
        vec3 n = texture( tex, puv + vec2( 0.0, srcTexel.y ) ).rgb;
        vec3 s = texture( tex, puv - vec2( 0.0, srcTexel.y ) ).rgb;
        vec3 e = texture( tex, puv + vec2( srcTexel.x, 0.0 ) ).rgb;
        vec3 w = texture( tex, puv - vec2( srcTexel.x, 0.0 ) ).rgb;
        vec3 mn = min( min( min( n, s ), min( e, w ) ), c );
        vec3 mx = max( max( max( n, s ), max( e, w ) ), c );
        c = clamp( c + ( 4.0 * c - ( n + s + e + w ) ) * sharpen, mn, mx );
    }

    // Mood grade along the empirically grounded mapping canon (Palmer 2013,
    // Valdez & Mehrabian 1994): VALENCE carries colour temperature and
    // brightness -- happy/major music is associated with warm, bright colour,
    // sad/minor with bluish, darker, muted colour, and the association is
    // emotion-mediated at r~0.99 across cultures. AROUSAL carries saturation
    // ("arousal goes above all with saturation"). The previous grade had the two
    // swapped (centroid on temperature, valence on saturation), which never
    // showed because valence was a near-constant until the axes were rebuilt.
    // Timbre keeps a minority say in temperature: bright timbre = warm light
    // is a separately evidenced crossmodal link.
    // LUMINANCE-NORMALISED tint vectors (each has Rec.601 weight 1.0). The
    // original pair carried luma 0.84 (cool) and 1.13 (warm), so the
    // temperature ramp silently brightened warm frames by 13% -- measured
    // across all 528 scenes it lifted the catalogue's median luma by 0.08 and
    // pushed 15 already-bright scenes over the 0.72 white-out line, because
    // the auto-exposure bottoms out at 0.72x and has no headroom left there.
    // Temperature must be chroma only; brightness belongs to the exposure
    // chain and the small explicit valence term below.
    // cool = 2*(1,1,1) - warm: luma is linear, so this makes BOTH vectors
    // luma-1 AND their midpoint exactly white -- temp 0.5 is a true no-op.
    vec3  cool = vec3( 0.806, 1.027, 1.381 );
    vec3  warm = vec3( 1.194, 0.973, 0.619 );
    float temp = clamp( 0.65 * audioValence + 0.35 * audioCentroid, 0.0, 1.0 );
    c *= mix( cool, warm, temp );

    // Valence → brightness, deliberately subtle (max ±8%): the photosensitivity
    // pass owns hard brightness dynamics; this is a slow mood tint, not a flash.
    c *= 1.0 + ( audioValence - 0.5 ) * 0.16;

    // Harmony → hue shift (the song's key/chords tint the whole palette).
    c = hueRotate( c, audioChromaHue * 0.18 );

    // Saturation from arousal (centred so 0.5 ≈ neutral): energetic music
    // saturates, still music mutes. The original 0.45..1.55 range halved the
    // catalogue's measured saturation under low-arousal material -- calm music
    // deserves muted colour, not near-greyscale. 0.75..1.25 keeps the canon
    // direction at half the violence; the Mood knob still scales the swing.
    float lum = dot( c, vec3( 0.299, 0.587, 0.114 ) );
    c = mix( vec3( lum ), c, 0.75 + 0.50 * audioArousal );

    // Tone-down: the source frames are often very bright/pale, washing the whole
    // image out.  Cut the exposure and deepen the mid-tones for richer colour
    // (most effective on the near-white areas).
    c = pow( max( c, 0.0 ) * 0.78, vec3( 1.25 ) );

    // --- Cover palette: the grading pulls gently toward the colours of the
    // artist picture's cover (a duotone from the luminance: shadows -> second
    // colour, lights -> main colour).  Deliberately subtle (at most ~20%) and
    // faded in very slowly - every song gets "its" colours.
    if ( paletteAmt > 0.001 )
    {
        float lp = dot( c, vec3( 0.299, 0.587, 0.114 ) );
        vec3  duo = mix( paletteB, paletteA, smoothstep( 0.10, 0.85, lp ) ) * lp * 1.6;
        c = mix( c, duo, 0.20 * paletteAmt );
    }

    // Loudness → brightness, spectral flux → shimmer (kept small so already-bright
    // content does not blow out).  A gentle brightness lift on the beat (with the
    // zoom above = subtle whole-scene pump), and the slow SWELL lets ambient
    // builds visibly brighten and fade-outs breathe back down.
    c *= ( 1.0 + 0.12 * audioLevel + 0.06 * audioFlux + 0.10 * scene_pulse
           + 0.08 * audioSwell );

    // Bloom / glow.  Preferred: the real two-pass Gaussian (bloomTex, quarter res,
    // bright-passed) — a proper soft halo.  Fallback: the old single mip tap.
    // The swell breathes the glow (ambient builds bloom up majestically).
    vec3 bloom;
    if ( useBloom > 0.5 )
        bloom = texture( bloomTex, puv ).rgb;
    else
        bloom = max( texture( tex, puv, 4.5 ).rgb - 0.75, 0.0 );
    c += bloom * ( 0.12 + 0.05 * audioBeat + 0.10 * audioSwell );

    // --- Cinema camera: anamorphic streaks + halation -----------------------
    // Streaks: the bright peaks of the (already bright-passed) bloom buffer
    // drawn out far horizontally and tinted cool - the anamorphic look.
    // Breathes with the swell and shoots up on drops.
    if ( useBloom > 0.5 )
    {
        vec3  streak = vec3( 0.0 );
        float wsum = 0.0;
        for ( int i = 1; i <= 6; ++i )
        {
            float o = float( i ) * 0.020;
            float w = exp( -float( i ) * 0.55 );
            streak += ( texture( bloomTex, puv + vec2( o, 0.0 ) ).rgb
                        + texture( bloomTex, puv - vec2( o, 0.0 ) ).rgb )
                      * w;
            wsum += 2.0 * w;
        }
        streak /= wsum;
        float streak_w = 0.10 + 0.30 * audioSwell + 0.80 * audioDrop;
        c += streak * vec3( 0.55, 0.75, 1.30 ) * 0.30 * streak_w;
    }
    // Halation: a warm film glow around the lights (a wide mip tap of the
    // frame, tinted warm) - gives highlights the "photo emulsion" melt.
    {
        vec3 hal = max( texture( tex, puv, 5.0 ).rgb - 0.55, 0.0 );
        c += hal * vec3( 1.15, 0.72, 0.42 ) * 0.14;
    }

    // Soft highlight knee: compress values above ~0.8 toward white instead of
    // hard-clipping the whole frame to flat white when the grade pushes it high.
    c = c / ( 1.0 + max( c - 0.8, 0.0 ) );

    // --- Scene grade: a colourful scene in a dark preset (Noir) is shown
    // faded, grey or in sepia (the preset attribute grade="...").  The weights
    // follow the scene cross-fade, so the look fades along with it.
    if ( sceneGrade.y + sceneGrade.w > 0.001 )
    {
        c = mix( c, sceneGradeCol( c, sceneGrade.x ), sceneGrade.y );
        c = mix( c, sceneGradeCol( c, sceneGrade.z ), sceneGrade.w );
    }

    // --- Build-up "hold your breath": in the last bars before the drop the
    // picture takes back colour and light together and the vignette closes
    // in - the tension before the blow.  The drop itself releases it with
    // punch/shake/streaks.  breath is slewed (no pumping).
    if ( breath > 0.001 )
    {
        float lb = dot( c, vec3( 0.299, 0.587, 0.114 ) );
        c = mix( c, vec3( lb ), 0.38 * breath ); // desaturate
        c *= 1.0 - 0.13 * breath;                // dim slightly
        float vg = length( vec2( ( uv.x - 0.5 ) * ( resolution.x / resolution.y ),
                                 uv.y - 0.5 ) );
        c *= 1.0 - 0.50 * breath * smoothstep( 0.34, 0.72, vg );
    }

    // --- Corner spotlights (cones) ----------------------------------------------
    // Four stage-light CONES shining from the corners toward the centre, flashing
    // IN TIME with the beat (extra punch on the downbeat), coloured by the mood
    // with a slightly different hue per corner.  Directional, so they read clearly
    // as spotlights yet stay eye-friendly.  audioBeat / audioDownbeat are music-
    // gated upstream, so on speech / silence the lamps stay dark.
    // Optional (key 'l'); off by default so the scene beat pulse can stand alone.
    if ( lightShow > 0.5 )
    {
        float aspect = resolution.x / resolution.y;
        vec2  q = vec2( uv.x * aspect, uv.y );
        vec2  ctr = vec2( aspect * 0.5, 0.5 );

        // Vivid mood colour (centroid temperature, valence saturation).
        vec3  mood_col = mix( vec3( 0.25, 0.55, 1.0 ), vec3( 1.0, 0.55, 0.20 ), audioCentroid );
        float sl = dot( mood_col, vec3( 0.299, 0.587, 0.114 ) );
        mood_col = mix( vec3( sl ), mood_col, 0.75 + 0.5 * audioValence );

        // Beat/onset pulse with a modest always-on base.
        float pulse = clamp( 0.16 + 1.0 * audioBeat + 0.6 * audioDownbeat
                                 + 0.7 * audioOnset,
                             0.0, 1.0 );
        float spread = 0.52; // cone half-width factor (thick beams)
        float reach = 0.38;  // short, so the thick cones stay in the corner regions

        vec2 c0 = vec2( 0.0, 0.0 );
        vec2 c1 = vec2( aspect, 0.0 );
        vec2 c2 = vec2( 0.0, 1.0 );
        vec2 c3 = vec2( aspect, 1.0 );

        // Moving-head sweep, synced to the BAR (one full sweep per 4 beats, via
        // audioBarPhase) with phase offsets per corner; a slow time drift keeps
        // the heads alive when no tempo is running.  Wider sweep when loud.
        float sw_amp = 0.55 + 0.35 * audioLevel;
        float sw_ph = 6.2831 * audioBarPhase + time * 0.10;
        vec2  d0 = rot2( normalize( ctr - c0 ), sw_amp * sin( sw_ph + 0.0 ) );
        vec2  d1 = rot2( normalize( ctr - c1 ), sw_amp * sin( sw_ph + 1.7 ) );
        vec2  d2 = rot2( normalize( ctr - c2 ), sw_amp * sin( sw_ph + 3.3 ) );
        vec2  d3 = rot2( normalize( ctr - c3 ), sw_amp * sin( sw_ph + 5.0 ) );

        // Colour CHASE: emphasis cycles through the corners (audioChase glides 1/4
        // on each onset).  Non-active corners keep a 0.45 base so all stay alive.
        float cw0 = 0.45 + 0.55 * ( 1.0 - smoothstep( 0.0, 0.25, abs( fract( audioChase - 0.00 + 0.5 ) - 0.5 ) ) );
        float cw1 = 0.45 + 0.55 * ( 1.0 - smoothstep( 0.0, 0.25, abs( fract( audioChase - 0.25 + 0.5 ) - 0.5 ) ) );
        float cw2 = 0.45 + 0.55 * ( 1.0 - smoothstep( 0.0, 0.25, abs( fract( audioChase - 0.50 + 0.5 ) - 0.5 ) ) );
        float cw3 = 0.45 + 0.55 * ( 1.0 - smoothstep( 0.0, 0.25, abs( fract( audioChase - 0.75 + 0.5 ) - 0.5 ) ) );
        float p0 = pulse * cw0, p1 = pulse * cw1, p2 = pulse * cw2, p3 = pulse * cw3;

        vec3 col0 = hueRotate( mood_col, audioChromaHue + 0.00 ) * 1.5;
        vec3 col1 = hueRotate( mood_col, audioChromaHue + 0.12 ) * 1.5;
        vec3 col2 = hueRotate( mood_col, audioChromaHue + 0.25 ) * 1.5;
        vec3 col3 = hueRotate( mood_col, audioChromaHue + 0.37 ) * 1.5;

        // Core cone tint (visible over any content).
        c = mix( c, col0, clamp( coneLight( q, c0, d0, spread, reach ) * p0, 0.0, 0.88 ) );
        c = mix( c, col1, clamp( coneLight( q, c1, d1, spread, reach ) * p1, 0.0, 0.88 ) );
        c = mix( c, col2, clamp( coneLight( q, c2, d2, spread, reach ) * p2, 0.0, 0.88 ) );
        c = mix( c, col3, clamp( coneLight( q, c3, d3, spread, reach ) * p3, 0.0, 0.88 ) );

        // Volumetric HAZE: a wide, soft additive glow around each beam, as if the
        // light scatters in stage fog (makes the beams look 3-D).
        float hz = 0.14;
        c += col0 * coneLight( q, c0, d0, spread * 1.7, reach * 1.6 ) * p0 * hz;
        c += col1 * coneLight( q, c1, d1, spread * 1.7, reach * 1.6 ) * p1 * hz;
        c += col2 * coneLight( q, c2, d2, spread * 1.7, reach * 1.6 ) * p2 * hz;
        c += col3 * coneLight( q, c3, d3, spread * 1.7, reach * 1.6 ) * p3 * hz;

        // MIRROR-BALL speckle: a slowly rotating field of soft twinkling light dots
        // (disco-ball), music-gated so it fades in with the music.
        vec2 mb = rot2( uv - 0.5, time * 0.06 );
        vec2 cell = mb * vec2( 16.0, 9.0 );
        vec2 idc = floor( cell );
        // Each dot sits off its cell's centre by up to 0.2 cell and has its own size (a ball's facets are not a
        // grid); offset plus radius stay within half a cell, so no dot is cut at a cell edge.
        vec2  fc = fract( cell ) - 0.5
                   - 0.4 * ( vec2( hash21( idc + 17.3 ), hash21( idc + 41.9 ) ) - 0.5 );
        float dot_r = 0.20 + 0.10 * hash21( idc + 73.1 );
        float dotm = smoothstep( dot_r, 0.0, length( fc ) ) * step( 0.62, hash21( idc ) );
        float tw = 0.5 + 0.5 * sin( time * 2.5 + hash21( idc ) * 31.0 );
        c += hueRotate( vec3( 0.85, 0.85, 0.95 ), audioChromaHue + 0.5 )
             * dotm * tw * 0.12 * ( 0.2 + 0.8 * audioLevel );

        // GOBO: a slowly rotating fan of light rays from the centre (gobo wheel),
        // fading in toward the edges so it never washes the middle.
        vec2  g = q - ctr;
        float ang = atan( g.y, g.x ) + time * 0.12;
        float rays = pow( 0.5 + 0.5 * cos( ang * 9.0 ), 6.0 );
        c += hueRotate( mood_col, audioChromaHue + 0.6 ) * 1.3
             * rays * 0.08 * ( 0.2 + 0.8 * audioLevel ) * smoothstep( 0.05, 0.45, length( g ) );
    }

    // --- Artist picture: melted organically into the lower left corner.  A
    // feathered edge, frayed irregularly by noise, + a soft blend (mix + a
    // gentle screen) instead of a hard picture frame; a slight wobble on the
    // audio phase lets it breathe with the scene.  Composited before the
    // title/limiter, so that blackout & co. act on it too.
    if ( artistAlpha > 0.001 )
    {
        float w_u = 0.26; // 26% of the picture's width
        float h_u = w_u * ( resolution.x / resolution.y ) / max( artistAspect, 0.2 );
        vec2  m0 = vec2( 0.035, 0.045 ); // lower left corner
        vec2  a = ( uv - m0 ) / vec2( w_u, h_u );
        if ( a.x > -0.2 && a.x < 1.2 && a.y > -0.2 && a.y < 1.2 )
        {
            // Breathing: a small, slow deformation (time-based, flicker-free).
            vec2 warp = vec2( sin( time * 0.37 + a.y * 5.0 ),
                              cos( time * 0.31 + a.x * 4.0 ) )
                        * 0.012;
            vec2 av = clamp( a + warp, 0.0, 1.0 );
            vec3 img = texture( artistTex, vec2( av.x, 1.0 - av.y ) ).rgb;

            float feather = smoothstep( 0.0, 0.16, a.x ) * smoothstep( 0.0, 0.16, a.y )
                            * smoothstep( 0.0, 0.16, 1.0 - a.x )
                            * smoothstep( 0.0, 0.16, 1.0 - a.y );
            // An organic frayed edge instead of a clean one.
            feather *= 0.62 + 0.38 * vnoise2( a * 6.0 + vec2( time * 0.05, 0.0 ) );

            float aa = feather * artistAlpha;
            c = mix( c, img, aa * 0.78 );
            c += img * img * aa * 0.22; // a gentle screen share
        }
    }

    // --- Lyrics: a credits scroll across the middle of the picture, or
    // karaoke with a golden line highlight and a progress sweep.  The host
    // places the V window (the scroll follows the playback position; karaoke
    // centres the active line).
    if ( lyricsAlpha > 0.001 )
    {
        float u = ( uv.x - 0.5 ) / 0.62 + 0.5; // text band: 62% of the width
        // Visible V per screen UV (the texture keeps its pixel aspect ratio).
        float v_span = ( resolution.y / resolution.x ) * lyricsAspect / 0.62;
        float v = lyricsScrollV + ( 0.5 - uv.y ) * v_span;
        if ( u > 0.0 && u < 1.0 && v > 0.0 && v < 1.0 )
        {
            // Kinetics (optional, Shift+W - OFF by default: user feedback, the
            // original 1.5x slam jumped too much): the fresh active line now only
            // grows gently (1.18x -> 1.0 in 0.35 s, ease-out) instead of
            // "jumping".  With kinetics switched off lyricsLineAge always stays
            // 999 (see glwidget.cpp) -> this block then has no effect at all.
            float u2 = u, v2 = v, slam_glow = 0.0;
            if ( lyricsHl.x >= 0.0 && lyricsLineAge < 0.35 )
            {
                float rem = 1.0 - lyricsLineAge / 0.35;
                float sl = 1.0 + 0.18 * rem * rem;
                float vc = 0.5 * ( lyricsHl.x + lyricsHl.y );
                float v_s = ( v - vc ) / sl + vc;
                float u_s = ( u - 0.5 ) / sl + 0.5;
                if ( v_s >= lyricsHl.x && v_s <= lyricsHl.y )
                {
                    u2 = u_s;
                    v2 = v_s;
                    slam_glow = rem;
                }
            }
            // Physical texture U (may be wider than the nominal window when a
            // line did not fit the text band, see TrackMedia) -- lyricsUScale
            // scales back so that no line visibly shrinks because of it; only
            // inside the band of the line being read (host, both modes) the
            // slow marquee offset is added instead of cutting the line off.
            float u_phys = u2 * lyricsUScale;
            if ( lyricsFocusV.x >= 0.0 && v2 >= lyricsFocusV.x && v2 <= lyricsFocusV.y )
                u_phys += lyricsScrollU;
            vec4 lt = texture( lyricsTex, vec2( clamp( u_phys, 0.0, 1.0 ), v2 ) );
            // Soft edges at the top and bottom (the credits window).
            float edge = smoothstep( 0.04, 0.22, uv.y ) * smoothstep( 0.96, 0.78, uv.y );
            float a = lt.a * lyricsAlpha * edge;

            vec3 col = lt.rgb;
            if ( lyricsHl.x >= 0.0 )
            {
                // Karaoke: the active line golden + a sweep, the other lines subdued.
                if ( v2 >= lyricsHl.x && v2 <= lyricsHl.y )
                {
                    float sweep = smoothstep( lyricsHl.z + 0.02, lyricsHl.z - 0.02, u2 );
                    vec3  gold = col * vec3( 1.0, 0.86, 0.42 );
                    col = mix( col, gold, 0.35 + 0.65 * sweep );
                    c += gold * a * 0.25 * ( 0.5 + 0.5 * audioBeat );
                    c += gold * a * 0.18 * slam_glow; // a subtle flash
                }
                else
                    a *= 0.45; // context lines more subdued
            }
            c = mix( c, col, a * 0.95 );
        }
    }

    // --- Track-title reveal: 30 distinct entrance styles (host-rolled per
    // reveal, matched to the music's mood — calm gets soft dissolves and
    // drifts, aggressive gets glitch/slam, bright gets light sweeps, dark
    // gets smoke).  All entrances use an ease-out cubic so the motion
    // settles organically instead of snapping; the shared ending grows the
    // text gently toward the viewer while it fades.  Composited BEFORE the
    // safety scale so the limiter (and blackout) applies to it too.
    if ( titlePhase < 1.0 )
    {
        float ph = titlePhase;
        float fade_in = smoothstep( 0.00, 0.08, ph );
        float outp = smoothstep( 0.74, 0.97, ph );
        float e = smoothstep( 0.03, 0.42, ph );
        e = 1.0 - pow( 1.0 - e, 3.0 ); // ease-out cubic entrance
        float d = 1.0 - e;             // "derangement" remaining
        float sd = titleSeed * 37.0;
        int   st = titleStyle;

        vec2 tp = uv - vec2( 0.5, 0.52 );
        tp.x *= resolution.x / resolution.y;

        vec2  tq = tp;
        float blur_a = 0.0;
        vec2  split = vec2( 0.0 );
        float mask_a = 1.0;
        float glow_x = 0.0;

        // ---- Spatial entrances ----
        if ( st == 1 )
            tq.y += 0.14 * d * d; // gentle drift-in
        else if ( st == 2 )
            blur_a = 0.012 * d; // focus pull
        else if ( st == 6 )
        { // kaleido unwind
            float ang = atan( tp.y, tp.x );
            float rad = length( tp );
            float seg = 1.0471976;
            float ka = abs( mod( ang + 3.14159265, 2.0 * seg ) - seg );
            float aa = mix( ang, ka, d * 0.85 );
            aa += d * 2.4 * ( 0.55 - min( rad, 0.55 ) );
            tq = vec2( cos( aa ), sin( aa ) ) * rad;
        }
        else if ( st == 7 )
            tq /= 1.0 + 2.5 * d * d; // zoom-through (huge -> place)
        else if ( st == 8 )
        {
            tq *= 1.0 + 1.6 * d * d;
            blur_a = 0.006 * d;
        } // rises from depth
        else if ( st == 9 )
            tq.y += sin( tq.x * 16.0 + ph * 22.0 ) * 0.055 * d; // water ripple
        else if ( st == 10 )
            split = vec2( 0.10, 0.04 ) * d; // chromatic assemble
        else if ( st == 11 )
        { // glitch slam
            float row = floor( ( tq.y + 2.0 ) * 22.0 );
            tq.x += ( hash21( vec2( row, sd ) ) - 0.5 ) * 0.5 * d * d;
            split = vec2( 0.03, 0.0 ) * d;
        }
        else if ( st == 12 )
        {
            float eq = floor( e * 5.0 ) / 5.0; // stutter zoom
            tq *= 1.0 + 1.6 * ( 1.0 - eq );
        }
        else if ( st == 13 )
        { // shockwave ring
            float r = length( tq );
            float ring = exp( -abs( r - e * 1.2 ) * 9.0 );
            tq += ( tq / max( r, 1e-3 ) ) * ring * 0.10 * d;
            glow_x = ring * 0.5 * d;
        }
        else if ( st == 14 )
            tq = rot2( tq, 0.5 * d * d * ( titleSeed > 0.5 ? 1.0 : -1.0 ) ); // spin-in
        else if ( st == 15 )
            tq.x += sign( tp.x ) * 0.5 * d * d; // doors slide together
        else if ( st == 16 )
        { // drop with soft overshoot
            float b = e - 1.0;
            float back = 1.0 + 2.7 * b * b * b + 1.7 * b * b;
            tq.y += 0.5 * ( 1.0 - back );
        }
        else if ( st == 17 )
        { // smoke condense
            vec2 w = vec2( vnoise2( tq * 5.0 + sd ),
                           vnoise2( tq * 5.0 + sd + 9.7 ) )
                     - 0.5;
            tq += w * 0.30 * d;
            blur_a = 0.006 * d;
        }
        else if ( st == 20 )
            tq += vec2( sin( tq.y * 55.0 + ph * 38.0 ), // heat shimmer
                        cos( tq.x * 50.0 + ph * 33.0 ) )
                  * 0.009 * d;
        else if ( st == 21 )
        {
            float q = 0.004 + 0.10 * d * d; // pixelate-in
            tq = ( floor( tq / q ) + 0.5 ) * q;
        }
        else if ( st == 23 )
            tq.y += sin( tq.x * 9.0 - ph * 16.0 ) // flag wave settles
                    * 0.06 * d * ( 0.65 + 0.35 * sin( sd ) );
        else if ( st == 25 )
        { // vinyl spin-in
            float dir = ( titleSeed > 0.5 ) ? 1.0 : -1.0;
            tq = rot2( tq, d * d * 6.2831853 * dir ) * ( 1.0 + 2.0 * d * d );
        }
        else if ( st == 27 )
        { // shatter converge
            vec2 cell = floor( tq * 6.0 + 3.0 );
            vec2 rnd = vec2( hash21( cell + sd ), hash21( cell + sd + 11.3 ) ) - 0.5;
            tq += rnd * 0.7 * d * d;
        }
        // (st 0/3/4/5/18/19/22/24/26/28/29: no spatial change; masks/sampling below.)

        // Shared tasteful ending: grow gently toward the viewer while fading.
        tq /= 1.0 + 0.55 * outp;

        vec2 tuv = titleUV( tq );

        // ---- Mask-based entrances (need text-space coordinates) ----
        if ( st == 3 )
            mask_a = smoothstep( 0.10, -0.02, tuv.x - e * 1.15 ); // soft L->R wipe
        else if ( st == 4 )
            mask_a = smoothstep( 0.06, -0.06, length( tq ) - e * 1.05 ); // iris
        else if ( st == 5 )
        {
            float band = abs( fract( tuv.y * 4.0 ) - 0.5 ) * 2.0; // soft blinds
            mask_a = smoothstep( band - 0.25, band + 0.05, e * 1.25 );
        }
        else if ( st == 18 )
        {
            float g = hash21( floor( tuv * vec2( 140.0, 36.0 ) ) + sd ); // sparkle dissolve
            mask_a = smoothstep( d - 0.08, d + 0.08, g );
            glow_x = exp( -abs( g - d ) * 30.0 ) * 0.8 * d;
        }
        else if ( st == 19 )
        {
            float sw = tuv.x + tuv.y * 0.25 - ( e * 1.6 - 0.25 ); // light sweep
            mask_a = smoothstep( 0.05, -0.10, sw );
            glow_x = exp( -abs( sw ) * 18.0 ) * 0.9;
        }
        else if ( st == 24 )
        {
            float band = abs( tuv.y - 0.5 ) * 2.0; // vertical curtain
            mask_a = smoothstep( band - 0.06, band + 0.06, e * 1.15 );
        }
        else if ( st == 26 )
        {
            float cell_x = floor( tuv.x * 34.0 ) / 34.0; // typewriter
            mask_a = step( cell_x, e * 1.06 );
        }
        else if ( st == 28 )
        {
            float band = abs( fract( ( tuv.x + tuv.y ) * 3.0 ) - 0.5 ) * 2.0; // diagonal blinds
            mask_a = smoothstep( band - 0.25, band + 0.05, e * 1.25 );
        }
        else if ( st == 29 )
        {
            float g = hash21( floor( tuv * vec2( 46.0, 12.0 ) ) + sd ); // magnetic snap
            mask_a = smoothstep( d - 0.10, d + 0.10, g );
            glow_x = exp( -abs( g - d ) * 22.0 ) * 0.7 * d;
        }

        // ---- Sample: plain / blurred / echo ghosts / RGB split ----
        vec4 tt;
        if ( st == 22 )
        { // echo converge
            vec2 o = vec2( 0.10, 0.035 ) * d;
            tt = titleTap( tuv ) * 0.5 + titleTap( tuv + o ) * 0.25
                 + titleTap( tuv - o ) * 0.25;
        }
        else if ( blur_a > 0.0001 )
        {
            tt = titleTap( tuv ) * 0.4;
            tt += titleTap( tuv + vec2( blur_a, 0.0 ) ) * 0.15;
            tt += titleTap( tuv - vec2( blur_a, 0.0 ) ) * 0.15;
            tt += titleTap( tuv + vec2( 0.0, blur_a * 3.0 ) ) * 0.15;
            tt += titleTap( tuv - vec2( 0.0, blur_a * 3.0 ) ) * 0.15;
        }
        else
            tt = titleTap( tuv );
        if ( dot( split, split ) > 1e-8 )
        {
            vec4 tr = titleTap( tuv + split );
            vec4 tb = titleTap( tuv - split );
            tt.r = tr.r;
            tt.b = tb.b;
            tt.a = max( tt.a, max( tr.a, tb.a ) );
        }

        float a = tt.a * fade_in * ( 1.0 - outp ) * mask_a;
        c = mix( c, tt.rgb, a * 0.92 );
        c += tt.rgb * a * ( 0.25 + 0.30 * audioBeat ); // gentle beat glow
        c += tt.rgb * a * glow_x;                      // style-specific glint
    }

    // Photosensitivity limit (applied last): the compute pass's limScale, every frame; where it does not run
    // (limScale 0), the host folds its own limiter into `scale`.
    c *= scale * ( limScale > 0.0 ? limScale : 1.0 );

    // Percentile auto-exposure ON TOP of the limiter, never instead of it: the
    // limiter is what caps how fast the frame may BRIGHTEN, and that safety
    // property must not depend on a histogram being available.
    if ( autoExposure > 0.0 )
        c *= clamp( autoExposure, 0.72, 1.35 );

    // --- Film grain: fine temporal grain, stronger in the shadows (like real
    // emulsion) and a touch more present while music plays.  Zero-mean pixel
    // noise - no full-screen brightness flicker, so harmless for
    // photosensitivity.
    {
        float gr = hash21( gl_FragCoord.xy * 0.73
                           + vec2( fract( time * 13.7 ) * 91.0,
                                   fract( time * 7.3 ) * 57.0 ) )
                   - 0.5;
        float lum_g = clamp( dot( c, vec3( 0.299, 0.587, 0.114 ) ), 0.0, 1.0 );
        c += gr * 0.022 * ( 0.35 + 0.65 * ( 1.0 - lum_g ) )
             * ( 0.55 + 0.45 * audioLevel );
    }

    // --- CinemaScope letterbox: black bars creep in during the build-up and
    // tear open on the drop (the host slews asymmetrically).  AFTER the grain,
    // so that the bars stay clean black (a real matte, no film picture).
    if ( letterbox > 0.001 )
    {
        float bar = 0.11 * letterbox;
        c *= smoothstep( bar - 0.012, bar + 0.004, uv.y )
             * smoothstep( bar - 0.012, bar + 0.004, 1.0 - uv.y );
    }

    // Ordered dither (interleaved gradient noise) to break up 8-bit banding in the
    // smooth gradients (lava lamp / oil / hypercube).  Spatial only -> flicker-free.
    float ign = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
    c += ( ign - 0.5 ) / 255.0;

    fragColor = vec4( clamp( c, 0.0, 1.0 ), 1.0 );
}
