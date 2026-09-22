import {readZip} from './zip.js';

const typeOf=node=>node?.type?.replace(/^minecraft:/,'')||('model' in (node||{})?'model':null);
const componentName=value=>String(value||'').replace(/^minecraft:/,'');
const DEFAULT_TRIM_PATTERN='minecraft:silence';
const isVanillaModel=node=>typeOf(node)==='model'&&typeof node.model==='string'&&node.model.startsWith('minecraft:');

function walk(node,constraints,leaves,path){
  if(!node||typeof node!=='object')return;
  if(!node.type&&node.model&&typeof node.model==='object')return walk(node.model,constraints,leaves,path+'.model');
  const type=typeOf(node);
  if(type==='model'){leaves.push({model:typeof node.model==='string'?node.model:node.path||'unknown:model',constraints:[...constraints],path});return}
  if(type==='composite'){for(let i=0;i<(node.models||node.children||[]).length;i++)walk((node.models||node.children)[i],constraints,leaves,`${path}.${i}`);return}
  if(type==='select'){
    const cases=node.cases||node.options||[];
    for(let i=0;i<cases.length;i++){
      const entry=cases[i],when=entry.when??entry.value??entry.match;
      const condition={kind:'equals',property:node.property,component:node.component,value:when};
      if(Array.isArray(when)){const name=componentName(node.component||node.property);if(name==='custom_name'||name==='display_name')walk(entry.model||entry,[...constraints,{...condition,value:when[0],aliases:when}],leaves,`${path}.${i}`);else for(const value of when)walk(entry.model||entry,[...constraints,{...condition,value}],leaves,`${path}.${i}`);}
      else walk(entry.model||entry,when===undefined?constraints:[...constraints,condition],leaves,`${path}.${i}`);
    }
    const rootFallback=path==='root'||path==='root.model';
    if(node.fallback&&(!rootFallback||!isVanillaModel(node.fallback)))walk(node.fallback,[...constraints,{kind:'fallback',property:node.property,component:node.component}],leaves,path+'.fallback');
    return;
  }
  if(type==='condition'){
    const property=node.property||node.condition,yes=node.on_true||node.true||node.model_true,no=node.on_false||node.false||node.model_false;
    if(yes)walk(yes,[...constraints,{kind:'equals',property,component:node.component,value:true}],leaves,path+'.true');
    if(no)walk(no,[...constraints,{kind:'equals',property,component:node.component,value:false}],leaves,path+'.false');
    return;
  }
  if(type==='range_dispatch'){
    const property=node.property||node.predicate;
    for(let i=0;i<(node.entries||node.ranges||[]).length;i++){
      const entry=(node.entries||node.ranges)[i],threshold=entry.threshold??entry.min;
      walk(entry.model||entry,threshold===undefined?constraints:[...constraints,{kind:'range',property,component:node.component,min:Number(threshold)}],leaves,`${path}.${i}`);
    }
    if(node.fallback)walk(node.fallback,constraints,leaves,path+'.fallback');
    return;
  }
  if(node.model)walk(node.model,constraints,leaves,path+'.model');
}

function componentFor(constraint){
  const name=componentName(constraint.component||constraint.property),value=constraint.value;
  if(!name||constraint.kind==='fallback')return null;
  if(name==='trim_material'&&value!==undefined)return {'minecraft:trim':{material:String(value),pattern:DEFAULT_TRIM_PATTERN}};
  if(name==='trim_pattern'&&value!==undefined)return {'minecraft:trim':{material:'minecraft:quartz',pattern:String(value)}};
  if(name==='custom_model_data'){
    const data={floats:[],flags:[],strings:[],colors:[]};
    if(value&&typeof value==='object')for(const key of Object.keys(data))if(Array.isArray(value[key]))data[key]=value[key];
    else if(constraint.kind==='range')data.floats=[Number(constraint.min)];
    else if(typeof value==='string')data.strings=[value];
    else if(typeof value==='boolean')data.flags=[value];
    else if(typeof value==='number')data.floats=[value];
    return {'minecraft:custom_model_data':data};
  }
  if(name==='custom_name'||name==='display_name')return value===undefined?null:{'minecraft:custom_name':{text:String(value)}};
  if(constraint.component&&value!==undefined)return {[constraint.component]:value};
  return null;
}

function collectProperties(node,usage,source){
  if(!node||typeof node!=='object')return;
  const property=node.property||node.predicate;
  if(property){const key=String(property);if(!usage.has(key))usage.set(key,{property:key,components:new Set(),definitions:new Set()});usage.get(key).definitions.add(source);if(node.component)usage.get(key).components.add(String(node.component))}
  if(node.component&&property){const key=String(property);if(!usage.has(key))usage.set(key,{property:key,components:new Set(),definitions:new Set()});usage.get(key).components.add(String(node.component))}
  for(const value of Object.values(node))if(value&&typeof value==='object')Array.isArray(value)?value.forEach(child=>collectProperties(child,usage,source)):collectProperties(value,usage,source);
}

export function analyseDefinitions(entries){
  const definitions=[],variants=[],warnings=[],propertyUsage=new Map();
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
    try{
      const json=JSON.parse(new TextDecoder().decode(entry.data)),parts=entry.name.split('/'),namespace=parts[1],relative=parts.slice(3).join('/').replace(/\.json$/,''),baseItem=`${namespace}:${relative}`;collectProperties(json,propertyUsage,entry.name);
      const leaves=[];walk(json,[],leaves,'root');if(!leaves.length)throw Error('No reachable model leaves');
      definitions.push({path:entry.name,baseItem,item:json});
      for(let index=0;index<leaves.length;index++){
        const leaf=leaves[index],components={};
        for(const constraint of leaf.constraints){const value=componentFor(constraint);if(value)Object.assign(components,value)}
        const comparison={...components};delete comparison['minecraft:custom_name'];
        const fingerprint=JSON.stringify([baseItem,leaf.model,comparison]);
        const existing=variants.find(item=>item.fingerprint===fingerprint);
        if(existing){if(leaf.constraints.some(constraint=>constraint.aliases))existing.metadata.aliases=[...(existing.metadata.aliases||[]),...leaf.constraints.find(constraint=>constraint.aliases).aliases.slice(1)];continue}
        variants.push({baseItem,sourceDefinition:entry.name,model:leaf.model,components,metadata:{variant:index+1,path:leaf.path,aliases:leaf.constraints.find(constraint=>constraint.aliases)?.aliases?.slice(1)||[]},fingerprint,supported:true});
      }
    }catch(error){warnings.push({file:entry.name,reason:error.message})}
  }
  const properties=[...propertyUsage.values()].map(item=>({property:item.property,components:[...item.components].sort(),definitions:[...item.definitions].sort()})).sort((a,b)=>a.property.localeCompare(b.property));
  return {definitions,variants,warnings,properties};
}

export async function analysePack(buffer){
  const files=await readZip(buffer),items=files.filter(file=>/^assets\/[^/]+\/items\/[^/]+\.json$/.test(file.name)||/^assets\/[^/]+\/items\/.*\/[^/]+\.json$/.test(file.name));
  if(!items.length)throw Error('No Item Model Definitions found. Expected files under assets/<namespace>/items/**/*.json.');
  return {...analyseDefinitions(items),fileCount:files.length};
}
