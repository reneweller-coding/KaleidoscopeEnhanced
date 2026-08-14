#version 330 core
// Shader-storage blocks are a 4.3 feature; requesting the extension keeps this
// shader at 330 so it still links against the shared 330 fullscreen vertex
// shader that every other 2D pass uses.
#extension GL_ARB_shader_storage_buffer_object : require
out vec4 fragColor;

// GPU auto-exposure.  Blend/CfxHistogram.comp builds a luminance histogram of
// the finished frame and writes the exposure its percentiles justify into this
// buffer; reading it straight from the fragment shader avoids the GPU->CPU
// readback the old mean-luminance path needed.  autoExposure <= 0 means the
// compute path is unavailable, and the pass falls back to 1.0.
layout(std430, binding = 3) readonly buffer AutoExp {
    float autoExposure; float lumaP50; float lumaP98; float autoPad;
};
// Present.frag
// Final present pass.  Two jobs:
//  1) A GLOBAL MOOD GRADE applied once to the finished frame, so EVERY effect
//     (not just Tunnel/Kaleidoscope) reacts to the music's mood:
//       audioCentroid -> colour temperature (dark=cool blue, bright=warm amber)
//       audioValence  -> saturation (minor/rough muted, major/consonant vivid)
//       audioLevel    -> brightness (loudness)
//       audioFlux     -> shimmer on spectral change
//     The host feeds GATED values, so in non-music mode they sit at neutral
//     (centroid/valence 0.5, level/flux 0) and the grade is a no-op.
//  2) The photosensitivity brightness limit (uniform `scale`), applied last.
uniform sampler2D tex;
uniform vec2  resolution;
uniform float scale;

uniform float audioCentroid;
uniform float audioValence;
uniform float audioLevel;
uniform float audioFlux;
uniform float audioChromaHue;   // harmony → global hue shift (0 = neutral in non-music)
uniform float audioBeat;        // beat → extra bloom on hits
uniform float audioDownbeat;    // bigger accent on the bar's "1"
uniform float audioOnset;       // full-spectrum onset (snares/claps/melodic) → cone pulse
uniform float time;             // for the slow moving-head beam sweep
uniform float audioChase;       // 0..1, steps 1/4 each onset → corner-cone colour chase
uniform float lightShow;        // 1 = stage lamps (cones/haze/mirror-ball/gobo) on, 0 = off
uniform float audioSwell;       // slow loudness build (ambient dynamics) → glow breathing
uniform float audioBarPhase;    // 0..1 position within the 4-beat bar → per-bar lamp sweep
uniform sampler2D bloomTex;     // 2-pass Gaussian bloom (quarter res), when useBloom = 1
uniform float useBloom;         // 1 = bloomTex valid, 0 = fall back to the mip tap
uniform float sharpen;          // CAS-style sharpen amount (host: >0 when renderScale < 1)
uniform vec2  srcTexel;         // 1 / render resolution (the sampled texture)
uniform float camZoom;          // virtual camera: punch-in zoom (host keeps >= 1)
uniform float camRot;           // virtual camera: small roll (radians)
uniform vec2  camOff;           // virtual camera: drift + shake offset (uv units)
uniform sampler2D titleTex;     // track-title reveal texture (transparent bg)
uniform float titlePhase;       // 0..1 while the reveal runs; >= 1 = off
uniform float titleAspect;      // title texture width/height
uniform int   titleStyle;       // reveal style 0..23 (host-rolled, mood-matched)
uniform float titleSeed;        // per-reveal random seed
uniform int   stereoMode;       // 0 off, 1 side-by-side, 2 top-bottom, 3 anaglyph
uniform float stereoDepth;      // disparity strength 0..2 (host, key c/m)
uniform int   stereoSource;     // 1 = source is ALREADY eye-packed (true 3D stereo)

// ---- Lyrics-Overlay (LRCLIB; Taste 'w': aus / Scroll / Karaoke) ----
uniform sampler2D lyricsTex;    // hohe Zeilen-Textur (transparenter Grund)
uniform float lyricsAlpha;      // 0 = aus (Host blendet weich)
uniform float lyricsScrollV;    // Textur-V, das im Bildzentrum liegt
uniform float lyricsAspect;     // Texturbreite / -hoehe
uniform vec3  lyricsHl;         // Karaoke: aktive Zeile v0, v1, Fortschritt (v0<0 = aus)

// ---- Kuenstlerbild-Overlay (Deezer; Taste 'o') ----
uniform sampler2D artistTex;
uniform float artistAlpha;      // 0 = aus (Host blendet weich + rotiert Bilder)
uniform float artistAspect;     // Bildbreite / -hoehe

float hash21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

// Hue rotation around the (1,1,1) luminance axis (Rodrigues), turns in [0,1].
vec3 hueRotate(vec3 c, float turns)
{
    float a = turns * 6.28318530718;
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

vec2 rot2(vec2 v, float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c) * v; }

// ---- Track-title reveal helpers ----
float vnoise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
    float cc = hash21(i + vec2(0.0, 1.0)), dd = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(cc, dd, f.x), f.y);
}
vec2 titleUV(vec2 q) { return vec2(q.x / 1.10, -q.y / (1.10 / titleAspect)) + 0.5; }
vec4 titleTap(vec2 t)
{
    if (t.x <= 0.0 || t.x >= 1.0 || t.y <= 0.0 || t.y >= 1.0) return vec4(0.0);
    return texture(titleTex, t);
}

// A spotlight CONE emanating from `origin` along `dir`: brightest at the source,
// widening and fading along the beam.  Returns 0..1.
float coneLight(vec2 p, vec2 origin, vec2 dir, float spread, float reach)
{
    vec2  v = p - origin;
    float t = dot(v, dir);                       // distance along the beam
    if (t < 0.0) return 0.0;                      // behind the lamp
    float perp = length(v - t * dir);            // distance from the beam axis
    float halfWidth = spread * (t + 0.04);        // cone widens with distance
    float across = clamp(1.0 - perp / halfWidth, 0.0, 1.0);
    across = across * across;                     // soft edges
    float along = exp(-t / reach) * (0.35 + 0.65 * clamp(1.0 - t * 0.3, 0.0, 1.0));
    return across * along;
}

// Pseudo-depth for the stereoscopic reprojection: smoothed brightness (the
// blurred bloom buffer doubles as a depth cue) pops bright structures toward
// the viewer; the radial term sinks the tunnel centre behind the screen.
float stereoDepthAt(vec2 puv, vec2 cuv)
{
    float bl = (useBloom > 0.5)
             ? dot(texture(bloomTex, puv).rgb, vec3(0.299, 0.587, 0.114))
             : dot(texture(tex, puv, 4.0).rgb, vec3(0.299, 0.587, 0.114));
    return clamp(bl * 1.4, 0.0, 1.0) * 0.7
         + clamp(length(cuv) * 1.5, 0.0, 1.0) * 0.3;
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;

    // Stereoscopic split: each half shows the FULL logical frame for one eye
    // (side-by-side "half" / top-bottom — the display or HMD player
    // unsqueezes them, so every uv-based computation below stays correct).
    float eyeSign = 0.0;                   // -1 left eye, +1 right eye
    if (stereoMode == 1)
    {
        eyeSign = (uv.x < 0.5) ? -1.0 : 1.0;
        uv.x = fract(uv.x * 2.0);
    }
    else if (stereoMode == 2)
    {
        eyeSign = (uv.y >= 0.5) ? -1.0 : 1.0;   // top half = left eye
        uv.y = fract(uv.y * 2.0);
    }

    // Subtle whole-scene beat pulse: a gentle zoom "breath" on each beat (a little
    // bigger on the downbeat).  It's motion, not a flash, and uses the already
    // slew-limited beat, so it reads as a soft pump rather than a strobe - easy on
    // the eyes.  Sampled from puv; the corner lights below keep the un-zoomed uv.
    float scenePulse = clamp(audioBeat + 0.4 * audioDownbeat, 0.0, 1.0);
    // Virtual camera: aspect-true roll + punch-in zoom + drift/shake offset,
    // combined with the beat "breath".  The host guarantees the zoom covers
    // the offset + rotation, so no edge ever samples outside the frame
    // (camZoom defaults to 0 when unset -> the max() keeps it a no-op).
    float aspect2 = resolution.x / resolution.y;
    vec2  cuv = uv - 0.5;
    cuv.x *= aspect2;
    cuv = rot2(cuv, camRot);
    cuv.x /= aspect2;
    float camz = (1.0 + 0.040 * scenePulse) * max(camZoom, 1.0);
    vec2  puv = cuv / camz + 0.5 - camOff;

    // Stereoscopic reprojection: shift the sampling per eye by the local
    // pseudo-depth (crossed disparity -> bright structures float in front of
    // the screen, the tunnel centre recedes).  Anaglyph packs both eyes into
    // one frame: red = left eye, green/blue = right eye.
    vec3 c;
    if (stereoMode == 1 || stereoMode == 2)
    {
        if (stereoSource == 1)
        {
            // TRUE stereo: the 3D scene already rendered one view per half —
            // just sample the matching half (no reprojection).
            if (stereoMode == 1)
                puv = vec2(puv.x * 0.5 + ((eyeSign > 0.0) ? 0.5 : 0.0), puv.y);
            else   // top half = left eye
                puv = vec2(puv.x, puv.y * 0.5 + ((eyeSign < 0.0) ? 0.5 : 0.0));
        }
        else
            puv.x += stereoDepth * 0.007
                   * (stereoDepthAt(puv, cuv) - 0.45) * eyeSign;
        c = texture(tex, puv).rgb;
    }
    else if (stereoMode == 3)
    {
        float disp = stereoDepth * 0.006 * (stereoDepthAt(puv, cuv) - 0.45);
        vec3 cl = texture(tex, puv + vec2(-disp, 0.0)).rgb;   // left eye
        vec3 cr = texture(tex, puv + vec2( disp, 0.0)).rgb;   // right eye
        c = vec3(cl.r, cr.g, cr.b);
    }
    else
        c = texture(tex, puv).rgb;

    // CAS-style sharpening: when the internal render scale is below 1 the
    // frame is upsampled here — a neighbourhood-clamped unsharp mask (no
    // halos) restores the crispness the downscale cost.  sharpen = 0 → off.
    if (sharpen > 0.001 && stereoMode != 3)   // CAS would fringe the anaglyph
    {
        vec3 n = texture(tex, puv + vec2(0.0,  srcTexel.y)).rgb;
        vec3 s = texture(tex, puv - vec2(0.0,  srcTexel.y)).rgb;
        vec3 e = texture(tex, puv + vec2(srcTexel.x, 0.0)).rgb;
        vec3 w = texture(tex, puv - vec2(srcTexel.x, 0.0)).rgb;
        vec3 mn = min(min(min(n, s), min(e, w)), c);
        vec3 mx = max(max(max(n, s), max(e, w)), c);
        c = clamp(c + (4.0 * c - (n + s + e + w)) * sharpen, mn, mx);
    }

    // Colour temperature (centred so centroid 0.5 ≈ neutral).
    vec3 cool = vec3(0.65, 0.85, 1.30);
    vec3 warm = vec3(1.35, 1.10, 0.70);
    c *= mix(cool, warm, audioCentroid);

    // Harmony → hue shift (the song's key/chords tint the whole palette).
    c = hueRotate(c, audioChromaHue * 0.18);

    // Saturation from valence (centred so 0.5 ≈ neutral).
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(vec3(lum), c, 0.45 + 1.10 * audioValence);

    // Tone-down: the source frames are often very bright/pale, washing the whole
    // image out.  Cut the exposure and deepen the mid-tones for richer colour
    // (most effective on the near-white areas).
    c = pow(max(c, 0.0) * 0.78, vec3(1.25));

    // Loudness → brightness, spectral flux → shimmer (kept small so already-bright
    // content does not blow out).  A gentle brightness lift on the beat (with the
    // zoom above = subtle whole-scene pump), and the slow SWELL lets ambient
    // builds visibly brighten and fade-outs breathe back down.
    c *= (1.0 + 0.12 * audioLevel + 0.06 * audioFlux + 0.10 * scenePulse
              + 0.08 * audioSwell);

    // Bloom / glow.  Preferred: the real two-pass Gaussian (bloomTex, quarter res,
    // bright-passed) — a proper soft halo.  Fallback: the old single mip tap.
    // The swell breathes the glow (ambient builds bloom up majestically).
    vec3 bloom;
    if (useBloom > 0.5)
        bloom = texture(bloomTex, puv).rgb;
    else
        bloom = max(texture(tex, puv, 4.5).rgb - 0.75, 0.0);
    c += bloom * (0.12 + 0.05 * audioBeat + 0.10 * audioSwell);

    // Soft highlight knee: compress values above ~0.8 toward white instead of
    // hard-clipping the whole frame to flat white when the grade pushes it high.
    c = c / (1.0 + max(c - 0.8, 0.0));

    // --- Corner spotlights (cones) ----------------------------------------------
    // Four stage-light CONES shining from the corners toward the centre, flashing
    // IN TIME with the beat (extra punch on the downbeat), coloured by the mood
    // with a slightly different hue per corner.  Directional, so they read clearly
    // as spotlights yet stay eye-friendly.  audioBeat / audioDownbeat are music-
    // gated upstream, so on speech / silence the lamps stay dark.
    // Optional (key 'l'); off by default so the scene beat pulse can stand alone.
    if (lightShow > 0.5)
    {
        float aspect = resolution.x / resolution.y;
        vec2  q      = vec2(uv.x * aspect, uv.y);
        vec2  ctr    = vec2(aspect * 0.5, 0.5);

        // Vivid mood colour (centroid temperature, valence saturation).
        vec3  moodCol = mix(vec3(0.25, 0.55, 1.0), vec3(1.0, 0.55, 0.20), audioCentroid);
        float sl      = dot(moodCol, vec3(0.299, 0.587, 0.114));
        moodCol       = mix(vec3(sl), moodCol, 0.75 + 0.5 * audioValence);

        // Beat/onset pulse with a modest always-on base.
        float pulse  = clamp(0.16 + 1.0 * audioBeat + 0.6 * audioDownbeat
                                  + 0.7 * audioOnset, 0.0, 1.0);
        float spread = 0.52;     // cone half-width factor (thick beams)
        float reach  = 0.38;     // short, so the thick cones stay in the corner regions

        vec2 c0 = vec2(0.0,    0.0);
        vec2 c1 = vec2(aspect, 0.0);
        vec2 c2 = vec2(0.0,    1.0);
        vec2 c3 = vec2(aspect, 1.0);

        // Moving-head sweep, synced to the BAR (one full sweep per 4 beats, via
        // audioBarPhase) with phase offsets per corner; a slow time drift keeps
        // the heads alive when no tempo is running.  Wider sweep when loud.
        float swAmp = 0.55 + 0.35 * audioLevel;
        float swPh  = 6.2831 * audioBarPhase + time * 0.10;
        vec2 d0 = rot2(normalize(ctr-c0), swAmp * sin(swPh + 0.0));
        vec2 d1 = rot2(normalize(ctr-c1), swAmp * sin(swPh + 1.7));
        vec2 d2 = rot2(normalize(ctr-c2), swAmp * sin(swPh + 3.3));
        vec2 d3 = rot2(normalize(ctr-c3), swAmp * sin(swPh + 5.0));

        // Colour CHASE: emphasis cycles through the corners (audioChase steps 1/4
        // on each onset).  Non-active corners keep a 0.45 base so all stay alive.
        float cw0 = 0.45 + 0.55 * (1.0 - smoothstep(0.0, 0.25, abs(fract(audioChase - 0.00 + 0.5) - 0.5)));
        float cw1 = 0.45 + 0.55 * (1.0 - smoothstep(0.0, 0.25, abs(fract(audioChase - 0.25 + 0.5) - 0.5)));
        float cw2 = 0.45 + 0.55 * (1.0 - smoothstep(0.0, 0.25, abs(fract(audioChase - 0.50 + 0.5) - 0.5)));
        float cw3 = 0.45 + 0.55 * (1.0 - smoothstep(0.0, 0.25, abs(fract(audioChase - 0.75 + 0.5) - 0.5)));
        float p0 = pulse * cw0, p1 = pulse * cw1, p2 = pulse * cw2, p3 = pulse * cw3;

        vec3 col0 = hueRotate(moodCol, audioChromaHue + 0.00) * 1.5;
        vec3 col1 = hueRotate(moodCol, audioChromaHue + 0.12) * 1.5;
        vec3 col2 = hueRotate(moodCol, audioChromaHue + 0.25) * 1.5;
        vec3 col3 = hueRotate(moodCol, audioChromaHue + 0.37) * 1.5;

        // Core cone tint (visible over any content).
        c = mix(c, col0, clamp(coneLight(q, c0, d0, spread, reach) * p0, 0.0, 0.88));
        c = mix(c, col1, clamp(coneLight(q, c1, d1, spread, reach) * p1, 0.0, 0.88));
        c = mix(c, col2, clamp(coneLight(q, c2, d2, spread, reach) * p2, 0.0, 0.88));
        c = mix(c, col3, clamp(coneLight(q, c3, d3, spread, reach) * p3, 0.0, 0.88));

        // Volumetric HAZE: a wide, soft additive glow around each beam, as if the
        // light scatters in stage fog (makes the beams look 3-D).
        float hz = 0.14;
        c += col0 * coneLight(q, c0, d0, spread*1.7, reach*1.6) * p0 * hz;
        c += col1 * coneLight(q, c1, d1, spread*1.7, reach*1.6) * p1 * hz;
        c += col2 * coneLight(q, c2, d2, spread*1.7, reach*1.6) * p2 * hz;
        c += col3 * coneLight(q, c3, d3, spread*1.7, reach*1.6) * p3 * hz;

        // MIRROR-BALL speckle: a slowly rotating field of soft twinkling light dots
        // (disco-ball), music-gated so it fades in with the music.
        vec2 mb   = rot2(uv - 0.5, time * 0.06);
        vec2 cell = mb * vec2(16.0, 9.0);
        vec2 idc  = floor(cell);
        vec2 fc   = fract(cell) - 0.5;
        float dotm = smoothstep(0.42, 0.0, length(fc)) * step(0.62, hash21(idc));
        float tw   = 0.5 + 0.5 * sin(time * 2.5 + hash21(idc) * 31.0);
        c += hueRotate(vec3(0.85, 0.85, 0.95), audioChromaHue + 0.5)
             * dotm * tw * 0.12 * (0.2 + 0.8 * audioLevel);

        // GOBO: a slowly rotating fan of light rays from the centre (gobo wheel),
        // fading in toward the edges so it never washes the middle.
        vec2  g   = q - ctr;
        float ang = atan(g.y, g.x) + time * 0.12;
        float rays = pow(0.5 + 0.5 * cos(ang * 9.0), 6.0);
        c += hueRotate(moodCol, audioChromaHue + 0.6) * 1.3
             * rays * 0.08 * (0.2 + 0.8 * audioLevel) * smoothstep(0.05, 0.45, length(g));
    }

    // --- Kuenstlerbild: organisch in die Ecke unten links eingeschmolzen.
    // Gefiederter, per Noise unregelmaessig ausgefranster Rand + weiche
    // Mischung (mix + sanftes Screen) statt hartem Bilderrahmen; eine leichte
    // audio-phasige Wabernbewegung laesst es mit der Szene atmen.  Vor dem
    // Titel/Limiter komponiert, damit Blackout & Co. mitwirken.
    if (artistAlpha > 0.001)
    {
        float wU = 0.26;                                   // 26% der Bildbreite
        float hU = wU * (resolution.x / resolution.y) / max(artistAspect, 0.2);
        vec2  m0 = vec2(0.035, 0.045);                     // Ecke unten links
        vec2  a  = (uv - m0) / vec2(wU, hU);
        if (a.x > -0.2 && a.x < 1.2 && a.y > -0.2 && a.y < 1.2)
        {
            // Atmen: kleine, langsame Verformung (zeitbasiert, flickerfrei).
            vec2 warp = vec2(sin(time * 0.37 + a.y * 5.0),
                             cos(time * 0.31 + a.x * 4.0)) * 0.012;
            vec2 av = clamp(a + warp, 0.0, 1.0);
            vec3 img = texture(artistTex, vec2(av.x, 1.0 - av.y)).rgb;

            float feather = smoothstep(0.0, 0.16, a.x) * smoothstep(0.0, 0.16, a.y)
                          * smoothstep(0.0, 0.16, 1.0 - a.x)
                          * smoothstep(0.0, 0.16, 1.0 - a.y);
            // Organischer Fransen-Rand statt sauberer Kante.
            feather *= 0.62 + 0.38 * vnoise2(a * 6.0 + vec2(time * 0.05, 0.0));

            float aa = feather * artistAlpha;
            c  = mix(c, img, aa * 0.78);
            c += img * img * aa * 0.22;                    // sanfter Screen-Anteil
        }
    }

    // --- Lyrics: Credits-Scroll ueber die Bildmitte bzw. Karaoke mit
    // goldenem Zeilen-Highlight und Fortschritts-Sweep.  Das V-Fenster wird
    // vom Host positioniert (Scroll folgt der Playback-Position; Karaoke
    // zentriert die aktive Zeile).
    if (lyricsAlpha > 0.001)
    {
        float u = (uv.x - 0.5) / 0.62 + 0.5;               // Textband: 62% Breite
        // Sichtbares V pro Bildschirm-UV (Textur behaelt ihr Pixel-Seitenverhaeltnis).
        float vSpan = (resolution.y / resolution.x) * lyricsAspect / 0.62;
        float v = lyricsScrollV + (0.5 - uv.y) * vSpan;
        if (u > 0.0 && u < 1.0 && v > 0.0 && v < 1.0)
        {
            vec4 lt = texture(lyricsTex, vec2(u, v));
            // Weiche Raender oben/unten (Credits-Fenster).
            float edge = smoothstep(0.04, 0.22, uv.y) * smoothstep(0.96, 0.78, uv.y);
            float a = lt.a * lyricsAlpha * edge;

            vec3 col = lt.rgb;
            if (lyricsHl.x >= 0.0)
            {
                // Karaoke: aktive Zeile gold + Sweep, restliche Zeilen dezent.
                if (v >= lyricsHl.x && v <= lyricsHl.y)
                {
                    float sweep = smoothstep(lyricsHl.z + 0.02, lyricsHl.z - 0.02, u);
                    vec3 gold = col * vec3(1.0, 0.86, 0.42);
                    col = mix(col, gold, 0.35 + 0.65 * sweep);
                    a  *= 1.0;
                    c  += gold * a * 0.25 * (0.5 + 0.5 * audioBeat);
                }
                else
                    a *= 0.45;                             // Kontext-Zeilen dezenter
            }
            c = mix(c, col, a * 0.95);
        }
    }

    // --- Track-title reveal: 30 distinct entrance styles (host-rolled per
    // reveal, matched to the music's mood — calm gets soft dissolves and
    // drifts, aggressive gets glitch/slam, bright gets light sweeps, dark
    // gets smoke).  All entrances use an ease-out cubic so the motion
    // settles organically instead of snapping; the shared ending grows the
    // text gently toward the viewer while it fades.  Composited BEFORE the
    // safety scale so the limiter (and blackout) applies to it too.
    if (titlePhase < 1.0)
    {
        float ph     = titlePhase;
        float fadeIn = smoothstep(0.00, 0.08, ph);
        float outp   = smoothstep(0.74, 0.97, ph);
        float e      = smoothstep(0.03, 0.42, ph);
        e = 1.0 - pow(1.0 - e, 3.0);                   // ease-out cubic entrance
        float d  = 1.0 - e;                            // "derangement" remaining
        float sd = titleSeed * 37.0;
        int   st = titleStyle;

        vec2 tp = uv - vec2(0.5, 0.52);
        tp.x *= resolution.x / resolution.y;

        vec2  tq    = tp;
        float blurA = 0.0;
        vec2  split = vec2(0.0);
        float maskA = 1.0;
        float glowX = 0.0;

        // ---- Spatial entrances ----
        if      (st == 1)  tq.y += 0.14 * d * d;                       // gentle drift-in
        else if (st == 2)  blurA = 0.012 * d;                          // focus pull
        else if (st == 6)  {                                           // kaleido unwind
            float ang = atan(tp.y, tp.x);
            float rad = length(tp);
            float seg = 1.0471976;
            float ka  = abs(mod(ang + 3.14159265, 2.0 * seg) - seg);
            float aa  = mix(ang, ka, d * 0.85);
            aa       += d * 2.4 * (0.55 - min(rad, 0.55));
            tq = vec2(cos(aa), sin(aa)) * rad;
        }
        else if (st == 7)  tq /= 1.0 + 2.5 * d * d;                    // zoom-through (huge -> place)
        else if (st == 8)  { tq *= 1.0 + 1.6 * d * d; blurA = 0.006 * d; } // rises from depth
        else if (st == 9)  tq.y += sin(tq.x * 16.0 + ph * 22.0) * 0.055 * d; // water ripple
        else if (st == 10) split = vec2(0.10, 0.04) * d;               // chromatic assemble
        else if (st == 11) {                                           // glitch slam
            float row = floor((tq.y + 2.0) * 22.0);
            tq.x += (hash21(vec2(row, sd)) - 0.5) * 0.5 * d * d;
            split = vec2(0.03, 0.0) * d;
        }
        else if (st == 12) { float eq = floor(e * 5.0) / 5.0;          // stutter zoom
                             tq *= 1.0 + 1.6 * (1.0 - eq); }
        else if (st == 13) {                                           // shockwave ring
            float r    = length(tq);
            float ring = exp(-abs(r - e * 1.2) * 9.0);
            tq += (tq / max(r, 1e-3)) * ring * 0.10 * d;
            glowX = ring * 0.5 * d;
        }
        else if (st == 14) tq = rot2(tq, 0.5 * d * d * (titleSeed > 0.5 ? 1.0 : -1.0)); // spin-in
        else if (st == 15) tq.x += sign(tp.x) * 0.5 * d * d;           // doors slide together
        else if (st == 16) {                                           // drop with soft overshoot
            float b    = e - 1.0;
            float back = 1.0 + 2.7 * b * b * b + 1.7 * b * b;
            tq.y += 0.5 * (1.0 - back);
        }
        else if (st == 17) {                                           // smoke condense
            vec2 w = vec2(vnoise2(tq * 5.0 + sd),
                          vnoise2(tq * 5.0 + sd + 9.7)) - 0.5;
            tq += w * 0.30 * d;
            blurA = 0.006 * d;
        }
        else if (st == 20) tq += vec2(sin(tq.y * 55.0 + ph * 38.0),    // heat shimmer
                                      cos(tq.x * 50.0 + ph * 33.0)) * 0.009 * d;
        else if (st == 21) { float q = 0.004 + 0.10 * d * d;           // pixelate-in
                             tq = (floor(tq / q) + 0.5) * q; }
        else if (st == 23) tq.y += sin(tq.x * 9.0 - ph * 16.0)         // flag wave settles
                                 * 0.06 * d * (0.65 + 0.35 * sin(sd));
        else if (st == 25) {                                           // vinyl spin-in
            float dir = (titleSeed > 0.5) ? 1.0 : -1.0;
            tq = rot2(tq, d * d * 6.2831853 * dir) * (1.0 + 2.0 * d * d);
        }
        else if (st == 27) {                                           // shatter converge
            vec2 cell = floor(tq * 6.0 + 3.0);
            vec2 rnd  = vec2(hash21(cell + sd), hash21(cell + sd + 11.3)) - 0.5;
            tq += rnd * 0.7 * d * d;
        }
        // (st 0/3/4/5/18/19/22/24/26/28/29: no spatial change; masks/sampling below.)

        // Shared tasteful ending: grow gently toward the viewer while fading.
        tq /= 1.0 + 0.55 * outp;

        vec2 tuv = titleUV(tq);

        // ---- Mask-based entrances (need text-space coordinates) ----
        if      (st == 3)  maskA = smoothstep(0.10, -0.02, tuv.x - e * 1.15); // soft L->R wipe
        else if (st == 4)  maskA = smoothstep(0.06, -0.06, length(tq) - e * 1.05); // iris
        else if (st == 5)  { float band = abs(fract(tuv.y * 4.0) - 0.5) * 2.0;  // soft blinds
                             maskA = smoothstep(band - 0.25, band + 0.05, e * 1.25); }
        else if (st == 18) { float g = hash21(floor(tuv * vec2(140.0, 36.0)) + sd); // sparkle dissolve
                             maskA = smoothstep(d - 0.08, d + 0.08, g);
                             glowX = exp(-abs(g - d) * 30.0) * 0.8 * d; }
        else if (st == 19) { float sw = tuv.x + tuv.y * 0.25 - (e * 1.6 - 0.25);   // light sweep
                             maskA = smoothstep(0.05, -0.10, sw);
                             glowX = exp(-abs(sw) * 18.0) * 0.9; }
        else if (st == 24) { float band = abs(tuv.y - 0.5) * 2.0;              // vertical curtain
                             maskA = smoothstep(band - 0.06, band + 0.06, e * 1.15); }
        else if (st == 26) { float cellX = floor(tuv.x * 34.0) / 34.0;         // typewriter
                             maskA = step(cellX, e * 1.06); }
        else if (st == 28) { float band = abs(fract((tuv.x + tuv.y) * 3.0) - 0.5) * 2.0; // diagonal blinds
                             maskA = smoothstep(band - 0.25, band + 0.05, e * 1.25); }
        else if (st == 29) { float g = hash21(floor(tuv * vec2(46.0, 12.0)) + sd); // magnetic snap
                             maskA = smoothstep(d - 0.10, d + 0.10, g);
                             glowX = exp(-abs(g - d) * 22.0) * 0.7 * d; }

        // ---- Sample: plain / blurred / echo ghosts / RGB split ----
        vec4 tt;
        if (st == 22) {                                                // echo converge
            vec2 o = vec2(0.10, 0.035) * d;
            tt = titleTap(tuv) * 0.5 + titleTap(tuv + o) * 0.25
               + titleTap(tuv - o) * 0.25;
        }
        else if (blurA > 0.0001) {
            tt  = titleTap(tuv) * 0.4;
            tt += titleTap(tuv + vec2(blurA, 0.0)) * 0.15;
            tt += titleTap(tuv - vec2(blurA, 0.0)) * 0.15;
            tt += titleTap(tuv + vec2(0.0, blurA * 3.0)) * 0.15;
            tt += titleTap(tuv - vec2(0.0, blurA * 3.0)) * 0.15;
        }
        else
            tt = titleTap(tuv);
        if (dot(split, split) > 1e-8) {
            vec4 tr = titleTap(tuv + split);
            vec4 tb = titleTap(tuv - split);
            tt.r = tr.r;  tt.b = tb.b;
            tt.a = max(tt.a, max(tr.a, tb.a));
        }

        float a = tt.a * fadeIn * (1.0 - outp) * maskA;
        c = mix(c, tt.rgb, a * 0.92);
        c += tt.rgb * a * (0.25 + 0.30 * audioBeat);   // gentle beat glow
        c += tt.rgb * a * glowX;                        // style-specific glint
    }

    c *= scale;   // photosensitivity brightness limit (applied last)

    // Percentile auto-exposure ON TOP of the limiter, never instead of it: the
    // limiter is what caps how fast the frame may BRIGHTEN, and that safety
    // property must not depend on a histogram being available.
    if (autoExposure > 0.0)
        c *= clamp(autoExposure, 0.72, 1.35);

    // Ordered dither (interleaved gradient noise) to break up 8-bit banding in the
    // smooth gradients (lava lamp / oil / hypercube).  Spatial only -> flicker-free.
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy,
                                             vec2(0.06711056, 0.00583715))));
    c += (ign - 0.5) / 255.0;

    fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
