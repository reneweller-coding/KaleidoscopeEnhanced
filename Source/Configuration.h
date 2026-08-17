#ifndef CONFIGURATION_H
#define CONFIGURATION_H

#include <QtGui/qopengl.h>
#include <QtCore/QElapsedTimer>
#include <QtCore/QThread>

#include <QtXml/QDomDocument>
#include <QtXml/QDomElement>
#include <QtXml/QDomNodeList>

#include "stdinc.h"
#include "Uniform.h"
#include "FilterShader.h"

//Basic Class for Configuration
class Configuration
{
public:
	Configuration( const QString &configurationFile );
	~Configuration( );

	QString getConfigurationName() { return m_configurationName; };
	// hidden="true" on the root element: a master/reference or test-bench
	// preset that must not appear in the user-facing selection (menu, digit
	// keys, web remote, auto-config).  Still loadable via -c <name>.
	bool isHidden() const { return m_hidden; }
	void start( int width, int height );
	void stop();

	FilterShader *m_filterShader;

private:
	
	void readConfiguration( const QString &filename );
	void addUniforms( EffectShader *shader, QDomElement &el );

	QString m_imageDirectory;
	QString m_configurationName;
	bool    m_hidden = false;

	unsigned int		m_timeTextureInterpolationMin;
	unsigned int		m_timeTextureInterpolationMax;
	unsigned int		m_timeTextureSoloMin;
	unsigned int		m_timeTextureSoloMax;

};


#endif