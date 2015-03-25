#include <float.h>

#include "shader_setup.h"
#include "TextureEffectKaleidoscopeBase.h"

#include <QtGui/QImageReader>
#include <QtCore/qdir.h>
#include <QtCore/qfileinfo.h>

#include<GL/GLU.h>

// Constructor
TextureEffectKaleidoscopeBase::TextureEffectKaleidoscopeBase( unsigned int  minTimeSolo, unsigned int  maxTimeSolo, unsigned int  minTimeInterpolation, unsigned int  maxTimeInterpolation ): 
EffectShader( minTimeSolo, maxTimeSolo, minTimeInterpolation, maxTimeInterpolation )
, m_minSides(2)
, m_maxSides(14)
, m_timeSoloRotation(20.0)
, m_timeInterpolationRotation(10.0)
, m_interpolationRotation(0.0)
, m_deltaRotation(0.002)
, m_timeSoloRotationMin(240)
, m_timeSoloRotationMax(600)
, m_timeInterpolationRotationMin(40)
, m_timeInterpolationRotationMax(60)
, m_stateRotation(2)
, m_speedRotationMin(-0.001)//(0.0005)
, m_speedRotationMax(0.001)
, m_speedAct(0.01)
, m_speed(0.02)
, m_speedMin(0.02)//-0.02
, m_speedMax(0.09)//0.4
, m_sides(8.0)
, m_power( 1.01 )
, m_powerMin( 1.0000001 )
, m_powerMax( 4.01 )
, m_powerProbability( 0.05 )//0.15
, m_powerRotationAllowed( false )
, m_statePower(2)
, m_timeSoloPower(10.0)
, m_timeInterpolationPower(30.0)
, m_interpolationPower(1.01)
, m_timeSoloPowerFullMin(30)
, m_timeSoloPowerFullMax(320)
, m_timeSoloPowerNoMin(10)
, m_timeSoloPowerNoMax(20)
, m_timeInterpolationPowerMin(30)
, m_timeInterpolationPowerMax(60)
{
	m_vertexShaderFilename = "..\\standard.vert";
	m_fragmentShaderFilename = "..\\Kaleidoscope.frag";

	m_sides = (float) ( (qrand() % m_maxSides) + m_minSides);

	m_interpolationPower = m_power;

	m_timePower.start();
    m_timeRotation.start();
}



// Constructor
TextureEffectKaleidoscopeBase::TextureEffectKaleidoscopeBase( const QString &filename, unsigned int minTimeSolo, unsigned int  maxTimeSolo, unsigned int  minTimeInterpolation, unsigned int  maxTimeInterpolation ): 
EffectShader( minTimeSolo, maxTimeSolo, minTimeInterpolation, maxTimeInterpolation )
, m_minSides(2)
, m_maxSides(14)
, m_timeSoloRotation(20.0)
, m_timeInterpolationRotation(10.0)
, m_interpolationRotation(0.0)
, m_deltaRotation(0.002)
, m_timeSoloRotationMin(240)
, m_timeSoloRotationMax(600)
, m_timeInterpolationRotationMin(40)
, m_timeInterpolationRotationMax(60)
, m_stateRotation(2)
, m_speedRotationMin(-0.001)//(0.0005)
, m_speedRotationMax(0.001)
, m_speedAct(0.01)
, m_speed(0.02)
, m_speedMin(0.02)//-0.02
, m_speedMax(0.09)//0.4
, m_sides(8.0)
, m_power( 1.01 )
, m_powerMin( 1.0000001 )
, m_powerMax( 4.01 )
, m_powerProbability( 0.05 )//0.15
, m_powerRotationAllowed( false )
, m_statePower(2)
, m_timeSoloPower(10.0)
, m_timeInterpolationPower(30.0)
, m_interpolationPower(1.01)
, m_timeSoloPowerFullMin(30)
, m_timeSoloPowerFullMax(320)
, m_timeSoloPowerNoMin(10)
, m_timeSoloPowerNoMax(20)
, m_timeInterpolationPowerMin(30)
, m_timeInterpolationPowerMax(60)
{
	m_vertexShaderFilename = "..\\standard.vert";

	QByteArray ba = filename.toLocal8Bit();
	//const char* name = ba.data();//toAscii().constData();*/

	m_fragmentShaderFilename = (char *) malloc(sizeof(char)*(filename.size()+1) );
	sprintf( m_fragmentShaderFilename, "%s\0", ba.data() );

	//m_fragmentShaderFilename = ba.data();//filename.toLocal8Bit().data();

	m_sides = (float) ( (qrand() % m_maxSides) + m_minSides);

	m_interpolationPower = m_power;

	m_timePower.start();
    m_timeRotation.start();
}


// Destructor
TextureEffectKaleidoscopeBase::~TextureEffectKaleidoscopeBase()
{
}

void TextureEffectKaleidoscopeBase::setUniforms( float time, float interpolation, GLint texLoc1, GLint texLoc2 )
{
	EffectShader::setUniforms( time, interpolation, texLoc1, texLoc2 );
/*************************Rotation*******************************************************/
    //State Machine for Rotating the 
    //Rotation
    /*if( m_stateRotation == 0 )
	{
        if( m_powerRotationAllowed )
            m_interpolationRotation += m_deltaRotation;

		float ts = float(m_timeRotation.elapsed()) * 0.001;
		if( ts > m_timeSoloRotation )
		{
			m_stateRotation = 1;
			m_timeRotation.start();
		}
	}
    //Decreasing
	else if( m_stateRotation == 1 )
	{
		float ts = float(m_timeRotation.elapsed()) * 0.001;
		
        if( m_powerRotationAllowed )
		    m_interpolationRotation += m_deltaRotation * (1.0 - ts/m_timeInterpolationRotation);

		if( ts > m_timeInterpolationRotation )
		{
			m_stateRotation = 2;
			m_timeRotation.start();
		}
	}
    //No Rotation
    else if( m_stateRotation == 2 )
	{
		float ts = float(m_timeRotation.elapsed()) * 0.001;
		if( ts > m_timeSoloRotation )
		{
			m_stateRotation = 3;
			m_timeRotation.start();
            
            //qsrand(QTime::currentTime().msec());
            m_timeSoloRotation = (float) (m_timeSoloRotationMin + (qrand() % (m_timeSoloRotationMax - m_timeSoloRotationMin)));

            //qsrand(QTime::currentTime().msec());
            if( m_powerRotationAllowed )
                m_deltaRotation = m_speedRotationMin +  ((float)qrand() / (float) RAND_MAX) * ( m_speedRotationMax - m_speedRotationMin ) ;
            else
                m_deltaRotation = 0.0;

		}
	}
    //Inreasing
    else if( m_stateRotation == 3 )
	{
		float ts = float(m_timeRotation.elapsed()) * 0.001;
		
        if( m_powerRotationAllowed )
            m_interpolationRotation += m_deltaRotation * (ts/m_timeInterpolationRotation);

		if( ts > m_timeInterpolationRotation )
		{
			m_stateRotation = 0;
			m_timeRotation.start();

            //qsrand(QTime::currentTime().msec());
            m_timeInterpolationRotation = (float) (m_timeInterpolationRotationMin + (qrand() % (m_timeInterpolationRotationMax - m_timeInterpolationRotationMin)));
		}
	}*/

/*************************Power*******************************************************/
    //State Machine for Interpolating the power of the 
    //Full Power
    if( m_statePower == 0 )
	{
		float ts = float(m_timePower.elapsed()) * 0.001;
		if( ts > m_timeSoloPower )
		{
			m_statePower = 1;
			m_timePower.start();
            
            m_timeSoloPower = (float) (m_timeSoloPowerNoMin + (qrand() % (m_timeSoloPowerNoMax - m_timeSoloPowerNoMin)));
		}
	}
    //Decreasing
	else if( m_statePower == 1 )
	{
		float ts = float(m_timePower.elapsed()) * 0.001;
		m_interpolationPower = m_powerMin + (m_power - m_powerMin) * (1.0 - ts/m_timeInterpolationPower);

		if( ts > m_timeInterpolationPower )
		{
			m_statePower = 2;
			m_timePower.start();
		}
	}
    //No Power
    else if( m_statePower == 2 )
	{
		float ts = float(m_timePower.elapsed()) * 0.001;
		if( ts > m_timeSoloPower )
		{
			m_statePower = 3;
			m_timePower.start();
            
            m_timeSoloPower = (float) (m_timeSoloPowerFullMin + (qrand() % (m_timeSoloPowerFullMax - m_timeSoloPowerFullMin)));

			m_power = (float) (m_powerMin + (((float)qrand() / (float) RAND_MAX) * (m_powerMax - m_powerMin)));
			m_powerRotationAllowed = false;
            float pTp = ((float)qrand() / (float) RAND_MAX);
            if( pTp < m_powerProbability )
            {
                m_powerRotationAllowed = false;
            }
            else
            {
                m_powerRotationAllowed = true; //set true to enable rotation during  effect
                m_power = m_powerMin;
            }
		}
	}
    //Inreasing
    else if( m_statePower == 3 )
	{
		float ts = float(m_timePower.elapsed()) * 0.001;
		
        m_interpolationPower = m_powerMin + (m_power - m_powerMin) * (ts/m_timeInterpolationPower);

		if( ts > m_timeInterpolationPower )
		{
			m_statePower = 0;
			m_timePower.start();

            m_timeInterpolationPower = (float) (m_timeInterpolationPowerMin + (qrand() % (m_timeInterpolationPowerMax - m_timeInterpolationPowerMin)));
		    
        }
	}

    glUniform1f( m_interpolationRotationUni, m_interpolationRotation );
    //glUniform1f( m_speedUni, m_speedAct );
	//glUniform1f( m_sidesUni, m_sides );
    glUniform1f( m_powerUni, m_interpolationPower );
}


/**
 * Sets up the GLSL runtime and creates shader.
 */
void TextureEffectKaleidoscopeBase::initUniforms(int width, int height)
{	
	EffectShader::initUniforms(width, height);
	
	m_interpolationRotationUni = glGetUniformLocation( m_sh_prog_id, "interpolationRotation" );
    //m_sidesUni = glGetUniformLocation( m_sh_prog_id, "sides" );
    //m_speedUni = glGetUniformLocation( m_sh_prog_id, "speed" );
    m_powerUni = glGetUniformLocation( m_sh_prog_id, "power" );

	checkGLErrors("loadShader 2");
}

void TextureEffectKaleidoscopeBase::resetParameters()
{
	EffectShader::resetParameters();

	m_speed = (float) (m_speedMin + (((float)qrand() / (float) RAND_MAX) * (m_speedMax - m_speedMin)));
	if( fabs( m_speed ) < EPSILON )
		m_speed = EPSILON;
	m_speedAct = m_speed;

    float pR = ((float)qrand() / (float) RAND_MAX);
    if( pR > 0.4 )
        m_interpolationRotation = 0.0;
    else
        m_interpolationRotation = M_PI/4.0;


	m_sides = (float) ((qrand() % m_maxSides)  + m_minSides);
}