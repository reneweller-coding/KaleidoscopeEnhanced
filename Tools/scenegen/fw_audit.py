import glob,os,sys
for f in sorted(glob.glob(sys.argv[1])):
    L=open(f,encoding='utf-8',errors='ignore').read().split('\n'); hits=[]
    for i,l in enumerate(L):
        if 'fwidth' not in l and 'dFdx' not in l and 'dFdy' not in l: continue
        ind=len(l)-len(l.lstrip()); cur=ind
        for j in range(i-1,-1,-1):
            s=L[j].strip()
            if not s: continue
            indj=len(L[j])-len(L[j].lstrip())
            if indj==cur and s.startswith('if') and ('continue' in s or 'break' in s): hits.append((i+1,s[:50])); break
            if indj<cur:
                if s.startswith(('for','while')): cur=indj
                elif s.startswith(('if','else','} else')): hits.append((i+1,s[:50])); break
                else: cur=indj
            if s.startswith('void main') or (indj==0 and s.endswith(')')): break
    if hits: print(os.path.basename(f), hits)
