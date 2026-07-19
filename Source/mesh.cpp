// Program from Stephan Mock 324612 and Randolf Sch�rfig 327639
// modifiziert von cg.in.tu-clausthal

#include <QtGui/qopengl.h>
#include <GL/gl.h>


#include <float.h>
#include "mesh.h"
using namespace std;

/* Draw the mesh using smooth or flat normals accordingly to the parameter */
void Mesh::draw() {
	bool normalsAvailable = (0 < normals.size());
	bool texcoordsAvailable = false;
	//glPolygonMode(GL_FRONT_AND_BACK,GL_LINE);
	if(normalsAvailable)
	{
		glEnable(GL_LIGHTING);
	} else {
		glDisable(GL_LIGHTING);
	}

	for(unsigned int mesh_Counter = 0; mesh_Counter < meshPartInfo.size(); mesh_Counter++)
	{
		glDisable(GL_TEXTURE_2D);	
		// assign material
		int matidx = meshPartInfo[mesh_Counter]->materialIndex;
		if(matidx >= 0) { // if materials available
			texcoordsAvailable = (textcoords.size() > 0);
			glMaterialfv(GL_FRONT, GL_AMBIENT, materialList[matidx]->ambient);
			glMaterialfv(GL_FRONT, GL_DIFFUSE, materialList[matidx]->diffuse);
			glMaterialfv(GL_FRONT, GL_SPECULAR, materialList[matidx]->specular);
			glMaterialfv(GL_FRONT, GL_SHININESS, &(materialList[matidx]->shininess));
			// bind texture
			//if(materialList[matidx]->textureIndex >=0 )
			//{
			//	int texidx = materialList[matidx]->textureIndex;
			//	glEnable(GL_TEXTURE_2D);
			//	int texid = textures[texidx].textureId;
			//	glBindTexture(GL_TEXTURE_2D,textures[texidx].textureId);
			//}
		} else {
			glColor3f(0.1f, 0.1f, 0.1f);
		}
		int from = meshPartInfo[mesh_Counter]->fromFace;
		int to = meshPartInfo[mesh_Counter]->toFace;
		glBegin( GL_TRIANGLES );
		for (int face_Counter = from; face_Counter < to; face_Counter++) 
		{
			Triangle &triangle = triangles[face_Counter];
			for ( int j = 0; j < 3; j++)
			{
				Vector3D &vertex = vertices[triangle.v[j]]; 
				if(texcoordsAvailable) 
				{
					Vector3D &texcoord = textcoords[triangle.t[j]];
					glTexCoord2f(texcoord.x,texcoord.y);
				}
				if(normalsAvailable)
				{
					Vector3D &normal = normals[triangle.n[j]];
					glNormal3f(normal.x, normal.y, normal.z);
				}
				glVertex3f(vertex.x, vertex.y, vertex.z);
			}
		}
		glEnd();	
	}
}  


void Mesh::clear() {
	vertices.clear();
	normals.clear();
	textcoords.clear();
	triangles.clear();
	textures.clear();

	for(unsigned int i = 0; i < meshPartInfo.size(); i++)
		delete meshPartInfo[i];
	for(unsigned int i = 0; i < materialList.size(); i++)
		delete materialList[i];

	meshPartInfo.clear();
	materialList.clear();

	bmin = Vector3D(FLT_MAX, FLT_MAX, FLT_MAX);
	bmax = Vector3D(-FLT_MAX, -FLT_MAX, -FLT_MAX);
}


void Mesh::loadMaterials( const char* sFilename)
{

	char ac_line[256];
	char texname[256];
	std::ifstream istr_in( sFilename );
	if ( !istr_in.is_open() )
	{
		std::cerr << "could not read " << sFilename << std::endl;
	}

	MaterialNode *matnode = NULL;

	std::cerr << " reading Materials " << sFilename << std::endl;	
	while( istr_in && ( !istr_in.eof() ) && istr_in.getline( ac_line, 256 ) )
	{
		float   ar, ag, ab, sr, sg, sb, rr, dr, dg, db;
		float   refractiveIndex, shininess;
		// comment
		if ( ac_line[0] == '#' ) continue;

		//Load Material File
		if ( strncmp(ac_line, "newmtl ", 7 ) == 0 )
		{
			char matname[1024];
			if ( sscanf( ac_line, "newmtl %s", matname ) )
			{
				//Put Last material to the MaterialList
				if( matnode != NULL )
				{
					materialList.push_back( matnode );
				}

				//Create new Shader
				matnode = new MaterialNode;
				strcpy( matnode->m_name, matname );
			}
		}
		else if ( strncmp(ac_line, "Ns ", 3 ) == 0 )
		{ 
			sscanf( ac_line, "Ns %f", &shininess );
			if ( matnode != NULL )
				matnode->shininess = shininess;
		}
		else if ( strncmp(ac_line, "Ka ", 3 ) == 0 )
		{ 
			sscanf( ac_line, "Ka %f %f %f", &ar, &ag, &ab );
			if ( matnode != NULL )
				matnode->setAmbientColor( ar, ag, ab );
		}
		else if ( strncmp(ac_line, "Kd ", 3 ) == 0 )
		{ 
			sscanf( ac_line, "Kd %f %f %f", &dr, &dg, &db );
			if ( matnode != NULL )
				matnode->setDiffuseColor(  dr, dg, db );
		}
		else if ( strncmp(ac_line, "Ks ", 3 ) == 0 )
		{ 
			sscanf( ac_line, "Ks %f %f %f", &sr, &sg, &sb );
			if ( matnode != NULL )
				matnode->setSpecularColor( sr, sg, sb );
		}
		else if ( strncmp(ac_line, "Ni ", 3 ) == 0 )
		{ 
			sscanf( ac_line, "Ni %f", &refractiveIndex );
		}
		else if ( strncmp(ac_line, "map_Kd ", 7 ) == 0 )
		{ 
			sscanf( ac_line, "map_Kd %s", texname );
			char textureFilename[256];
			replaceFilename(textureFilename,sFilename,texname);
			matnode->textureIndex = getTextureNode(textureFilename);
		}

		else if ( ( strncmp(ac_line, "Tr ", 3 ) == 0 ) )
		{ 
			//Warning: We simply use transparency for refractive color
			//if refractive index != 1.0 && no transparency => set refractive color to 1.0
			sscanf( ac_line, "Tr %f", &rr );
			if ( matnode != NULL )
				matnode->alpha = rr;
		}
		//Alternative version of alpha value
		else if ( ( strncmp(ac_line, "d ", 2 ) == 0 ) )
		{ 
			//Warning: We simply use transparency for refractive color
			sscanf( ac_line, "d %f", &rr );
			if ( matnode != NULL )
				matnode->alpha = rr;
		}
	}

	//Not to forget to add the last Shader to the MaterialList
	if( matnode != NULL )
		materialList.push_back( matnode );
}

int Mesh::getTextureNode(char *filename)
{
	int idx = -1;
	for(unsigned int tc = 0; tc < textures.size(); tc++)
	{
		if(!strcmp(textures[tc].texname,filename))
		{
			idx = tc;
		}
	}
	if(idx < 0) // not yet known texture image
	{
		TextureNode texnode;
		texnode.qImageTexture = 0;
		texnode.textureId = 0;
		strcpy(texnode.texname,filename);
		idx = static_cast<int>(textures.size());
		textures.push_back(texnode);
	}
	return idx;
}

void Mesh::readObj( const char* sFilename)
{
	this->clear();

	char ac_line[256];

	std::ifstream istr_in( sFilename );
	if ( !istr_in.is_open() )
	{
		std::cerr << "could not read " << sFilename << std::endl;
		meshRead = false;
	}
	meshRead = true;
	unsigned int vertexcounter = 0;
	unsigned int texcoordcounter = 0;
	unsigned int facecounter = 0;
	std::cerr << " reading " << sFilename << std::endl;	
	while( istr_in && ( !istr_in.eof() ) && istr_in.getline( ac_line, 256 ) )
	{
		// comment
		if ( ac_line[0] == '#' ) continue;

		// vertex
		else if ( strncmp(ac_line, "v ", 2 ) == 0 )
		{
			vertexcounter++;
		}
		else if ( strncmp(ac_line, "vt ", 2 ) == 0 )
		{
			texcoordcounter++;
		}
		// face
		else if ( strncmp( ac_line, "f ", 2) == 0)
		{
			int	i3VI[4] = {0, 0, 0, 0};
			int	i3TI[4] = {0, 0, 0, 0};
			int	i3NI[4] = {0, 0, 0, 0};
			//Quadrangel: add 2 triangles
			if ( 12 == sscanf( ac_line, "f %d//%d//%d %d//%d//%d %d//%d//%d %d//%d//%d", &i3VI[0], &i3TI[0], &i3NI[0], 
				&i3VI[1], &i3TI[1], &i3NI[1], 
				&i3VI[2], &i3TI[2], &i3NI[2],
				&i3VI[3], &i3TI[3], &i3NI[3] ) )
			{			
				facecounter++;					
			}
			else if ( 8 == sscanf( ac_line, "f %d//%d %d//%d %d//%d %d//%d", &i3VI[0], &i3NI[0], 
				&i3VI[1], &i3NI[1], 
				&i3VI[2], &i3NI[2],
				&i3VI[3], &i3NI[3] ) )
			{						
				facecounter++;		
			}
			else if ( 8 == sscanf( ac_line, "f %d/%d %d/%d %d/%d %d/%d", &i3VI[0], &i3NI[0], 
				&i3VI[1], &i3NI[1], 
				&i3VI[2], &i3NI[2],
				&i3VI[3], &i3NI[3] ) )
			{								
				facecounter++;
			}
			else if ( 4 == sscanf( ac_line, "f %d %d %d %d", &i3VI[0], &i3VI[1], &i3VI[2], &i3VI[3] ) )
			{
				facecounter++;
			}

			facecounter++;
		}
	}

	istr_in.close();


	unsigned int ui_normals_created = 0;
	unsigned int actFace = 0;

	std::list<MaterialNode> materialNodes;
	materialNodes.clear();

	vertices.reserve( vertexcounter );
	normals.reserve( vertexcounter );
	textcoords.reserve( texcoordcounter );
	triangles.reserve( facecounter );

	std::ifstream istr2_in( sFilename );

	MeshPartInfo *mpi = 0;

	while( istr2_in && ( !istr2_in.eof() ) && istr2_in.getline( ac_line, 256 ) )
	{

		// comment
		if ( ac_line[0] == '#' ) continue;

		//Load Material File
		if ( strncmp(ac_line, "mtllib ", 7 ) == 0 )
		{
			char filename[1024];
			if ( sscanf( ac_line, "mtllib %s", filename ) )
			{
				char newname[256];
				replaceFilename(newname,sFilename,filename);
				loadMaterials( newname);
			}
		}	

		//New Material => push New Material to material List 
		if ( strncmp(ac_line, "usemtl ", 7 ) == 0 )
		{
			if ( mpi != NULL )
			{
				mpi->toFace = actFace;
				meshPartInfo.push_back(mpi);
			}

			mpi = new MeshPartInfo();
			mpi->fromFace = actFace;


			bool foundmaterial = false;

			char matname[1024];
			if ( sscanf( ac_line, "usemtl %s", matname ) )
			{
				for( unsigned int m_Counter = 0; m_Counter < materialList.size(); ++m_Counter )
				{
					if ( !strncmp( matname, materialList[m_Counter]->m_name, strlen( matname ) ) )
					{
						mpi->materialIndex = m_Counter;
						foundmaterial = true;
						break;
					}
				}
			}
			if( !foundmaterial )
			{
				delete mpi;
				mpi = NULL;
			}
		}

		// vertex
		else if ( strncmp(ac_line, "v ", 2 ) == 0 )
		{
			float fX, fY, fZ;
			if ( sscanf( ac_line, "v %f %f %f", &fX, &fY, &fZ ) )
			{
				vertices.push_back( Vector3D( fX, fY, fZ ) );
			}
		}
		// vertex normals
		else if ( strncmp( ac_line, "vn ", 3 ) == 0 )
		{
			float fN1, fN2, fN3;
			if ( sscanf( ac_line, "vn %f %f %f", &fN1, &fN2, &fN3 ) )
			{
				normals.push_back( Vector3D( fN1, fN2, fN3 ) );
			}
		}
		// vertex normals
		else if ( strncmp( ac_line, "vt ", 3 ) == 0 )
		{
			float fT1 = 0, fT2 = 0;
			if ( sscanf( ac_line, "vt %f %f", &fT1, &fT2) )
			{
				textcoords.push_back( Vector3D( fT1, 1.0f-fT2, 0.0f ) );

			}
		}
		// face
		else if ( strncmp( ac_line, "f ", 2) == 0)
		{
			int	i3VI[4] = {0, 0, 0, -1};
			int	i3NI[4] = {0, 0, 0, -1};
			int i3TI[4] = {0, 0, 0, -1};

			//Quadrangel
			if ( 12 == sscanf( ac_line, "f %d//%d//%d %d//%d//%d %d//%d//%d %d//%d//%d", &i3VI[0], &i3TI[0], &i3NI[0], 
				&i3VI[1], &i3TI[1], &i3NI[1], 
				&i3VI[2], &i3TI[2], &i3NI[2],
				&i3VI[3], &i3TI[3], &i3NI[3] ) )
			{								
			}
			//Quadrangel
			else if ( 12 == sscanf( ac_line, "f %d/%d/%d %d/%d/%d %d/%d/%d %d/%d/%d", &i3VI[0], &i3TI[0], &i3NI[0], 
				&i3VI[1], &i3TI[1], &i3NI[1], 
				&i3VI[2], &i3TI[2], &i3NI[2],
				&i3VI[3], &i3TI[3], &i3NI[3] ) )
			{								
			}
			else if ( 9 == sscanf( ac_line, "f %d//%d//%d %d//%d/%d %d//%d//%d", &i3VI[0], &i3TI[0], &i3NI[0], 
				&i3VI[1], &i3TI[1], &i3NI[1], 
				&i3VI[2], &i3TI[2], &i3NI[2] ) )
			{								
			}
			else if ( 9 == sscanf( ac_line, "f %d/%d/%d %d/%d/%d %d/%d/%d", &i3VI[0], &i3TI[0], &i3NI[0], 
				&i3VI[1], &i3TI[1], &i3NI[1], 
				&i3VI[2], &i3TI[2], &i3NI[2] ) )
			{								
			}
			//Quadrangel
			else if ( 8 == sscanf( ac_line, "f %d//%d %d//%d %d//%d %d//%d", &i3VI[0], &i3NI[0], 
				&i3VI[1], &i3NI[1], 
				&i3VI[2], &i3NI[2],
				&i3VI[3], &i3NI[3] ) )
			{						
				++ui_normals_created;		
			}
			//Quadrangel
			else if ( 8 == sscanf( ac_line, "f %d/%d %d/%d %d/%d %d/%d", &i3VI[0], &i3NI[0], 
				&i3VI[1], &i3NI[1], 
				&i3VI[2], &i3NI[2],
				&i3VI[3], &i3NI[3] ) )
			{								
				++ui_normals_created;
			}
			else if ( 6 == sscanf( ac_line, "f %d//%d %d//%d %d//%d", &i3VI[0], &i3NI[0], 
				&i3VI[1], &i3NI[1], 
				&i3VI[2], &i3NI[2] ) )
			{
				++ui_normals_created;
			}
			else if ( 6 == sscanf( ac_line, "f %d/%d %d/%d %d/%d", &i3VI[0], &i3NI[0], 
				&i3VI[1], &i3NI[1], 
				&i3VI[2], &i3NI[2] ) )
			{
				++ui_normals_created;
			}
			//Quadrangel
			else if ( 4 == sscanf( ac_line, "f %d %d %d %d", &i3VI[0], &i3VI[1], &i3VI[2], &i3VI[3] ) )
			{
			}
			else if ( 3 == sscanf( ac_line, "f %d %d %d", &i3VI[0], &i3VI[1], &i3VI[2] ) )
			{
			}
			//obj-indices are 1-based
			i3VI[0] -= 1; i3VI[1] -= 1; i3VI[2] -= 1; i3VI[3] -= 1;
			i3NI[0] -= 1; i3NI[1] -= 1; i3NI[2] -= 1; i3NI[3] -= 1;
			i3TI[0] -= 1; i3TI[1] -= 1; i3TI[2] -= 1; i3TI[3] -= 1;
			triangles.push_back( Triangle( i3VI, i3TI, i3NI ) );

			//Quad-Case: Make second Triangle
			if ( i3VI[3] >= 0 )
			{
				int	i3V[3],	i3N[3], i3T[3];
				i3V[0] = i3VI[0]; i3V[1] = i3VI[2]; i3V[2] = i3VI[3];
				i3N[0] = i3NI[0]; i3N[1] = i3NI[2]; i3N[2] = i3NI[3];
				i3T[0] = i3TI[0]; i3T[1] = i3TI[2]; i3T[2] = i3TI[3];
				triangles.push_back( Triangle( i3V, i3T, i3N) );
				actFace++;
			}
			actFace++;
		}
	}

	if ( mpi != NULL )
	{
		mpi->toFace = actFace;
		meshPartInfo.push_back(mpi);
		objTexAvail = true;
	} else { // no materials available
		meshPartInfo.push_back(new MeshPartInfo(0,actFace)); // set one materialnode with invalid index
		objTexAvail = false;
	}

	istr2_in.close();

	std::cout << "vertices:        " << int(vertices.size()) << std::endl;
	std::cout << "normals:         " << int(normals.size()) << std::endl;
	std::cout << "texcoords:       " << int(textcoords.size()) << std::endl;
	std::cout << "normals created: " << ui_normals_created << std::endl;
	std::cout << "faces:           " << int(triangles.size()) << std::endl;

	computeBoundingBox();
	//std::cout << "min:   " << "(" << bmin.x << "," << bmin.y << ","bmin.z << ")" << std::endl;
	//std::cout << "max:   " << "(" << bmax.x << "," << bmax.y << ","bmax.z << ")" << std::endl;
}

void Mesh::computeBoundingBox()
{
	// compute bounding box
	bmin.x = bmin.y = bmin.z = FLT_MAX;
	bmax.x = bmax.y = bmax.z = -FLT_MAX;
	for ( unsigned int i = 0; i < vertices.size(); ++i )
	{
		if(vertices[i].x < bmin.x)
			bmin.x = vertices[i].x;
		if(vertices[i].y < bmin.y)
			bmin.y = vertices[i].y;

		if(vertices[i].z < bmin.z)
			bmin.z = vertices[i].z;

		if(vertices[i].x > bmax.x)
			bmax.x = vertices[i].x;
		if(vertices[i].y > bmax.y)
			bmax.y = vertices[i].y;
		if(vertices[i].z > bmax.z)
			bmax.z = vertices[i].z;
	}
}

void Mesh::replaceFilename(char *tgt, const char *src, const char *newName)
{
	strcpy(tgt,src);
	char *p = strrchr(tgt,'/');
	if ( NULL == p)
	{
		p = strrchr(tgt,'\\');
		if( NULL == p)
		{
			strcpy(tgt,newName);
		}
	}
	p++;
	strcpy(p,newName);
}

void Mesh::loadTextureImages()
{
	for(unsigned int tc = 0; tc < textures.size(); tc++)
	{
		if(NULL == textures[tc].qImageTexture)
		{
			textures[tc].qImageTexture = new QImage;
			loadTexture(*(textures[tc].qImageTexture),textures[tc].textureId,textures[tc].texname);
		}
	}
}

void Mesh::assignTexture(char *filename)
{
	if (!objTexAvail) // no textures already available from obj file
	{
		meshPartInfo[0]->materialIndex = 0;
		materialList.push_back(new MaterialNode(0));
		textures.push_back(TextureNode());
		textures[0].qImageTexture = new QImage;
		strcpy(textures[0].texname,filename);
		loadTexture(*(textures[0].qImageTexture),textures[0].textureId,textures[0].texname);
	}
}


bool Mesh::loadTexture(QImage &qimg, GLuint &textureId, const char *filename) 
{
	QImage img;
	if(!img.load(QString(filename))) {
		cerr << "Could not load image: " << filename << endl;
		return false;
	}
	QImage img2 =img.convertToFormat(QImage::Format_RGB32);
	qimg = img2.rgbSwapped();
	glGenTextures(1, &textureId);
	glBindTexture(GL_TEXTURE_2D, textureId);
	glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MIN_FILTER,GL_LINEAR);
	glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MAG_FILTER,GL_LINEAR);
	glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_S,GL_REPEAT);
	glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_T,GL_REPEAT);
	glTexImage2D(GL_TEXTURE_2D,
		0,                      //level
		GL_RGB8,                //internal format
		qimg.width(),			//width
		qimg.height(),			//height
		0,                      //border
		GL_RGBA,                //format
		GL_UNSIGNED_BYTE,       //type
		qimg.bits());			// pixel data

	return true;
}


// **********************
// ********* TODO *******
// **********************
// generate texture coordinates for all vertices
// store texture coordinates in  textcoords
// look in this->draw() for access to datastructure


void Mesh::generateSphereTexCoords()
{
	if(!objTexAvail)
	{
		float multp[2] = { 5.0, 5.0f };
		textcoords.clear();
		// generate Texture Coordinates through Spere Mapping
		Vector3D center((bmin+bmax)/2);
		textcoords.reserve(vertices.size());
		for(unsigned int i = 0; i < vertices.size(); i++)
		{
			float theta, phi;
			Vector3D delta = vertices[i] - center;
			delta.normalize();
			theta = atan2(delta.z,delta.x);
			theta = theta / (2*M_PI) + 0.5f;
			phi = acos(delta.y);
			phi = phi / M_PI;
			textcoords.push_back(Vector3D(multp[0] * theta,multp[1] * phi,0));
		}

		correctTheta(multp[0]);
	}
}


void Mesh::generateCylinderTexCoords()
{
	if(!objTexAvail)
	{
		float multp[2] = { 5.0, 10.0f };
		// generate Texture Coordinates throug Cylinder Mapping
		textcoords.clear();
		// generate Texture Coordinates through Spere Mapping
		Vector3D center((bmin+bmax)/2);
		float H = bmax.y-bmin.y;
		textcoords.reserve(vertices.size());
		for(unsigned int i = 0; i < vertices.size(); i++)
		{
			float theta, h;
			Vector3D delta(vertices[i].x - center.x,0,vertices[i].z-center.z);
			theta = atan2(delta.z,delta.x);
			theta = theta / (2*M_PI) + 0.5f;
			h = (vertices[i].y-bmin.y)/H;
			textcoords.push_back(Vector3D(multp[0] * theta,multp[1] * h,0));
		}

		correctTheta(multp[0]);
	}
}

void Mesh::correctTheta(float multp)
{
	Vector3D center((bmin+bmax)/2);

	// update triangle texture indices and
	// correct border cases, faces crossing the 0/1 texcoord border
	unsigned int texcoordCount = static_cast<unsigned int>(textcoords.size());
	for(unsigned int t = 0; t < triangles.size(); t++)
	{
		memcpy(triangles[t].t,triangles[t].v,sizeof(int)*3);
		Triangle &triangle = triangles[t];
		bool backVert = false, frontVert = false, leftVert = false;
		for ( int j = 0; j < 3; j++)
		{
			Vector3D &vertex = vertices[triangle.v[j]];
			Vector3D delta = vertex - center;
			if(delta.z < 0) backVert = true;
			if(delta.z >= 0) frontVert = true;
			if(delta.x < 0) leftVert = true;
		}
		if(backVert && frontVert && leftVert)
		{
			for ( int j = 0; j < 3; j++)
			{
				Vector3D &vertex = vertices[triangle.v[j]];
				Vector3D delta = vertex - center;
				if(delta.z < 0) {
					Vector3D newCoord(textcoords[triangle.t[j]]);
					newCoord.x += multp;
					textcoords.push_back(newCoord);
					triangle.t[j] = texcoordCount;
					texcoordCount++;
				}
			}
		}
	}
}
