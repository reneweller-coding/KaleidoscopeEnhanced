#ifndef GENPROC_H
#define GENPROC_H

#include <QtOpenGL/QGLWidget>
#include <QtCore/QTime>
#include <QtCore/QThread>

#include "mesh.h"

#include "EffectShader.h"
#include "TextureEffectKaleidoscopeBase.h"
#include "Utils.h"

class ImageLoader;

class FilterShader
{
public:
	FilterShader( );
	FilterShader(int width, int height, const QString &filename);
	~FilterShader();
	void loadShader(); // load shader from file, compile and link them to programs, get variable locations
	bool loadObj(const char *filename);
	void paint(const float *rotMatrix, float tx, float ty, float tz); // draw scene
	void reinit(int width, int height); // initialization stuff and computation of the distance field
	void checkGLErrors( const char *label ); // check and print gl errors to stderr

	
	void init( const QString &filename, unsigned int timeTextureSoloMin, unsigned int timeTextureSoloMax, unsigned int timeTextureInterpolationMin, unsigned int timeTextureInterpolationMax );

	
	void start( int width, int height );
	void stop();

	void addCombineShader( EffectShader * shader );
	void addTextureShader( EffectShader * shader );

    
    bool        m_triggerImageload;
    bool        m_waitForImageToLoad;
    QImage      m_nextImage;

    
	QStringList 	m_imageList;
	QStringList::const_iterator m_imageListIterator;

private:

	void initFBO(GLuint &fboEffect, GLuint &texIDEffect); // initialization of framebuffer object
	void createFBOTexture( GLuint &texID );
	void setupFBOTexture( const GLuint texID );
	void createTexture();  // create and setup textures
	void setupTexture( const GLuint texID, const QImage &image ); // needed by createTextures()
	void initGLSL(); // initialize GLSL - shader programs
	void drawScene(const float *rotMatrix, float tx, float ty, float tz);
	void drawWindow();
	void cleanShaderPrograms();
	void cleanTextures();

	bool checkFramebufferStatus(); // framebuffer status to stdout

	void traverse( const QString& dirname, QStringList& imageList );
	void loadNewTexture( GLuint &texID );


	Mesh			*m_mesh;


	bool			m_npot_supported; // non power of two textures supportet (or not)
	unsigned int	m_width; // texture width
	unsigned int	m_height; // texture height

	GLenum			m_texInternalFormat; // internal format of texture
	GLenum			m_texFormat;
	GLenum			m_texType;
	GLuint			m_fboEffectTexture1; // variable to store framebuffer object id
	GLuint			m_fboEffectTexture2; // variable to store framebuffer object id
	GLuint			m_fboEffectCombine1; // variable to store framebuffer object id
	GLuint			m_fboEffectCombine2; // variable to store framebuffer object id
	GLuint			m_depthFbo;
	GLenum			m_attachmentpoint; // where to attack framebufferobjects
	GLuint			m_texID1; // texture ids of read/write Textures
	GLuint			m_texID2;
	GLuint			m_texIDFBOEffectTexture1;
	GLuint			m_texIDFBOEffectTexture2;
	GLuint			m_texIDFBOEffectCombine1;
	GLuint			m_texIDFBOEffectCombine2;

	// GLSL vars

		// time since initialization
	QTime m_time;

	unsigned int m_maxIterationsEffectSearch; //maximum number of iterations during search for next effect



	//Combination of FBOs
	GLuint			m_sh_prog_id_combine;
	GLuint			m_texPointCombineUni1;
	GLuint			m_texPointCombineUni2;
	GLuint			m_texSizeRcpCombineUni;
	GLuint			m_timeCombineUni;
    GLuint			m_interpolationCombineUni;


    float			m_interpolationCombine; //Between 0 and 1

	
	QTime		m_timeTexture;
	float       m_timeTextureSolo;
	float		m_timeTextureInterpolation;
	float		m_interpolationTexture;
	unsigned int		m_stateTexture;
	unsigned int		m_timeTextureInterpolationMin;
	unsigned int		m_timeTextureInterpolationMax;
	unsigned int		m_timeTextureSoloMin;
	unsigned int		m_timeTextureSoloMax;
	GLuint      m_actTex;
	GLuint		m_nextTex;
	int			m_state;

    float       m_lastTime;
	float		m_globaltime;


	QTime		m_timeEffectTexture;
	unsigned int	m_stateInterpolationEffectTexture;
	float		m_interpolationEffectTexture;
	float		m_timeInterpolationEffectTexture;
	
	//EffectShader *m_effectTextures[NR_EFFECTS_TEXTURE];
	//unsigned int  m_effectTextureMinTimeSolo[NR_EFFECTS_TEXTURE];
	//unsigned int  m_effectTextureMaxTimeSolo[NR_EFFECTS_TEXTURE];
	//unsigned int  m_effectTextureMinTimeInterpolation[NR_EFFECTS_TEXTURE];
	//unsigned int  m_effectTextureMaxTimeInterpolation[NR_EFFECTS_TEXTURE];

	std::vector<EffectShader *> m_effectTextures;


	unsigned int m_effectTextureTimeInterpolation;
	//unsigned int m_effectTextureMinTimeInterpolation;
	//unsigned int m_effectTextureMaxTimeInterpolation;

	unsigned int  m_actEffectTexture;
	unsigned int  m_nextEffectTexture;


	
	QTime		m_timeEffectCombine;
	unsigned int	m_stateInterpolationEffectCombine;
	float		m_interpolationEffectCombine;
	float		m_timeInterpolationEffectCombine;

	
	std::vector<EffectShader *> m_effectCombines;
	

	unsigned int m_effectCombineTimeInterpolation;
	//unsigned int m_effectCombineMinTimeInterpolation;
	//unsigned int m_effectCombineMaxTimeInterpolation;

	unsigned int  m_actEffectCombine;
	unsigned int  m_nextEffectCombine;

	NanoTimer	m_nanotimer; //debug
	unsigned int m_nrTextureUploads;

	QString		m_imageDirectory;

	ImageLoader	*m_imageLoader;
};


class ImageLoader : public QThread
{
public:
    explicit ImageLoader( FilterShader *shader );
    //explicit Writer(const QString& mark) : mark_(mark) {}
 
    void run();
private:
    FilterShader *m_shader;

};

#endif