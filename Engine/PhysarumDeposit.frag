#version 330 core
/**
 * @file PhysarumDeposit.frag
 * @brief Deposits one Physarum agent's pheromone trail into the trail map as a point/sprite draw.
 *
 * Fragment stage of a point-sprite draw call, one draw per agent population;
 * vSpecies (0 or 1, interpolated from the vertex stage) selects whether the
 * deposit lands in the R channel (species A) or G channel (species B),
 * scaled by depositAmt. Relies on host-side additive blending (GL_ONE,
 * GL_ONE) so repeated deposits accumulate in the trail texture rather than
 * overwrite it; a later diffuse/decay compute or fragment pass presumably
 * reads this trail map to steer agent movement and fade old trails.
 */
out vec4 fragColor;

uniform float depositAmt;

in float vSpecies;

void main()
{
    fragColor = vec4(depositAmt * (1.0 - vSpecies),
                        depositAmt * vSpecies, 0.0, 1.0);
}
