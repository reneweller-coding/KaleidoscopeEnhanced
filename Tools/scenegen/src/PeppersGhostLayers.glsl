//@doc
 * @brief PEPPERS GHOST LAYERS: panes of clear glass standing at different angles before the eye, each catching the
 * reflection of a picture lit from the side while letting through what lies behind it -- several images hang over
 * each other like ghosts, coming and going as the panes tilt.  Optics: a pane reflects by Fresnel's law, little
 * when seen face-on and much when seen at a grazing angle (Schlick: R0 + (1 - R0)(1 - cos)^5, R0 = 0.04 for glass),
 * and passes the rest; three panes in a row each add their reflection and dim what is behind.  The pictures are the
 * photo and the photo before it, turned and scaled in each pane's own frame, in one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the panes tilt back and forth (integrated): the ghosts come and go
 *   audioSwell   -> the side light on the pictures grows
 *
 * Knobs: tiltP (how far the panes tilt), ghostP (how bright the reflections are), hueP.
//@params tiltP ghostP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float tiltK = 0.5 + 0.7 * clamp(tiltP, 0.0, 1.0);
    float ghostK = 1.5 + 1.5 * clamp(ghostP, 0.0, 1.0);
    float side = 0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float ph = 0.04 * sceneTime + 0.2 * audioAdvance;
    // the far wall behind all panes: the photo, dim
    vec3 back = imgLod(p * 0.55 + 0.5, 2.0);
    vec3 col = famCol(fh, 0.3 + 0.4 * luma(back)) * (0.1 + 0.4 * luma(back));
    // three panes, nearest last: each dims what is behind and adds its own reflection
    for (int i = 0; i < 3; ++i) {
        float fi = float(i);
        float a = tiltK * sin(ph * (0.7 + 0.25 * fi) + 2.1 * fi);   // the pane's tilt about its vertical axis
        // the view ray against the pane: its angle grows toward the side the pane turns away to
        vec3 nrm = normalize(vec3(sin(a), 0.15 * sin(1.3 * a + fi), cos(a)));
        vec3 view = normalize(vec3(p * 0.9, 1.0));
        float cosI = abs(dot(view, nrm));
        float R = 0.04 + 0.96 * pow(1.0 - cosI, 5.0);
        R = clamp(0.12 + R * ghostK * 4.0, 0.0, 0.85);
        // the reflected picture in the pane's frame: turned, scaled, the photo before for the middle pane
        vec2 q = rot2(0.6 * a + 1.3 * fi) * (p - vec2(0.45 * sin(a), 0.1 * fi)) * (0.8 + 0.45 * fi) + 0.5;
        vec3 pic = i == 1 ? imgB(q, 0.8) : imgLod(q, 0.8);
        vec3 refl = famCol(fh, 0.2 + 0.25 * fi + 0.3 * luma(pic)) * (0.1 + 1.6 * pow(luma(pic), 1.4)) * side;
        col = col * (1.0 - R) + refl * R;
        // the pane's edge: a thin bright line where the glass is seen edge-on
        float edgeX = 0.95 * cos(a) - 0.05 * fi;
        col += famLight(fh, 0.6, 0.6) * exp(-pow((abs(p.x) - edgeX) / 0.003, 2.0)) * 0.12 * (1.0 - cosI);
    }
    finish(col);
}
