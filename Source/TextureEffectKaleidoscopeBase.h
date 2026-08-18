/**
 * @file TextureEffectKaleidoscopeBase.h
 * @brief Base class for the kaleidoscope/tunnel family of EffectShader subclasses: adds
 *        the shared "power" (zoom-recursion) and rotation-interpolation state driving
 *        Kaleidoscope.frag and its Tunnel/TunnelReverse descendants.
 */
#ifndef TEXTURE_EFFECT_KALEIDOSCOPE_BASE_H
#define TEXTURE_EFFECT_KALEIDOSCOPE_BASE_H

#include <QtGui/qopengl.h>
#include <string>
#include "coreclock.h"
#include "EffectShader.h"


/**
 * @brief EffectShader subclass driving Kaleidoscope.frag's mirrored-segment/power/rotation look.
 *
 * Adds the "sides" (mirror segment count), "power" (per-iteration zoom-recursion
 * exponent) and rotation-interpolation uniforms on top of EffectShader's common
 * ones. Power is driven by its own 4-state state machine (m_statePower: full /
 * decreasing / no-power / increasing) advanced every setUniforms() call against
 * a WallClock (m_timePower), independent of the base class's solo/interpolation
 * timing. The (m_stateRotation-driven) continuous-rotation state machine is
 * present but its body is fully commented out in setUniforms() - only the
 * power state machine and the flip-flop m_interpolationRotation reset in
 * resetParameters() are currently active. TextureEffectTunnel and
 * TextureEffectTunnelReverse derive from this class to add tunnel-specific
 * scroll-speed uniforms on top.
 */
class TextureEffectKaleidoscopeBase : public EffectShader
{
public:
	/**
	 * @brief Construct with an explicit fragment shader file and timing ranges.
	 * @param filename Path to the fragment shader source this effect compiles.
	 * @param minTimeSolo Minimum seconds this effect stays solo once activated.
	 * @param maxTimeSolo Maximum seconds this effect stays solo once activated.
	 * @param minTimeInterpolation Minimum seconds spent cross-fading into/out of this effect.
	 * @param maxTimeInterpolation Maximum seconds spent cross-fading into/out of this effect.
	 */
	TextureEffectKaleidoscopeBase( const std::string &filename, unsigned int  minTimeSolo, unsigned int  maxTimeSolo, unsigned int  minTimeInterpolation, unsigned int  maxTimeInterpolation );
	/**
	 * @brief Construct with timing ranges only; uses the fixed default fragment shader "..\\Scene2D\\Kaleidoscope.frag".
	 * @param minTimeSolo Minimum seconds this effect stays solo once activated.
	 * @param maxTimeSolo Maximum seconds this effect stays solo once activated.
	 * @param minTimeInterpolation Minimum seconds spent cross-fading into/out of this effect.
	 * @param maxTimeInterpolation Maximum seconds spent cross-fading into/out of this effect.
	 */
	TextureEffectKaleidoscopeBase( unsigned int  minTimeSolo, unsigned int  maxTimeSolo, unsigned int  minTimeInterpolation, unsigned int  maxTimeInterpolation );
	/// Destructor. No extra cleanup beyond the EffectShader base.
	~TextureEffectKaleidoscopeBase();


	/**
	 * @brief Resolves this class's extra uniform locations (interpolationRotation, power) after chaining to EffectShader::initUniforms().
	 * @param width Render target width in pixels.
	 * @param height Render target height in pixels.
	 */
	virtual void initUniforms(int width, int height); // initialize GLSL - shader programs
	/**
	 * @brief Advances the power state machine and uploads interpolationRotation/power, after chaining to EffectShader::setUniforms().
	 * @param time Absolute animation time in seconds.
	 * @param interpolation Current cross-fade weight.
	 * @param texLoc1 Texture unit bound to the `tex0` sampler.
	 * @param texLoc2 Texture unit bound to the `tex1` sampler.
	 */
	virtual void setUniforms( float time, float interpolation, GLint texLoc1, GLint texLoc2 ); // setting uniforms
	/**
	 * @brief Re-rolls speed and sides, and flips m_interpolationRotation between 0 and pi/4, after chaining to EffectShader::resetParameters().
	 */
	virtual void resetParameters();

protected:

    GLint       m_interpolationRotationUni; ///< Location of the `interpolationRotation` uniform.
    GLint		m_speedUni; ///< Location of the `speed` uniform. NOTE: never resolved (initUniforms doesn't query it) and its upload is commented out in setUniforms() - currently dead.
    GLint       m_powerUni; ///< Location of the `power` uniform.
	GLint		m_sidesUni; ///< Location of the `sides` uniform. NOTE: never resolved (initUniforms doesn't query it) and its upload is commented out in setUniforms() - currently dead.



	WallClock m_timeRotation; ///< Stopwatch driving the (currently disabled) continuous-rotation state machine in setUniforms().
    float           m_timeSoloRotation; ///< Rotation state machine: current "solo" (no interpolation) phase duration.
    float           m_timeInterpolationRotation; ///< Rotation state machine: current interpolation phase duration.
    float           m_interpolationRotation; ///< Current interpolationRotation uniform value, uploaded every frame.
    float           m_deltaRotation; ///< Rotation state machine: per-tick increment applied to m_interpolationRotation while active.
    unsigned int    m_timeSoloRotationMin; ///< Lower bound for rolling m_timeSoloRotation.
    unsigned int    m_timeSoloRotationMax; ///< Upper bound for rolling m_timeSoloRotation.
    unsigned int    m_timeInterpolationRotationMin; ///< Lower bound for rolling m_timeInterpolationRotation.
    unsigned int    m_timeInterpolationRotationMax; ///< Upper bound for rolling m_timeInterpolationRotation.
    float           m_speedRotationMin; ///< Lower bound for rolling m_deltaRotation.
    float           m_speedRotationMax; ///< Upper bound for rolling m_deltaRotation.
	unsigned int	m_stateRotation; ///< Rotation state machine phase (0=full/1=decreasing/2=none/3=increasing); machine body is commented out in setUniforms(), so this stays at its constructed value (2).


    float			m_speed; ///< Rolled base animation speed (kaleidoscope pattern speed), re-rolled by resetParameters(). Not currently uploaded by this class (m_speedUni is unused here).
    float			m_speedAct; ///< Active speed value derived from m_speed. Not currently uploaded by this class.
    float			m_speedMin; ///< Lower bound for rolling m_speed.
    float			m_speedMax; ///< Upper bound for rolling m_speed.
    float			m_speedKaleidoscope; ///< Unused rolled speed variant (never assigned outside its declaration).
    float			m_speedKaleidoscopeAct; ///< Unused active speed variant (never assigned outside its declaration).
    float			m_speedKaleidoscopeMin; ///< Unused lower bound (never assigned outside its declaration).
    float			m_speedKaleidoscopeMax; ///< Unused upper bound (never assigned outside its declaration).

	WallClock m_timePower; ///< Stopwatch driving the power state machine in setUniforms().
    unsigned int    m_statePower; ///< Power state machine phase: 0=full power hold, 1=decreasing, 2=no-power hold, 3=increasing.
    float           m_timeSoloPower; ///< Power state machine: current hold-phase duration (full or no-power, depending on which hold phase rolled it).
    float           m_timeInterpolationPower; ///< Power state machine: current ramp (increasing/decreasing) phase duration.
    float           m_interpolationPower; ///< Current power uniform value, uploaded every frame; ramps between m_powerMin and m_power.
    unsigned int    m_timeSoloPowerFullMin; ///< Lower bound for rolling m_timeSoloPower during the full-power hold phase.
    unsigned int    m_timeSoloPowerFullMax; ///< Upper bound for rolling m_timeSoloPower during the full-power hold phase.
    unsigned int    m_timeSoloPowerNoMin; ///< Lower bound for rolling m_timeSoloPower during the no-power hold phase.
    unsigned int    m_timeSoloPowerNoMax; ///< Upper bound for rolling m_timeSoloPower during the no-power hold phase.
    unsigned int    m_timeInterpolationPowerMin; ///< Lower bound for rolling m_timeInterpolationPower.
    unsigned int    m_timeInterpolationPowerMax; ///< Upper bound for rolling m_timeInterpolationPower.

    float           m_power; ///< Target power value rolled when entering the full-power hold phase; the ramp phases interpolate m_interpolationPower towards/from this.
    float           m_powerMin; ///< Lower bound of the power range (also the "no power" baseline value).
    float           m_powerMax; ///< Upper bound for rolling m_power.
    float           m_powerProbability; ///< Probability that a full-power activation instead stays at m_powerMin with rotation enabled (see m_powerRotationAllowed).
    bool            m_powerRotationAllowed; ///< Whether the (disabled) rotation state machine is currently permitted to accumulate m_interpolationRotation; set by the power state machine's roll.

	float			m_sides; ///< Rolled mirror-segment count, range [m_minSides, m_minSides+m_maxSides). NOTE: the `sides` uniform upload is currently commented out in setUniforms(), so this value is not actually reaching the shader from this class.
	unsigned int	m_maxSides; ///< Range width added to m_minSides when rolling m_sides.
	unsigned int	m_minSides; ///< Lower bound for rolling m_sides.

};


#endif