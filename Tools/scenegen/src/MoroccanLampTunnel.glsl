//@doc
 * @brief MOROCCAN LAMP TUNNEL: inside the light of a Moroccan pierced-metal lamp: its pattern of light points --
 * rosettes of dots, rings within rings, joined by little stars -- covers every wall of an endless tunnel, turning slowly
 * as the lamp turns, the light breathing with the music.  The wall is cut into cells with a whole number around; each
 * cell holds a rosette (a centre, a ring of eight and a ring of twelve points) and shares a point at every corner; each
 * point is a round soft spot, the nearest one of every ring found from the angle.  The lamp's turning moves the whole
 * pattern round the tunnel.  The light is warm shades of one colour family, tinted by the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase   -> the lamp turns: the pattern moves round the tunnel (integrated)
 *   audioAdvance -> the flight (integrated)
 *   audioSwell   -> the light's strength, flickering a little
 *
 * Knobs: cellP (the rosettes' size), spotP (the points' size), hueP.
//@params cellP spotP
//@audio audioPhase audioSwell
//@body
/**  The glow of a ring of points round a rosette's centre.
 *
 * @param l   The place in the cell (centre at 0). (in)
 * @param n   The number of points. (in)
 * @param R   The ring's radius. (in)
 * @param rs  A point's radius. (in)
 * @param px  A pixel in cells. (in)
 *
 * @return
 *   The glow.
 **/
float ring(vec2 l, float n, float R, float rs, float px)
{
    float th = atan(l.y, l.x);
    float k = floor(th / 6.2831853 * n + 0.5);
    float tk = k * 6.2831853 / n;
    float d = length(l - R * vec2(cos(tk), sin(tk)));
    return (1.0 - smoothstep(rs - px, rs + px, d)) + 0.25 * exp(-d / (2.5 * rs));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float R0 = 0.4;
    float r = max(length(p), 1e-3), a = atan(p.y, p.x);
    float z = R0 / r;
    float fly = 0.22 * sceneTime + 0.8 * audioAdvance;
    float M = floor(7.0 + 5.0 * (1.0 - clamp(cellP, 0.0, 1.0)));     // rosettes around
    float cw = 6.2831853 * R0 / M;
    float turn = 0.02 * sceneTime + 0.25 * audioPhase;
    vec2 q = vec2((a + turn) / 6.2831853 * M, (z + fly) / cw);
    vec2 cell = floor(q);
    vec2 l = fract(q) - 0.5;
    float px = max(R0 / (r * r * resolution.y), cw * M / (6.2831853 * r * resolution.y * cw)) / cw;
    float rs = 0.028 + 0.02 * clamp(spotP, 0.0, 1.0);
    float g = ring(l, 8.0, 0.22, rs, px) + ring(l, 12.0, 0.36, rs * 0.8, px);
    g += (1.0 - smoothstep(rs * 1.4 - px, rs * 1.4 + px, length(l))) + 0.25 * exp(-length(l) / (3.0 * rs));
    vec2 corner = l - sign(l) * 0.5;                                  // the point shared at the nearest corner
    g += (1.0 - smoothstep(rs - px, rs + px, length(corner))) + 0.2 * exp(-length(corner) / (2.5 * rs));
    // the little stars between: four points round each edge's middle
    vec2 em = abs(l.x) > abs(l.y) ? vec2(sign(l.x) * 0.5, 0.0) : vec2(0.0, sign(l.y) * 0.5);
    g += ring(l - em, 4.0, 0.07, rs * 0.7, px);
    float detail = 1.0 - smoothstep(0.03, 0.09, px);
    float flick = 0.92 + 0.08 * noise2(vec2(1.7 * sceneTime, mod(cell.x, M) * 3.1 + cell.y));
    float glow = (0.55 + 0.6 * clamp(audioSwell, 0.0, 1.0)) * flick;
    vec3 tint = mix(famLight(fh, 0.7, 0.4), imgLod(vec2(0.5 + 0.3 * cos(a), 0.5 + 0.3 * sin(a)), 5.0), 0.25);
    vec3 col = famCol(fh, 0.3) * 0.03 + tint * mix(0.12, g * 0.8, detail) * glow;
    col = mix(col, famCol(fh, 0.6) * 0.25 * glow, smoothstep(6.0, 18.0, z));
    col += tint * exp(-r * 8.0) * 0.35 * glow;
    finish(col);
}
