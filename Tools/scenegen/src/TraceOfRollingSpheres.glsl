//@doc
 * @brief TRACE OF ROLLING SPHERES: balls rolling over an invisible undulating surface leave glowing tracks, and the
 * tracks, seen in perspective, give the relief away -- ridge lines rising and falling across the picture, each with
 * a bright ball at its head and its trail fading behind.  The surface is a sum of slow waves; each track runs across
 * it at its own depth, its height on screen the relief's height there over its distance; the ball moves along it and
 * the track glows only behind the ball.  The tracks' light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass    -> the relief's height (slowly: the surface heaves with the bass)
 *   audioAdvance -> the balls roll on (integrated)
 *   audioSwell   -> the tracks' glow
 *
 * Knobs: trackP (how many tracks), reliefP (the relief's base height), hueP.
//@params trackP reliefP
//@audio audioBass audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float tracks = floor(18.0 + 22.0 * clamp(trackP, 0.0, 1.0));
    float relief = (0.25 + 0.35 * clamp(reliefP, 0.0, 1.0)) * (0.6 + 0.6 * clamp(audioBass, 0.0, 1.0));
    float roll = 0.06 * sceneTime + 0.25 * audioAdvance;
    float drift = 0.02 * sceneTime;
    float glow = 0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = vec3(0.0);
    for (int k = 0; k < 40; ++k) {
        float fk = float(k);
        if (fk >= tracks) break;
        float z = 0.55 + 6.0 * fk / tracks;                      // the track's depth
        float X = p.x * z;                                       // across the surface
        float hgt = relief * (sin(1.3 * X + 0.7 * z + drift) * 0.6 + sin(0.7 * X - 1.1 * z + 2.0) * 0.4
                              + 0.3 * sin(2.3 * X + 1.7 * z - drift));
        float y = (hgt - 0.4) / z + 0.22;                        // the eye stands above the surface
        float d = abs(p.y - y) * z;
        // the ball: rolling across, wrapping; the track glows behind it, fading
        float hb = fract(sin(fk * 12.9898) * 43758.5453);
        float fr = fract(roll * (0.5 + hb) + hb);
        float bx = (fr * 2.0 - 1.0) * 1.3 * z;
        float life = smoothstep(0.0, 0.08, fr) * (1.0 - smoothstep(0.85, 1.0, fr));   // the track fades before the ball wraps
        float behind = X < bx ? exp(-(bx - X) / (0.9 * z)) : 0.0;
        float line = exp(-pow(d / (0.006 * z), 2.0)) * behind;
        float ball = exp(-pow(length(vec2(X - bx, (p.y - y) * z)) / (0.025 * z), 2.0));
        float fade = exp(-0.12 * z);
        col += famLight(fh, fk / tracks, 0.3 * ball) * (line * 0.8 + ball * 1.4) * fade * glow * life;
    }
    finish(famExpose(col, 2.95, 0.70, 0.03, fh));
}
