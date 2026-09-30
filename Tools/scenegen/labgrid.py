import sys
from PIL import Image
n=int(sys.argv[1]); pre=sys.argv[2] if len(sys.argv)>2 else 'lab'
g=Image.new('RGB',(4*400,((n+3)//4)*225))
for i in range(n): g.paste(Image.open('quick/%s_%d.png'%(pre,i)).resize((400,225)),((i%4)*400,(i//4)*225))
g.save('quick/grid.png')
