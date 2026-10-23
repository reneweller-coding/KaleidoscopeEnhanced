//@doc
 * @brief PNG FILTER SCANLINES: the line filters of PNG: every line of the photo is coded with one of five filters (none, sub, up, average, paeth), and the picture shows the result with deliberately mixed-up filters, so every line carries its own distortion of the
 * neighbour.  The filters' weights per line move slowly, so the stripes of filters flow through the picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the filters' weights move from line to line (integrated)
 *   audioSwell       -> the amplification of the residuals
 *
 * Knobs: sizeP (the height of a line), hueP.
//@params sizeP
//@audio audioSwell audioHarmAdvance
//@body
/**  The Paeth predictor of PNG, per channel.
 *
 * @param a  The left neighbour. (in)
 * @param b  The upper neighbour. (in)
 * @param c  The upper-left neighbour. (in)
 *
 * @return
 *   The predicted colour.
 **/
vec3 paeth(vec3 a, vec3 b, vec3 c)
{
    vec3 p = a + b - c;
    vec3 pa = abs(p - a);
    vec3 pb = abs(p - b);
    vec3 pc = abs(p - c);
    vec3 ra = step(pa, pb) * step(pa, pc);
    vec3 rb = (1.0 - ra) * step(pb, pc);
    return ra * a + rb * b + (1.0 - ra - rb) * c;
}
void main()
{
    vec2 p = screenP();
    float px = resolution.y / 270.0;
    vec2 uv = p * 0.85 + 0.5 + 0.03 * vec2(sin(0.05 * sceneTime), cos(0.04 * sceneTime));
    float e = 0.005;
    vec3 c = imgLod(uv, 0.4);
    vec3 l = imgLod(uv - vec2(e, 0.0), 0.4);
    vec3 u = imgLod(uv - vec2(0.0, e), 0.4);
    vec3 ul = imgLod(uv - vec2(e, e), 0.4);
    float h = (2.0 + 4.0 * clamp(sizeP, 0.0, 1.0)) * px;
    float row = floor(gl_FragCoord.y / h);
    float k = 2.0 + 2.5 * clamp(audioSwell, 0.0, 1.0);
    float a = 0.12 * audioHarmAdvance + 0.03 * sceneTime;
    float w0 = exp(2.2 * sin(0.37 * row + a * 1.0 + 0.0));
    float w1 = exp(2.2 * sin(0.53 * row + a * 1.3 + 1.3));
    float w2 = exp(2.2 * sin(0.29 * row + a * 0.7 + 2.6));
    float w3 = exp(2.2 * sin(0.61 * row + a * 1.1 + 3.9));
    float w4 = exp(2.2 * sin(0.43 * row + a * 0.9 + 5.2));
    float ws = w0 + w1 + w2 + w3 + w4;
    vec3 r1 = 0.5 + k * (c - l);
    vec3 r2 = 0.5 + k * (c - u);
    vec3 r3 = 0.5 + k * (c - 0.5 * (l + u));
    vec3 r4 = 0.5 + k * (c - paeth(l, u, ul));
    vec3 col = (w0 * c + w1 * r1 + w2 * r2 + w3 * r3 + w4 * r4) / ws;
    finish(clamp(col, 0.0, 1.0) * 1.1);
}
