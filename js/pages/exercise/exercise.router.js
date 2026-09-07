import { renderPasses, renderPassForm, renderScheduleForm } from './pass-schedule.page.js';
import { renderExerciseMain } from './exercise.page.js';
import { renderExerciseManagement } from './exercise-management.page.js';
import { renderExerciseTypeCreate, renderExerciseTypeEdit, renderExerciseTemplateEdit } from './exercise-type-form.page.js';
import { renderExerciseLogCreate, renderExerciseLogEdit } from './exercise-log-form.page.js';
import { renderExerciseLogDetail } from './exercise-log-detail.page.js';

export async function renderExerciseRoute(route, context) {
  if (route === '/exercise/passes') return renderPasses(context);
  if (route === '/exercise/pass/new') return renderPassForm(context);
  if (route === '/exercise/schedule/new') return renderScheduleForm(context);
  const activityMatch = /^\/exercise\/(pass|schedule)\/([^/]+)\/(edit|complete)$/.exec(route);
  if (activityMatch) return activityMatch[1] === 'pass' ? renderPassForm(context, activityMatch[2]) : renderScheduleForm(context, activityMatch[2], activityMatch[3] === 'complete');
  if (route === '/exercise') return renderExerciseMain(context);
  if (route === '/exercise/manage') return renderExerciseManagement(context);
  if (route === '/exercise/type/new') return renderExerciseTypeCreate(context);
  if (route === '/exercise/log/new') return renderExerciseLogCreate(context);

  let match = /^\/exercise\/type\/([^/]+)\/edit$/.exec(route);
  if (match) return renderExerciseTypeEdit(context, decodeURIComponent(match[1]));
  match = /^\/exercise\/type\/([^/]+)\/template$/.exec(route);
  if (match) return renderExerciseTemplateEdit(context, decodeURIComponent(match[1]));
  match = /^\/exercise\/log\/([^/]+)\/edit$/.exec(route);
  if (match) return renderExerciseLogEdit(context, decodeURIComponent(match[1]));
  match = /^\/exercise\/log\/([^/]+)$/.exec(route);
  if (match) return renderExerciseLogDetail(context, decodeURIComponent(match[1]));

  throw new Error(`Unsupported exercise route: ${route}`);
}
