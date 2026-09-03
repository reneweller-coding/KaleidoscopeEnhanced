#version 330 core
out vec4 fragColor;
/**
 * @file TapeReelEcho.frag
 * @brief TAPE REEL ECHO: a reel-to-reel machine, the tape running from
 * the supply reel over the heads to the take-up reel on the scene clock
 * (the reels turn at the speeds their radii give them), the tape carrying
 * the photo as its oxide; along the tape path the spectrum is printed as
 * a bar graph at the record head and repeats, dimmer, at each playback
 * head -- the echo.  The VU needles follow the level (slow-damped as a
 * needle would), the kick lights the record lamp, the treble the head
 * gap glint.  Camera fixed on the deck.
 *
 * Audio Reactivity:
 *   sceneAdvance      -> reels and tape (continuous)
 *   audioSpectrum[32] -> the printed bars and their echoes (light)
 *   audioLevel        -> VU needles (smooth)
 *   audioKick         -> record lamp (light)
 *   audioHigh         -> head glint (light)
 *
 * Per-activation variety: speedP, echoP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioValence;

uniform float speedP;
uniform float echoP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float segDist(vec2 p, vec2 a, vec2 b, out float t)
{
    vec2 d = b - a; t = clamp(dot(p - a, d) / max(dot(d, d), 1e-6), 0.0, 1.0);
    return length(p - (a + d * t));
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float speed = 0.6 + 0.8 * clamp(speedP, 0.0, 1.0);
    float echoes = 1.0 + floor(clamp(echoP, 0.0, 1.0) * 2.0);
    float clock = sceneAdvance * 0.5 * speed + sceneTime * 0.1;
    float light = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);

    // The deck: brushed metal with the photo faint; the reels left and right.
    vec3 col = img(gl_FragCoord.xy / resolution) * 0.15 + vec3(0.18, 0.18, 0.2);
    col *= 0.9 + 0.1 * sin(p.y * 300.0);
    col *= light;
    vec2 reelL = vec2(-0.42, 0.18), reelR = vec2(0.42, 0.18);
    float radL = 0.2 + 0.06 * sin(clock * 0.05);                      // supply reel pack (breathes very slowly)
    float radR = 0.32 - radL * 0.6;
    // Tape path: from the supply reel top, down over the heads (a straight
    // run along y = -0.12), up to the take-up reel.
    vec2 h0 = vec2(-0.3, -0.12), h1 = vec2(0.3, -0.12);
    vec2 tan0 = reelL + vec2(-radL * 0.2, -radL);
    vec2 tan1 = reelR + vec2(radR * 0.2, -radR);
    float t0, t1, t2;
    float d0 = segDist(p, tan0, h0, t0);
    float d1 = segDist(p, h0, h1, t1);
    float d2 = segDist(p, h1, tan1, t2);
    float tapeD = min(d0, min(d1, d2));
    // Position along the whole path (0..1) for the oxide scroll.
    float along = (d0 <= d1 && d0 <= d2) ? t0 * 0.25 : ((d1 <= d2) ? 0.25 + t1 * 0.5 : 0.75 + t2 * 0.25);
    float tapeW = 0.022;
    float tape = smoothstep(tapeW, tapeW * 0.85, tapeD);
    // The oxide: the photo scrolling along the tape with the clock.
    float scroll = along * 3.0 - clock * 0.6;
    vec3 oxide = img(fract(vec2(scroll, 0.5 + (tapeD / tapeW) * 0.1))) * vec3(0.55, 0.45, 0.35) * 1.2;
    col = mix(col, oxide * light, tape);
    // The printed spectrum: along the straight run, the record head at
    // x = -0.18 prints the bars; they scroll right and repeat at the
    // playback heads (x = 0.0, 0.18) dimmer: the echoes.
    if (d1 < tapeW * 3.0 && tapeD == d1)
    {
        float x = p.x;
        vec3 printCol = vec3(0.0);
        for (int e = 0; e < 3; ++e)
        {
            if (float(e) >= echoes) break;
            float headX = -0.18 + float(e) * 0.18;
            // The bar at this point: band by the position across the tape width.
            float across = clamp((p.y + 0.12) / tapeW * 0.5 + 0.5, 0.0, 1.0);
            int band = int(across * 31.0);
            float en = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
            float pattern = pow(0.5 + 0.5 * sin((x - headX) * 200.0 + scroll * 60.0), 6.0);
            float gain = pow(0.5, float(e)) * step(headX, x) * step(x, headX + 0.17);
            printCol += imgPalette(hue * 0.159 + float(band) / 32.0) * pattern * en * gain;
        }
        col += printCol * 1.5 * tape;
    }
    // The reels: hub, spokes, tape pack, turning with the tape speed (v / r).
    for (int r = 0; r < 2; ++r)
    {
        vec2 c = (r == 0) ? reelL : reelR;
        float rad = (r == 0) ? radL : radR;
        vec2 q = p - c;
        float rr = length(q);
        float ang = atan(q.y, q.x) - clock * 0.6 / max(rad, 0.05);
        float pack = smoothstep(rad, rad - 0.01, rr) * step(0.08, rr);
        vec3 packCol = vec3(0.35, 0.28, 0.22) * (0.7 + 0.3 * sin(rr * 300.0)) * light;
        float flange = smoothstep(rad + 0.05, rad + 0.04, rr) * (1.0 - pack) * step(0.08, rr);
        float spoke = pow(0.5 + 0.5 * cos(ang * 3.0), 20.0) * step(0.08, rr) * step(rr, rad + 0.05);
        vec3 flangeCol = mix(vec3(0.75, 0.75, 0.8), vec3(0.4), 1.0 - spoke) * light;
        float hub = smoothstep(0.08, 0.075, rr);
        col = mix(col, packCol, pack);
        col = mix(col, flangeCol, flange * 0.9);
        col = mix(col, vec3(0.6, 0.6, 0.65) * (0.6 + 0.4 * cos(ang * 3.0)) * light, hub);
    }
    // The heads: three blocks under the straight run; the record head lamp on the kick, gaps glint on the treble.
    for (int h = 0; h < 3; ++h)
    {
        float hx = -0.18 + float(h) * 0.18;
        vec2 hq = p - vec2(hx, -0.17);
        float block = step(abs(hq.x), 0.035) * step(abs(hq.y), 0.03);
        col = mix(col, vec3(0.3, 0.3, 0.33) * light, block);
        col += vec3(0.8, 0.85, 0.9) * smoothstep(0.003, 0.0, abs(hq.x)) * block * clamp(audioHigh * 2.0, 0.0, 1.0) * 0.6;
        if (h == 0) col += vec3(1.0, 0.2, 0.15) * exp(-length(hq - vec2(0.0, -0.05)) * 40.0) * (0.3 + 1.5 * audioKick);
    }
    // VU meters: two dials at the bottom with needles following the level.
    for (int v = -1; v <= 1; v += 2)
    {
        vec2 vc = vec2(float(v) * 0.22, -0.38);
        vec2 vq = p - vc;
        float dial = smoothstep(0.1, 0.098, length(vq)) * step(0.0, vq.y);
        vec3 dialCol = vec3(0.9, 0.85, 0.65) * light;
        float scaleArc = smoothstep(0.004, 0.0, abs(length(vq) - 0.085)) * step(0.0, vq.y);
        float needleAng = 2.6 - 2.2 * clamp(audioLevel, 0.0, 1.0);
        vec2 nd = vec2(cos(needleAng), sin(needleAng));
        float tn; float needle = smoothstep(0.004, 0.001, segDist(vq, vec2(0.0), nd * 0.09, tn));
        vec3 meter = mix(dialCol, vec3(0.2), scaleArc);
        meter = mix(meter, vec3(0.1, 0.05, 0.05), needle);
        meter = mix(meter, vec3(0.8, 0.1, 0.1), scaleArc * step(atan(vq.y, vq.x), 0.9));   // the red zone
        col = mix(col, meter, dial);
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
