const token = (value) => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,100}$/.test(value) ? value : null;
export function safeLog(entry) {
  const level = ['ERROR','WARN','INFO'].includes(entry.level) ? entry.level : 'INFO';
  const context = {};
  for (const key of ['code','name','errorName','storeName','oldVersion','newVersion','version','count']) {
    const value = entry.context?.[key];
    if (typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean') context[key] = value;
    else if (token(value)) context[key] = value;
  }
  return { ...entry, level, event: token(entry.event) ?? 'APP_EVENT', message: level === 'ERROR' ? '작업 중 오류가 발생했습니다. 오류코드를 확인하세요.' : level === 'WARN' ? '확인이 필요한 상태가 감지되었습니다.' : '앱 진단 이벤트가 기록되었습니다.', context: Object.keys(context).length ? context : null };
}
