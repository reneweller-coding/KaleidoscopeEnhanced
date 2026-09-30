import random, sys
random.seed(int(sys.argv[1])); n=int(sys.argv[2])
for i in range(n):
    v=[round(random.random(),3) for _ in range(4)]; st=round(random.random(),2); pal=round(random.random(),2)
    print("chainAP=%s chainBP=%s chainCP=%s chainDP=%s styleP=%s speedP=0.5 detailP=0.7 paletteP=%s"%(v[0],v[1],v[2],v[3],st,pal))
