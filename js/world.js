import {writeNBT,gzip,listTag} from './nbt.js';
import {writeZip} from './zip.js';

const ia=(value,type)=>({__nbtType:type,value});
const floor=(n,d)=>Math.floor(n/d);
const key=(x,z)=>`${x},${z}`;

function packLongs(values,bits){
  const perLong=Math.floor(64/bits),out=new Array(Math.ceil(values.length/perLong)).fill(0n),mask=(1n<<BigInt(bits))-1n;
  for(let index=0;index<values.length;index++){
    const word=Math.floor(index/perLong),shift=(index%perLong)*bits;
    out[word]|=(BigInt(values[index])&mask)<<BigInt(shift);
  }
  return out.map(value=>BigInt.asIntN(64,value));
}

function uuid(i){return ia([(0x40000000+i)|0,0,(0x80000000|(i*1103515245))|0,i|0],11)}

function itemStack(variant){return {id:variant.baseItem,count:1,components:variant.components||{}}}

function cloneEntity(source,origin,variant,serial){
  const original=source.nbt||source, id=original.id||source.id;
  if(!id)return null;
  const local=source.pos||source.Pos||original.Pos||[0,0,0];
  const pos=[origin[0]+Number(local[0]),origin[1]+Number(local[1]),origin[2]+Number(local[2])];
  const entity={...original,id,Pos:pos,UUID:uuid(serial)};
  for(const name of ['Air','OnGround','Invisible','Invulnerable','Fixed','Facing','ItemRotation']){
    if(name in entity)entity[name]=ia(Number(entity[name]),1);
  }
  if('ItemDropChance' in entity)entity.ItemDropChance=ia(Number(entity.ItemDropChance),5);
  if(original.block_pos||original.blockPos||source.blockPos||source.block_pos){
    entity.block_pos=ia([Math.floor(pos[0]),Math.floor(pos[1]),Math.floor(pos[2])],11);
  }
  if(/item_frame|glow_item_frame$/.test(id)&&variant){
    entity.Item=itemStack(variant);
    entity.Fixed=ia(1,1);
  }
  if(id==='minecraft:armor_stand'&&variant){
    const stack=itemStack(variant);
    entity.HandItems=[stack,stack];
    entity.ArmorItems=[{}, {}, {}, stack];
  }
  return entity;
}

function chunkNBT(cx,cz,blocks){
  const grouped=new Map();
  for(const block of blocks){const sy=floor(block.y,16);if(!grouped.has(sy))grouped.set(sy,[]);grouped.get(sy).push(block)}
  const sections=[];
  for(const [sy,items] of grouped){
    const palette=[{Name:'minecraft:air'}], lookup=new Map([[JSON.stringify(palette[0]),0]]), values=new Array(4096).fill(0);
    for(const block of items){
      const state=block.block||{Name:'minecraft:stone'}, fingerprint=JSON.stringify(state);
      let index=lookup.get(fingerprint);
      if(index===undefined){index=palette.length;palette.push(state);lookup.set(fingerprint,index)}
      values[(block.x&15)+(block.z&15)*16+(block.y&15)*256]=index;
    }
    const bits=Math.max(4,Math.ceil(Math.log2(palette.length)));
    sections.push({Y:sy,block_states:{palette,data:ia(packLongs(values,bits),12)},biomes:{palette:['minecraft:plains']}});
  }
  return {
    DataVersion:4325,xPos:cx,zPos:cz,yPos:-4,Status:'minecraft:full',sections,
    block_entities:listTag(10,[]),
    Heightmaps:{MOTION_BLOCKING:ia(new Array(36).fill(0),12),WORLD_SURFACE:ia(new Array(36).fill(0),12)},
    isLightOn:ia(0,1),InhabitedTime:0n,structures:{starts:{},references:{}},
    PostProcessing:listTag(9,new Array(24).fill(listTag(3,[]))),
    block_ticks:listTag(10,[]),fluid_ticks:listTag(10,[])
  };
}

async function region(chunks){
  const records=new Map();let sector=2,now=Math.floor(Date.now()/1000);
  for(const [chunkKey,nbt] of chunks){
    const compressed=await gzip(writeNBT(nbt)),payload=new Uint8Array(5+compressed.length);
    new DataView(payload.buffer).setUint32(0,compressed.length+1);payload[4]=1;payload.set(compressed,5);
    const count=Math.ceil(payload.length/4096),data=new Uint8Array(count*4096);data.set(payload);
    records.set(chunkKey,{sector,count,data});sector+=count;
  }
  const header=new Uint8Array(8192),view=new DataView(header.buffer);
  for(const [chunkKey,record] of records){const [x,z]=chunkKey.split(',').map(Number),index=(x&31)+(z&31)*32;view.setUint32(index*4,(record.sector<<8)|record.count);view.setUint32(4096+index*4,now)}
  return new Uint8Array([...(Array.from(header)),...([...records.values()].flatMap(record=>Array.from(record.data)))]);
}

export async function generateWorld(template,variants,settings,onProgress=()=>{}){
  const blocks=new Map(),entities=new Map(),slots=template.slots.length;
  const groups=(settings.groups&&settings.groups.length?settings.groups:[{id:'all',title:'All',variants}]).filter(group=>group.variants?.length);
  const count=groups.reduce((total,group)=>total+Math.ceil(group.variants.length/slots),0),spacingZ=template.size[2],lineSpacingX=template.size[0]+4;
  let serial=1;
  let complete=0;
  for(let groupIndex=0;groupIndex<groups.length;groupIndex++){
    const group=groups[groupIndex],groupSections=Math.ceil(group.variants.length/slots);
    for(let section=0;section<groupSections;section++){
      const ox=groupIndex*lineSpacingX,oz=section*spacingZ;
      for(const source of template.blocks){const p=source.pos||source.Position,x=ox+p[0],y=100+p[1],z=oz+p[2];blocks.set(`${x},${z},${y}`,{x,y,z,block:template.palette[source.state||0]})}
      for(const source of template.entities){const slot=template.slots.indexOf(source),variant=slot>=0?group.variants[section*slots+slot]:null;if(slot>=0&&!variant)continue;const entity=cloneEntity(source,[ox,100,oz],variant,serial++);if(!entity)continue;const cx=floor(entity.Pos[0],16),cz=floor(entity.Pos[2],16);if(!entities.has(key(cx,cz)))entities.set(key(cx,cz),[]);entities.get(key(cx,cz)).push(entity)}
      complete++;onProgress(.1+.55*complete/count,`Building ${group.title} ${section+1}/${groupSections}`);await new Promise(resolve=>setTimeout(resolve,0));
    }
  }
  const chunks=new Map(),entityChunks=new Map();
  for(const block of blocks.values()){const cx=floor(block.x,16),cz=floor(block.z,16),rk=key(floor(cx,32),floor(cz,32));if(!chunks.has(rk))chunks.set(rk,new Map());if(!chunks.get(rk).has(key(cx,cz)))chunks.get(rk).set(key(cx,cz),[]);chunks.get(rk).get(key(cx,cz)).push(block)}
  for(const [rk,chunkMap] of chunks){for(const [ck,items] of chunkMap){const [cx,cz]=ck.split(',').map(Number);chunkMap.set(ck,chunkNBT(cx,cz,items))}}
  for(const [ck,list] of entities){const [cx,cz]=ck.split(',').map(Number),rk=key(floor(cx,32),floor(cz,32));if(!entityChunks.has(rk))entityChunks.set(rk,new Map());entityChunks.get(rk).set(ck,{DataVersion:4325,Entities:list})}
  const files=[];
  for(const [rk,map] of chunks){const [rx,rz]=rk.split(',');files.push({name:`region/r.${rx}.${rz}.mca`,data:await region(map)})}
  for(const [rk,map] of entityChunks){const [rx,rz]=rk.split(',');files.push({name:`entities/r.${rx}.${rz}.mca`,data:await region(map)})}
  onProgress(.82,'Writing level.dat');
  const level={Data:{DataVersion:4325,version:19133,LevelName:settings.name,GameType:1,hardcore:0,Difficulty:0,SpawnX:2,SpawnY:108,SpawnZ:2,Time:6000n,LastPlayed:BigInt(Date.now()),generatorName:'flat',generatorVersion:1,WorldGenSettings:{bonus_chest:false,seed:1n,dimensions:{'minecraft:overworld':{type:'minecraft:overworld',generator:{type:'minecraft:flat',settings:{layers:[{block:{Name:'minecraft:bedrock'},height:1},{block:{Name:'minecraft:dirt'},height:2},{block:{Name:'minecraft:grass_block'},height:1}],biome:'minecraft:plains',lakes:false,features:false}}}}},GameRules:{doDaylightCycle:'false',doWeatherCycle:'false',doMobSpawning:'false'}}};
  files.push({name:'level.dat',data:await gzip(writeNBT(level))});
  const root=(settings.name||'Custom Item Gallery').replace(/[\\/:*?"<>|]/g,' ').trim().replace(/\s+/g,'_')||'CustomItemGallery';
  const archiveFiles=files.map(file=>({...file,name:`${root}/${file.name}`}));onProgress(1,'Done');return {zip:writeZip(archiveFiles),sections:count,files:archiveFiles};
}
