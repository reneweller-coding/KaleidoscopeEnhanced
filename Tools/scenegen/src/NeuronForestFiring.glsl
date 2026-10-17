//@doc
 * @brief NEURON FOREST FIRING: a forest of neurons -- cell bodies with branching dendrites reaching out to their
 * neighbours -- through which waves of firing run: an excitable medium on the state pass, where a firing cell sets
 * its neighbours firing and then rests, refractory, so the activity travels in rings and spirals across the forest.
 * Every onset in the music fires a volley somewhere; the neurons light up as the wave passes through them, their
 * dendrites glowing from the body outward.  The photo colours the cells.
 *
 * Audio Reactivity (structure, not only light):
 *   audioOnset      -> each onset fires a volley at a new place (on the state pass)
 *   audioSwell      -> the waves run faster
 *   audioKick       -> the firing cells flash (light)
 *
 * Knobs: densityP (how many neurons), branchP (how far the dendrites reach), photoP (photo share), hueP.
//@params densityP branchP photoP
//@audio audioOnset audioSwell audioKick
//@state 160 90 30
//@body
/**  One step of the excitable medium (the state pass): resting cells fire when enough neighbours fire (or when an
 * onset strikes near them), firing cells decay through a refractory tail.
 *
 * @return
 *   The excitation (r: 1 firing .. 0 resting), the refractory phase (g), 0, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) return vec4(stRand(0) < 0.01 ? 1.0 : 0.0, 0.0, 0.0, 1.0);
    vec4 s = stAt(ip);
    float exc = s.r, refr = s.g;
    float sum = 0.0;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) if (i != 0 || j != 0) sum += step(0.6, stAt(ip + ivec2(i, j)).r);
    float thresh = mix(2.6, 1.6, clamp(audioSwell, 0.0, 1.0));
    // an onset fires a volley: a small disc round a place that moves on with every onset
    float strike = 0.0;
    if (clamp(audioOnset, 0.0, 1.0) > 0.5) {
        vec2 c = vec2(hash11(floor(stateFrame / 6.0) * 1.3), hash11(floor(stateFrame / 6.0) * 2.7 + 0.4)) * stateRes;
        strike = step(length(vec2(ip) - c), 2.5);
    }
    if (refr > 0.0) {
        refr = max(refr - 0.06, 0.0);
        exc *= 0.7;
    } else if ((sum >= thresh && stRand(1) < 0.8) || strike > 0.5) {
        exc = 1.0;
        refr = 1.0;
    } else {
        exc *= 0.7;
    }
    if (stRand(2) < 0.00002) { exc = 1.0; refr = 1.0; }        // a rare spontaneous spike keeps the forest alive
    return vec4(exc, refr, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float S = 0.085 - 0.03 * clamp(densityP, 0.0, 1.0);
    float reach = 0.7 + 0.5 * clamp(branchP, 0.0, 1.0);
    vec2 cell = floor(p / S);
    vec3 tone = imgPalette(0.6 + 0.03 * audioPhase);
    vec3 col = imgLod(p * 0.35 + 0.5, 4.5) * 0.1 + tone * 0.02;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 cc = cell + vec2(float(i), float(j));
        vec2 hh = hash22(cc);
        vec2 soma = (cc + 0.5 + 0.5 * (hh - 0.5)) * S;
        float exc = stLin(stView(soma, 1.0)).r;
        // the dendrites: five branches, each bending twice, from the body outward
        float dmin = 1e9, along = 0.0;
        for (int b = 0; b < 5; ++b) {
            float a = 6.2831853 * (float(b) + hh.x) / 5.0;
            vec2 q0 = soma;
            float seg = S * 0.3 * reach;
            for (int k = 0; k < 3; ++k) {
                a += (hash11(hh.y * 31.0 + float(b * 3 + k)) - 0.5) * 1.2;
                vec2 q1 = q0 + seg * vec2(cos(a), sin(a));
                float d = sdSeg(p, q0, q1) - 0.0018 * (3.0 - float(k));
                if (d < dmin) { dmin = d; along = (float(k) + 0.5) / 3.0; }
                q0 = q1;
                seg *= 0.8;
            }
        }
        float body = length(p - soma) - S * 0.09;
        vec3 photo = imgLod(soma * 0.55 + 0.5, 1.0);
        vec3 cn = mix(tone * 1.2, photo * 1.5, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0));
        // the firing glows from the body out along the dendrites
        float lit = exc * smoothstep(1.0, 0.0, along - exc * 0.6);
        vec3 glowC = mix(cn, vec3(1.0), 0.5) * (0.3 + 1.6 * lit) * (1.0 + 0.6 * clamp(audioKick, 0.0, 1.0) * exc);
        col = mix(col, cn * 0.35 + glowC * 0.5, smoothstep(0.0015, 0.0, dmin));
        col = mix(col, cn * 0.5 + glowC * 0.7, smoothstep(0.002, 0.0, body));
        col += glowC * exp(-max(body, 0.0) / (S * 0.12)) * 0.15 * exc;
    }
    finish(col * 1.1);
}
