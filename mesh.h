#ifndef SIMPLEMESH_H
#define SIMPLEMESH_H

#include <vector>
#include <QtGui/QImage>

#include "Vector3D.h"


class Mesh {
	struct Triangle 
	{
		Triangle( int *vi, int *ti, int *ni) 
		  { memcpy(v,vi,3*sizeof(int)); memcpy(t,ti,3*sizeof(int)); memcpy(n,ni,3*sizeof(int)); }
		int v[3];	// indices of the vertices
		int t[3];	// indices of the texture coordinates
		int n[3];	// indices of the normals
	};

	struct MaterialNode
	{
		MaterialNode() { alpha = 1.0; textureIndex = -1; }
		MaterialNode(int texIdx) : textureIndex(texIdx) {
			setAmbientColor(); setDiffuseColor(); setSpecularColor(); }
		void setAmbientColor( float r = 0, float g = 0, float b = 0) { ambient[0] = r; ambient[1] = g; ambient[2] = b; }
		void setDiffuseColor( float r = 0, float g = 0, float b = 0) { diffuse[0] = r; diffuse[1] = g; diffuse[2] = b; }
		void setSpecularColor( float r = 0, float g = 0, float b = 0) { specular[0] = r; specular[1] = g; specular[2] = b; }
		char m_name[1024];
		float shininess;
		float ambient[3];
		float diffuse[3];
		float specular[3];
		float alpha;
		int textureIndex; // i-th TextureNode
	};

	struct TextureNode
	{
		TextureNode() { qImageTexture = 0; textureId = 0; texname[0] = '\0'; }
		~TextureNode() { delete qImageTexture; }
		QImage *qImageTexture;
		GLuint textureId;
		char texname[256];
	};
 
	struct MeshPartInfo
	{
		MeshPartInfo() { fromFace = toFace = materialIndex = -1; }
		MeshPartInfo(int from, int to) : fromFace(from), toFace(to), materialIndex(-1) { }
		int fromFace, toFace;
		int materialIndex;
	};

public:
	Mesh(const char *filename) { readObj(filename); }  
	~Mesh() { clear(); }

	void draw();
	void loadTextureImages();
	void assignTexture(char *filename);
	bool success() { return meshRead; }
	void generateSphereTexCoords();
	void generateCylinderTexCoords();

	//Number of vertices and number of faces
	int numV() { return static_cast<int>(vertices.size()); }
	int numT() { return static_cast<int>(triangles.size()); }

	Vector3D bmin, bmax;  //bounding box

private:

	std::vector<Vector3D> vertices;
	std::vector<Vector3D> normals;
	std::vector<Vector3D> textcoords;
	std::vector<Triangle> triangles;
	std::vector<TextureNode> textures;
	void clear();
	void correctTheta(float multp);

	std::vector<MeshPartInfo*> meshPartInfo;
	std::vector<MaterialNode*> materialList;

	void readObj( const char* sFilename);
	void loadMaterials( const char* sFilename);
	void computeBoundingBox();
	bool loadTexture(QImage &qimg, GLuint &textureId, const char *filename);
	int getTextureNode(char *filename);
	void replaceFilename(char *tgt, const char *src, const char *newName);
	bool meshRead;
	bool objTexAvail;
};

#endif // SIMPLEMESH_H
