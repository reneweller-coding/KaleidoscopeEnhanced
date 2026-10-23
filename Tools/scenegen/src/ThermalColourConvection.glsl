//@doc
 * @brief THERMAL COLOUR CONVECTION: warm colours rise and cool ones sink: the colour temperature of the photo drives
 * convection rolls in which the picture climbs and falls in plumes -- the warm parts drawn up along one side of every roll, the
 * cool parts down along the other, with a slow drift of the rolls themselves.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> how many rolls
 *   audioSwell      -> the speed and the reach of the plumes
 *   audioAdvance    -> the rolls' drift (integrated)
 *
 * Knobs: rollsP (the base number of rolls), plumeP (the plumes' reach), hueP.
//@params rollsP plumeP
//@audio audioSpread audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.5 + 3.0 * audioAdvance;
    float k = 6.2831853 * (1.2 + 1.8 * clamp(rollsP, 0.0, 1.0)) * (0.9 + 0.2 * clamp(audioSpread, 0.0, 1.0));
    float A = 0.07 * (0.5 + 1.0 * clamp(plumeP, 0.0, 1.0)) * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    vec2 q = uv;
    for (int i = 0; i < 3; ++i) {
        vec3 c = imgLod(q, 2.0);
        float temp = clamp(c.r - c.b + 0.5 * (c.g - c.b), -1.0, 1.0);
        vec2 vel = vec2(sin(k * q.x * 0.5 + 0.2 * t) * cos(k * q.y * 0.5), -cos(k * q.x * 0.5 + 0.2 * t) * sin(k * q.y * 0.5));
        q = uv + A * (vel * 0.4 + vec2(0.0, temp * cos(k * 0.5 * q.x + 0.2 * t)));
    }
    finish(imgLod(q, 0.4) * 1.05);
}
