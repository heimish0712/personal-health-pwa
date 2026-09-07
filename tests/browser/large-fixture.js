// Test-only fixture: refuses production database names. Not included in App Shell.
export async function populateLargeFixture(c) {
  if(!c.database.name.startsWith('personal-health-pwa-test-'))throw new Error('Test DB required');
  const profile=c.identityContext.getCurrentProfileId(),type=(await c.exerciseQueryService.listActiveTypes())[0],template=await c.exerciseQueryService.getActiveTemplate(type.id);
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(128,128);
  for(let i=0;i<pixels.data.length;i++)pixels.data[i]=i%4===3?255:(i*37+i%71)%256;ctx.putImageData(pixels,0,0);
  const file=await new Promise((resolve)=>canvas.toBlob(resolve,'image/jpeg',.9)),prepared=await c.mediaService.prepare(file);
  const stores=['exercise_logs','exercise_schedules','weight_logs','inbody_logs','diet_logs','diet_photos','media_blobs'];
  const at=(i)=>i%60===0?'2026-09-07T03:00:00.000Z':'2020-01-01T03:00:00.000Z';
  const row=(i,data)=>({id:crypto.randomUUID(),profile_id:profile,revision:1,created_at:at(i),updated_at:at(i),deleted_at:null,...data});
  await c.database.runTransaction(stores,'readwrite',({store})=>{
    for(let i=0;i<3000;i++){
      store('exercise_logs').add(row(i,{exercise_type_id:type.id,template_id:template.id,performed_at:at(i),values:{duration_minutes:30},memo:''}));
      store('exercise_schedules').add(row(i,{exercise_type_id:type.id,scheduled_at:at(i),status:'scheduled',expected_duration_minutes:30,memo:''}));
      store('weight_logs').add(row(i,{measured_at:at(i),weight:70,source:'manual',memo:''}));
      if(i<1000)store('inbody_logs').add(row(i,{measured_at:at(i),weight:70,link_weight:false,memo:''}));
      const diet=row(i,{eaten_at:at(i),meal_type:'lunch',content:'가상 식단',memo:''});store('diet_logs').add(diet);
      if(i<1000){const main=crypto.randomUUID()+'.webp',thumb=crypto.randomUUID()+'.webp';
        // prepare() may fall back to JPEG; preserve actual extension/type.
        const keys=[main,thumb].map((key,j)=>prepared.media[j].blob.type==='image/jpeg'?key.replace('.webp','.jpg'):key);
        store('diet_photos').add(row(i,{...prepared.metadata,storage_key:keys[0],thumbnail_storage_key:keys[1],diet_log_id:diet.id,sort_order:0}));
        prepared.media.forEach((m,j)=>store('media_blobs').add({...m,storage_key:keys[j]}));
      }
    }
  });
  return {exercise:3000,schedules:3000,weights:3000,inbodies:1000,diets:3000,photos:1000,blobs:2000,mediaBytes:1000*prepared.media.reduce((n,r)=>n+r.byte_size,0)};
}
