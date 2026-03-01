import pandas as pd, json

df1=pd.read_csv('top100_routes.csv')
df2=pd.read_csv('top100_routes 2.csv')
print('df1', df1.shape)
print('df2', df2.shape)
print('unique ranks', df1['rank'].nunique(), df2['rank'].nunique())
common=set(df1['rank']) & set(df2['rank'])
print('common ranks count', len(common))

pairs1=set(zip(df1.origin_lat,df1.origin_lon,df1.dest_lat,df1.dest_lon))
pairs2=set(zip(df2.origin_lat,df2.origin_lon,df2.dest_lat,df2.dest_lon))
print('pairs1',len(pairs1),'pairs2',len(pairs2),'intersection',len(pairs1&pairs2),'diff',len(pairs2-pairs1))

with open('busy_roads.json') as f:
    data=json.load(f)
print('json len',len(data))
pairs_json=set((r['origin'][0],r['origin'][1],r['destination'][0],r['destination'][1]) for r in data)
print('json intersect df2', len(pairs_json & pairs2))
