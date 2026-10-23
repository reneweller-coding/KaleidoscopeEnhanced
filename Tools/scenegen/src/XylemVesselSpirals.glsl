//@doc
 * @brief XYLEM VESSEL SPIRALS: water-conducting vessels with ring and spiral thickenings: tubes in longitudinal section, each with a wall spiral of its own; the photo flows as sap through the tubes.  Every tube is shaded like a cylinder, the wall thickening is a slanted band (its pitch differs from tube to
 * tube), and the photo runs through each tube at its own speed.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the pitch of the spirals glides with the key (integrated)
 *   audioAdvance     -> the sap flows (integrated)
 *
 * Knobs: sizeP (the number of tubes), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
void main()
{
    vec2 q = gl_FragCoord.xy / resolution;
    float asp = resolution.x / resolution.y;
    float N = 6.0 + 8.0 * clamp(sizeP, 0.0, 1.0);
    float k = floor(q.x * N);
    float fx = fract(q.x * N);
    float h = hash21(vec2(k, 2.0));
    float flow = (0.02 + 0.03 * h) * (0.5 * audioAdvance + 0.7 * sceneTime) * (mod(k, 2.0) < 0.5 ? 1.0 : -1.0);
    float pitch = (10.0 + 14.0 * h) * (1.0 + 0.2 * sin(0.04 * audioHarmAdvance + 0.02 * sceneTime + k));
    float y = q.y * pitch + (fx - 0.5) * 3.0;
    float wall = smoothstep(0.55, 0.7, 0.5 + 0.5 * cos(6.2831853 * y));
    float cyl = sqrt(max(1.0 - pow(2.0 * fx - 1.0, 2.0), 0.0));
    vec2 uv = vec2((q.x - 0.5) * asp, q.y - 0.5 + flow);
    vec3 c = imgLod(uv * 0.85 + 0.5 + vec2(0.0, 0.0), 0.6);
    vec3 sap = c * (0.35 + 0.8 * cyl);
    vec3 thick = vec3(0.45, 0.32, 0.2) * (0.4 + 0.6 * cyl) + c * 0.2;
    vec3 col = mix(sap, thick, wall * 0.85);
    float edge = smoothstep(0.0, 0.06, fx) * (1.0 - smoothstep(0.94, 1.0, fx));
    finish(col * (0.2 + 0.8 * edge) * 1.25);
}
