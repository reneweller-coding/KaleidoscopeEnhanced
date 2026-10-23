//@doc
 * @brief KOTEKAN INTERLOCK LATTICE: the kotekan of the gamelan: two voices play interlocking patterns that together give a whole that neither has alone; the picture is a chessboard of two lattices that interlock into a dense photo when both are lit.  Each voice has every second cell, and their
 * lights alternate by the phrase; where both are on, the photo is complete, where one is on, only its half stands.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the interlocking (which voice is lit) over the phrase (periodic)
 *   audioSwell     -> the density: how long both are lit together
 *
 * Knobs: sizeP (the cell size), hueP.
//@params sizeP
//@audio audioSwell audioPhrasePos
//@body
void main()
{
    vec2 fc = gl_FragCoord.xy;
    float px = resolution.y / 270.0;
    float Cb = 8.0 + 14.0 * clamp(sizeP, 0.0, 1.0);
    float C = Cb * px;
    vec2 ci = floor(fc / C);
    vec2 f = fract(fc / C);
    float par = mod(ci.x + ci.y, 2.0);
    float ph = 6.2831853 * audioPhrasePos;
    float dens = 0.1 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float a = smoothstep(-dens, dens + 0.3, sin(ph));
    float b = smoothstep(-dens, dens + 0.3, -sin(ph));
    float lit = par < 0.5 ? a : b;
    vec2 uvp = (fc - 0.5 * resolution) / resolution.y * 0.85 + 0.5;
    vec3 c = imgLod(uvp, 0.4);
    vec3 dim = imgLod(uvp, 2.5) * 0.12;
    float edge = smoothstep(0.0, 0.05, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    float inner = mix(0.55, 1.0, edge);
    finish((dim + c * lit * inner) * 1.15);
}
