import { photoKeys } from './media-rules.js';
// Report codes and counts only; no health values, memos or binary contents leave this projection.
export function diagnoseData({data,mediaKeys,currentProfileId}) {
  const issues=new Map(), maps=Object.fromEntries(Object.entries(data).map(([name,rows])=>[name,new Map(rows.map((r)=>[r.id,r]))]));
  const add=(code)=>issues.set(code,(issues.get(code)??0)+1);
  const ref=(name,id,row)=>{const target=maps[name]?.get(id);return target && target.profile_id===row.profile_id ? target : null;};
  if(!maps.profiles.get(currentProfileId) || maps.profiles.get(currentProfileId).deleted_at!==null)add('CURRENT_PROFILE_INVALID');
  for(const [name,rows] of Object.entries(data)) if(name!=='profiles') for(const row of rows) if(!maps.profiles.has(row.profile_id))add('PROFILE_REFERENCE_BROKEN');
  for(const row of data.exercise_templates) if(!ref('exercise_types',row.exercise_type_id,row))add('TEMPLATE_TYPE_MISSING');
  for(const row of data.exercise_logs) {const t=ref('exercise_templates',row.template_id,row);if(!t || t.exercise_type_id!==row.exercise_type_id)add('EXERCISE_TEMPLATE_BROKEN');}
  const active=new Set();
  for(const row of data.pass_usage_logs) {
    const pass=ref('passes',row.pass_id,row),log=ref('exercise_logs',row.exercise_log_id,row);
    if(!pass || !log || pass.exercise_type_id!==log.exercise_type_id)add('PASS_USAGE_REFERENCE_BROKEN');
    if(row.deleted_at===null && row.status==='used') {if(active.has(row.exercise_log_id))add('DUPLICATE_ACTIVE_USAGE');active.add(row.exercise_log_id);if(log?.deleted_at!==null)add('ACTIVE_USAGE_DELETED_LOG');}
  }
  for(const row of data.exercise_schedules) if(row.completed_exercise_log_id || row.status==='completed') {
    const log=ref('exercise_logs',row.completed_exercise_log_id,row);
    if(!log || log.exercise_type_id!==row.exercise_type_id || (row.status==='completed' && log.deleted_at!==null) || (row.status!=='completed' && log.deleted_at===null))add('SCHEDULE_LOG_BROKEN');
  }
  const weights=new Map();
  for(const row of data.weight_logs) if(row.source==='inbody') {
    const b=ref('inbody_logs',row.source_ref_id,row);weights.set(row.source_ref_id,row);
    if(!b || (row.deleted_at===null && (b.deleted_at!==null || b.link_weight===false || row.weight!==b.weight || row.measured_at!==b.measured_at || row.memo!==b.memo)))add('INBODY_WEIGHT_BROKEN');
  }
  for(const b of data.inbody_logs) if(b.deleted_at===null && b.link_weight && weights.get(b.id)?.deleted_at!==null)add('INBODY_WEIGHT_MISSING');
  const keys=new Set(mediaKeys),references=new Set();
  for(const p of data.diet_photos) {
    const diet=ref('diet_logs',p.diet_log_id,p);
    if(!diet || (p.deleted_at===null && diet.deleted_at!==null))add('DIET_PHOTO_BROKEN');
    for(const key of photoKeys(p)){references.add(key);if(!keys.has(key))add('MEDIA_MISSING');}
  }
  for(const key of keys)if(!references.has(key))add('MEDIA_ORPHAN');
  return {healthy:issues.size===0,checkedRows:Object.values(data).reduce((n,rows)=>n+rows.length,0),issues:[...issues].map(([code,count])=>({code,count}))};
}
