// Shared read projection: completed reservations use the actual exercise date.
export async function activityCalendarEntries(repositories, start, end) {
    const { schedules, logs } = await Promise.all([repositories.exerciseSchedule.listByDateRange(start, end), repositories.exerciseLog.listByDateRange(start, end)]).then(([schedules, logs]) => ({ schedules, logs }));
    const linked = new Map(schedules.map((s) => [s.id, s]));
    for (const log of logs) {
      const schedule = await repositories.exerciseSchedule.findByCompletedLog(log.id);
      if (schedule) linked.set(schedule.id, schedule);
    }
    const consumed = new Set(), entries = [];
    for (const schedule of linked.values()) {
      const log = schedule.status === 'completed' && schedule.completed_exercise_log_id
        ? await repositories.exerciseLog.getById(schedule.completed_exercise_log_id) : null;
      if (log) consumed.add(log.id);
      entries.push({ id: schedule.id, schedule, log, at: log?.performed_at ?? schedule.scheduled_at, exercise_type_id: schedule.exercise_type_id, label: log ? '완료 · 운동기록' : ({ scheduled: '예정', cancelled: '취소', completed: '완료' }[schedule.status]), memo: log?.memo ?? schedule.memo });
    }
    for (const log of logs) if (!consumed.has(log.id)) entries.push({ id: log.id, log, schedule: null, at: log.performed_at, exercise_type_id: log.exercise_type_id, label: '운동기록', memo: log.memo });
    return entries.filter((r) => r.at >= start && r.at < end).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
