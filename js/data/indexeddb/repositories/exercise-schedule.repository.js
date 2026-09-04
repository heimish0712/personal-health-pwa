import { BaseScopedRepository } from './base-scoped.repository.js';
import { STORE_NAMES } from '../schema.js';

export class ExerciseScheduleRepository extends BaseScopedRepository {
  constructor(dependencies) {
    super({ ...dependencies, storeName: STORE_NAMES.EXERCISE_SCHEDULES });
  }
}
