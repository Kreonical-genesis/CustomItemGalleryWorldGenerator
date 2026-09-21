import {readZip} from './zip.js';

const typeOf=node=>node?.type?.replace(/^minecraft:/,'')||('model' in (node||{})?'model':null);
const componentName=value=>String(value||'').replace(/^minecraft:/,'');

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
      if(Array.isArray(when))for(const value of when)walk(entry.model||entry,[...constraints,{...condition,value}],leaves,`${path}.${i}`);
      else walk(entry.model||entry,when===undefined?constraints:[...constraints,condition],leaves,`${path}.${i}`);
    }
    if(node.fallback)walk(node.fallback,[...constraints,{kind:'fallback',property:node.property,component:node.component}],leaves,path+'.fallback');
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

export function analyseDefinitions(entries){
  const definitions=[],variants=[],warnings=[];
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
    try{
      const json=JSON.parse(new TextDecoder().decode(entry.data)),parts=entry.name.split('/'),namespace=parts[1],relative=parts.slice(3).join('/').replace(/\.json$/,''),baseItem=`${namespace}:${relative}`;
      const leaves=[];walk(json,[],leaves,'root');if(!leaves.length)throw Error('No reachable model leaves');
      definitions.push({path:entry.name,baseItem,item:json});
      for(let index=0;index<leaves.length;index++){
        const leaf=leaves[index],components={};
        for(const constraint of leaf.constraints){const value=componentFor(constraint);if(value)Object.assign(components,value)}
        const fingerprint=JSON.stringify([baseItem,leaf.model,components]);
        if(!variants.some(item=>item.fingerprint===fingerprint))variants.push({baseItem,sourceDefinition:entry.name,model:leaf.model,components,metadata:{variant:index+1,path:leaf.path},fingerprint,supported:true});
      }
    }catch(error){warnings.push({file:entry.name,reason:error.message})}
  }
  return {definitions,variants,warnings};
}

export async function analysePack(buffer){
  const files=await readZip(buffer),items=files.filter(file=>/^assets\/[^/]+\/items\/[^/]+\.json$/.test(file.name)||/^assets\/[^/]+\/items\/.*\/[^/]+\.json$/.test(file.name));
  if(!items.length)throw Error('No Item Model Definitions found. Expected files under assets/<namespace>/items/**/*.json.');
  return {...analyseDefinitions(items),fileCount:files.length};
}
