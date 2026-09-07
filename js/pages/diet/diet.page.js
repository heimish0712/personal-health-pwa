import { initialRecordTime } from '../../router.js';
import { MEAL_TYPES } from '../../core/media-rules.js';
import { nowLocalInput, formatLocalDateTime } from '../../core/datetime.js';
import { healthLocalInput } from '../../core/health-rules.js';
import { getActionErrorMessage } from '../../core/errors.js';
import { escapeHtml as e } from '../exercise/exercise-view.js';
import { setNavigationGuard, clearNavigationGuard } from '../../router.js';
const urls=new Set();let epoch=0;
export function releaseDietUrls() { epoch++;for(const url of urls) URL.revokeObjectURL(url);urls.clear(); }
const urlFor=(blob)=>{const url=URL.createObjectURL(blob);urls.add(url);return url;};
const mb=(bytes)=>bytes == null ? '확인 불가' : `${(bytes/1000000).toFixed(1)} MB`;
function action(c,selector,work) { c.root.querySelectorAll(selector).forEach((b)=>b.addEventListener('click',async()=>{if(b.disabled)return;b.disabled=true;try{await work(b);}catch(error){if(c.isCurrent())c.showError('식단 작업에 실패했습니다.',error);}finally{b.disabled=false;}})); }
async function loadPhotos(c,thumbnail=true) {
  const token=epoch;
  await Promise.all([...c.root.querySelectorAll('[data-diet-photo]')].map(async(img)=>{try{const blob=await c.services.media.photoBlob(img.dataset.dietPhoto,thumbnail);if(c.isCurrent() && token===epoch && img.isConnected) img.src=urlFor(blob);}catch{if(img.isConnected)img.alt='사진을 불러오지 못했습니다.';}}));
}
export async function renderDietRoute(route,c) { releaseDietUrls();const parts=route.split('/');if(parts.length===2)return renderDietList(c);const id=parts[3]==='new'?null:parts[3];return !id || parts[4]==='edit'?renderDietForm(c,id):renderDietDetail(c,id); }
export async function renderDietList(c) {
  c.setTitle('식단');const tz=await c.services.diet.timezone();if(!c.isCurrent())return;
  c.root.innerHTML=`<section class="card"><div class="section-heading"><h2>식단 기록</h2><button class="button" id="diet-new">+ 식단 기록</button></div><div class="form-field"><label for="diet-day">날짜</label><input type="date" id="diet-day" value="${nowLocalInput(tz).slice(0,10)}"></div><div class="form-actions"><button class="button button-secondary" id="diet-prev">이전 날</button><button class="button button-secondary" id="diet-next">다음 날</button></div><label><input id="diet-trash" type="checkbox"> 삭제된 기록 포함</label></section><div id="diet-list"></div>`;
  action(c,'#diet-new',()=>c.navigate('/diet/log/new'));let sequence=0;
  const draw=async()=>{const token=++sequence,day=c.root.querySelector('#diet-day').value;if(!day)return;const rows=await c.services.diet.day(day,{includeDeleted:c.root.querySelector('#diet-trash').checked});if(!c.isCurrent()||token!==sequence)return;releaseDietUrls();
    c.root.querySelector('#diet-list').innerHTML=rows.length?rows.map((r)=>`<section class="card diet-card"><h3>${e(MEAL_TYPES[r.meal_type])}${r.deleted_at?' · 삭제됨':''}</h3><p>${e(formatLocalDateTime(r.eaten_at,tz))}</p><div class="diet-thumbnails">${r.photos.map((p)=>`<img data-diet-photo="${p.id}" alt="식단 사진 썸네일" loading="lazy">`).join('')}</div><p class="diet-text">${e(r.content)}</p><p class="diet-text">${e(r.memo)}</p><button class="button button-secondary" data-diet-open="${r.id}">식단 열기</button></section>`).join(''):'<section class="card">이 날짜에 식단이 없습니다.</section>';
    action(c,'[data-diet-open]',(b)=>c.navigate(`/diet/log/${b.dataset.dietOpen}`));await loadPhotos(c,true);
  };
  const change=()=>void draw().catch((error)=>{if(c.isCurrent())c.showError('식단 조회에 실패했습니다.',error);});
  for(const id of ['diet-day','diet-trash'])c.root.querySelector(`#${id}`).addEventListener('change',change);
  for(const [id,delta]of [['diet-prev',-1],['diet-next',1]])action(c,`#${id}`,async()=>{const input=c.root.querySelector('#diet-day'),date=new Date(`${input.value}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+delta);input.value=date.toISOString().slice(0,10);await draw();});await draw();
}
export async function renderDietDetail(c,id) {
  const [row,tz]=await Promise.all([c.services.diet.get(id),c.services.diet.timezone()]);if(!c.isCurrent())return;releaseDietUrls();c.setTitle('식단 상세');
  c.root.innerHTML=`<section class="card"><h2>${e(MEAL_TYPES[row.meal_type])}${row.deleted_at?' · 삭제됨':''}</h2><p>${e(formatLocalDateTime(row.eaten_at,tz))}</p><p class="diet-text">${e(row.content)}</p><p class="diet-text">${e(row.memo)}</p><div class="diet-full-photos">${row.deleted_at?'삭제된 식단의 사진은 복원 후 표시합니다.':row.photos.map((p)=>`<img data-diet-photo="${p.id}" alt="식단 사진 압축본">`).join('')}</div><div class="form-actions">${row.deleted_at?'<button id="diet-restore" class="button">복원</button>':'<button id="diet-edit" class="button">수정</button><button id="diet-delete" class="button button-danger">삭제</button>'}</div></section><button class="button button-secondary" id="diet-back">식단 목록</button>`;
  action(c,'#diet-back',()=>c.navigate(c.returnRoute ?? '/diet'));action(c,'#diet-edit',()=>c.navigate(`/diet/log/${id}/edit`));
  for(const operation of ['delete','restore'])action(c,`#diet-${operation}`,async()=>{if(operation==='delete'&&!confirm('식단과 사진을 함께 삭제할까요? 사진은 복원을 위해 보관됩니다.'))return;await c.services.diet[operation](id,row.revision);if(c.isCurrent()){await renderDietDetail(c,id);c.showToast(operation==='delete'?'삭제했습니다.':'복원했습니다.');}});
  await loadPhotos(c,false);
}
export async function renderDietForm(c,id) {
  const [row,tz]=await Promise.all([id?c.services.diet.get(id):null,c.services.diet.timezone()]);if(!c.isCurrent())return;if(row?.deleted_at)return renderDietDetail(c,id);
  c.setTitle(id?'식단 수정':'식단 추가');let dirty=false,busy=false,processing=false;const kept=[...(row?.photos??[])],added=[];
  c.root.innerHTML=`<form id="diet-form" class="form-stack"><section class="card"><div class="form-field"><label for="diet-at">날짜/시간</label><input type="datetime-local" step="0.001" id="diet-at" required value="${row?healthLocalInput(row.eaten_at,tz):initialRecordTime(c,nowLocalInput(tz))}"></div><div class="form-field"><label for="diet-meal">식사 구분</label><select id="diet-meal">${Object.entries(MEAL_TYPES).map(([key,label])=>`<option value="${key}" ${row?.meal_type===key?'selected':''}>${label}</option>`).join('')}</select></div><div class="form-field"><label for="diet-content">내용</label><textarea id="diet-content" maxlength="2000">${e(row?.content)}</textarea></div><div class="form-field"><label for="diet-memo">메모</label><textarea id="diet-memo" maxlength="2000">${e(row?.memo)}</textarea></div><div class="form-field"><label for="diet-camera">촬영</label><input type="file" id="diet-camera" accept="image/jpeg,image/png,image/webp" capture="environment"></div><div class="form-field"><label for="diet-files">사진 선택 (최대 12장)</label><input type="file" id="diet-files" accept="image/jpeg,image/png,image/webp" multiple></div><p>JPEG·PNG·WebP, 장당 25 MB 이하. 원본 대신 압축본과 썸네일을 저장합니다. HEIC는 JPEG로 변환해 주세요.</p><p id="diet-storage" class="section-description"></p><div class="diet-previews" id="diet-previews"></div><p id="diet-error" class="warning-text" role="alert"></p></section><div class="form-actions"><button class="button button-secondary" id="diet-cancel" type="button">취소</button><button class="button" id="diet-save" type="submit">저장</button></div></form>`;
  const form=c.root.querySelector('#diet-form'),errorNode=c.root.querySelector('#diet-error');
  const refreshStorage=async()=>{const s=await c.services.media.status();if(c.isCurrent())c.root.querySelector('#diet-storage').textContent=`사용 ${mb(s.usage)} / 한도 ${mb(s.quota)} · 사진 ${mb(s.bytes)}`;};
  const preview=async()=>{releaseDietUrls();const token=epoch;c.root.querySelector('#diet-previews').innerHTML=[...kept.map((p,i)=>`<figure><img data-diet-photo="${p.id}" alt="기존 사진 ${i+1}"><button type="button" class="button button-secondary" data-remove-existing="${p.id}">사진 제거</button></figure>`),...added.map((p,i)=>`<figure><img src="${urlFor(p.media[1].blob)}" alt="신규 사진 ${i+1}"><button type="button" class="button button-secondary" data-remove-new="${i}">사진 제거</button></figure>`)].join('');
    action(c,'[data-remove-existing]',async(b)=>{if(busy||processing)return;kept.splice(kept.findIndex((p)=>p.id===b.dataset.removeExisting),1);dirty=true;await preview();});action(c,'[data-remove-new]',async(b)=>{if(busy||processing)return;added.splice(Number(b.dataset.removeNew),1);dirty=true;await preview();});await loadPhotos(c,true);
  };
  form.addEventListener('input',()=>{dirty=true;});setNavigationGuard(()=>!busy&&!processing&&(!dirty||confirm('저장하지 않은 내용을 버리고 이동할까요?')));action(c,'#diet-cancel',()=>c.navigate(c.returnRoute ?? '/diet'));
  for(const selector of ['#diet-files','#diet-camera'])form.querySelector(selector).addEventListener('change',async(event)=>{
    if(processing||busy)return;const files=[...event.target.files];event.target.value='';if(!files.length)return;processing=true;c.root.querySelector('#diet-save').disabled=true;errorNode.textContent='사진 처리 중…';
    try{if(kept.length+added.length+files.length>12)throw new Error('식단마다 사진은 최대 12장입니다.');const prepared=[];for(const file of files)prepared.push(await c.services.media.prepare(file));if(!c.isCurrent())return;added.push(...prepared);dirty=true;await preview();await refreshStorage();errorNode.textContent='사진 준비 완료. 저장 버튼을 눌러 기록하세요.';}catch(error){if(c.isCurrent())errorNode.textContent=getActionErrorMessage(error,'사진을 처리하지 못했습니다. 장수·형식·용량을 확인하세요.');}finally{processing=false;if(c.isCurrent())c.root.querySelector('#diet-save').disabled=false;}
  });
  form.addEventListener('submit',async(event)=>{event.preventDefault();if(busy||processing)return;busy=true;form.querySelector('#diet-save').disabled=true;errorNode.textContent='저장 중…';
    try{await refreshStorage();const value=(key)=>form.querySelector(`#diet-${key}`).value;const saved=await c.services.diet.save({eaten_at_local:value('at'),meal_type:value('meal'),content:value('content'),memo:value('memo')},id,row?.revision,kept.map((p)=>p.id),added);if(!c.isCurrent())return;await refreshStorage().catch(()=>{});dirty=false;busy=false;clearNavigationGuard();c.showToast('식단을 저장했습니다.');c.navigate(c.returnRoute ?? `/diet/log/${saved.id}`);}catch(error){if(c.isCurrent())errorNode.textContent=getActionErrorMessage(error,'식단을 저장하지 못했습니다. 기존 데이터는 유지됩니다.');}finally{busy=false;if(form.isConnected)form.querySelector('#diet-save').disabled=false;}
  });await preview();await refreshStorage();
}
export async function mountMediaSettings(root,{services,isCurrent,showToast}) {
  const section=document.createElement('section');section.className='card';section.id='media-settings';root.append(section);
  const draw=async()=>{const s=await services.media.status();if(!isCurrent())return;section.innerHTML=`<h2>사진 저장공간</h2><p>전체 사용량 ${mb(s.usage)} / 한도 ${mb(s.quota)}</p><p>사진 사용량 ${mb(s.bytes)} (${s.count}파일)</p><p>${s.supported?'사진 저장을 지원하는 환경':'저장 환경 확인 필요'} · ${s.persistent?'영구 저장 허용':'영구 저장 미허용'}</p><p>삭제된 사진의 파일도 복원을 위해 보존합니다. 고아 파일 ${s.orphanKeys.length}개, 활성 사진에서 미참조 ${s.inactiveKeys.length}개. 초기화/강제 교체 시 사진 파일도 함께 교체합니다.</p><button class="button" id="media-persist">영구 저장 요청</button> <button class="button button-secondary" id="media-gc">고아 사진 파일 정리</button>`;
    section.querySelector('#media-persist').onclick=async()=>{const ok=await services.media.requestPersistence();if(isCurrent()){showToast(ok?'영구 저장이 허용되었습니다.':'브라우저가 영구 저장을 허용하지 않았습니다.');await draw();}};
    section.querySelector('#media-gc').onclick=async()=>{await services.media.collectOrphans();if(isCurrent()){showToast('어떤 사진에서도 참조하지 않는 파일만 정리했습니다.');await draw();}};
  };await draw();
}
