#version 120
// PhysarumDeposit.frag — additive pheromone deposit: species A into R,
// species B into G (blending is GL_ONE/GL_ONE, set host-side).

uniform float depositAmt;

varying float vSpecies;

void main()
{
    gl_FragColor = vec4(depositAmt * (1.0 - vSpecies),
                        depositAmt * vSpecies, 0.0, 1.0);
}
