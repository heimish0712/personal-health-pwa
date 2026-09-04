import { BaseScopedRepository } from './base-scoped.repository.js';
import { STORE_NAMES } from '../schema.js';

export class ExerciseTemplateRepository extends BaseScopedRepository {
  constructor(dependencies) {
    super({ ...dependencies, storeName: STORE_NAMES.EXERCISE_TEMPLATES });
  }
}
