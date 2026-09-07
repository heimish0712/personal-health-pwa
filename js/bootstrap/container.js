import { MaintenanceCoordinator } from '../core/maintenance-coordinator.js';
import { IndexedDbOperationsReader } from '../data/indexeddb/operations.reader.js';
import { OperationsService } from '../application/operations.service.js';
import { DashboardService } from '../application/dashboard.service.js';
import { CalendarService } from '../application/calendar.service.js';
import { IndexedDbDietCommand } from '../data/indexeddb/commands/diet.command.js';
import { IndexedDbMediaStorage } from '../data/indexeddb/media-storage.js';
import { MediaService } from '../application/media.service.js';
import { DietService } from '../application/diet.service.js';
import { HealthService } from '../application/health.service.js';
import { IndexedDbInbodyCommand } from '../data/indexeddb/commands/inbody.command.js';
import { IndexedDbActivityCommand } from '../data/indexeddb/commands/activity.command.js';
import { PassScheduleService } from '../application/pass-schedule.service.js';
import { AppLogger } from '../core/app-logger.js';
import { SystemClock } from '../core/clock.js';
import { CryptoIdGenerator } from '../core/id-generator.js';
import { IdentityContext } from '../core/identity-context.js';
import { BootstrapService } from '../application/bootstrap.service.js';
import { DatabaseDiagnosticService } from '../application/database-diagnostic.service.js';
import { ExerciseManagementService } from '../application/exercise-management.service.js';
import { ExerciseLogService } from '../application/exercise-log.service.js';
import { ExerciseQueryService } from '../application/exercise-query.service.js';
import { RepositoryProvider } from '../data/repository-provider.js';
import { IndexedDbDatabase } from '../data/indexeddb/database.js';
import { EXPECTED_STORE_NAMES, SCHEMA_VERSION } from '../data/indexeddb/schema.js';
import { IndexedDbUnitOfWork } from '../data/indexeddb/indexeddb-unit-of-work.js';
import { IndexedDbBootstrapCommand } from '../data/indexeddb/commands/bootstrap.command.js';
import { IndexedDbExerciseManagementCommand } from '../data/indexeddb/commands/exercise-management.command.js';
import { ProfileRepository } from '../data/indexeddb/repositories/profile.repository.js';
import { ExerciseTypeRepository } from '../data/indexeddb/repositories/exercise-type.repository.js';
import { ExerciseTemplateRepository } from '../data/indexeddb/repositories/exercise-template.repository.js';
import { ExerciseLogRepository } from '../data/indexeddb/repositories/exercise-log.repository.js';
import { ExerciseScheduleRepository } from '../data/indexeddb/repositories/exercise-schedule.repository.js';
import { PassRepository } from '../data/indexeddb/repositories/pass.repository.js';
import { PassUsageRepository } from '../data/indexeddb/repositories/pass-usage.repository.js';
import { DietLogRepository } from '../data/indexeddb/repositories/diet-log.repository.js';
import { DietPhotoRepository } from '../data/indexeddb/repositories/diet-photo.repository.js';
import { WeightRepository } from '../data/indexeddb/repositories/weight.repository.js';
import { InbodyRepository } from '../data/indexeddb/repositories/inbody.repository.js';
import { UserSettingsRepository } from '../data/indexeddb/repositories/user-settings.repository.js';
import { DeviceSettingsRepository } from '../data/indexeddb/repositories/device-settings.repository.js';
import { AppLogRepository } from '../data/indexeddb/repositories/app-log.repository.js';
import { BackupValidationService } from '../application/backup-validation.service.js';
import { BackupExportService } from '../application/backup-export.service.js';
import { BackupImportService } from '../application/backup-import.service.js';
import { IndexedDbBackupSnapshotReader } from '../data/indexeddb/backup/backup-snapshot.reader.js';
import { IndexedDbBackupRestoreCommand } from '../data/indexeddb/backup/backup-restore.command.js';
import { RestoreTargetInspector } from '../data/indexeddb/backup/restore-target.inspector.js';

export function createContainer({
  dbName = globalThis.APP_CONFIG.DB_NAME,
  dbVersion = globalThis.APP_CONFIG.DB_VERSION,
  clock = new SystemClock(),
  idGenerator = new CryptoIdGenerator(),
  identityContext = new IdentityContext(),
  logger = new AppLogger(),
  faultInjector = null
} = {}) {
  const database = new IndexedDbDatabase({
    name: dbName,
    version: dbVersion,
    onEvent(event, context) {
      void logger.warn(event, 'IndexedDB lifecycle event.', context);
    }
  });
  const unitOfWork = new IndexedDbUnitOfWork({ database });

  const scopedDependencies = {
    database,
    identityContext,
    clock,
    idGenerator
  };

  const repositories = {
    profile: new ProfileRepository({ database, clock, idGenerator }),
    exerciseType: new ExerciseTypeRepository(scopedDependencies),
    exerciseTemplate: new ExerciseTemplateRepository(scopedDependencies),
    exerciseLog: new ExerciseLogRepository(scopedDependencies),
    exerciseSchedule: new ExerciseScheduleRepository(scopedDependencies),
    pass: new PassRepository(scopedDependencies),
    passUsage: new PassUsageRepository(scopedDependencies),
    dietLog: new DietLogRepository(scopedDependencies),
    dietPhoto: new DietPhotoRepository(scopedDependencies),
    weight: new WeightRepository(scopedDependencies),
    inbody: new InbodyRepository(scopedDependencies),
    userSettings: new UserSettingsRepository(scopedDependencies),
    deviceSettings: new DeviceSettingsRepository({ database, clock }),
    appLog: new AppLogRepository({ database, clock, idGenerator })
  };

  const coordinator = new MaintenanceCoordinator(dbName);
  const operationsReader = new IndexedDbOperationsReader({ database });
  const operationsService = new OperationsService({ reader: operationsReader, logRepository: repositories.appLog, coordinator });
  const mediaStorage = new IndexedDbMediaStorage({ database });
  const mediaService = new MediaService({ storage: mediaStorage, photoRepository: repositories.dietPhoto, idGenerator, clock, coordinator });
  const dietCommand = new IndexedDbDietCommand({ unitOfWork, identityContext, clock, idGenerator, faultInjector });
  const dietService = new DietService({ repositories, command: dietCommand, media: mediaService, identityContext });
  const repositoryProvider = new RepositoryProvider(repositories);
  const backupSnapshotReader = new IndexedDbBackupSnapshotReader({ unitOfWork, identityContext });
  const backupRestoreCommand = new IndexedDbBackupRestoreCommand({ unitOfWork, inspector: new RestoreTargetInspector(), clock, idGenerator, faultInjector });
  const backupValidationService = new BackupValidationService();
  const backupExportService = new BackupExportService({ snapshotReader: backupSnapshotReader, validationService: backupValidationService, clock, coordinator });
  const backupImportService = new BackupImportService({ validationService: backupValidationService, restoreCommand: backupRestoreCommand, snapshotReader: backupSnapshotReader, identityContext, idGenerator, exportService: backupExportService, coordinator });
  const bootstrapCommand = new IndexedDbBootstrapCommand({
    unitOfWork,
    clock,
    idGenerator,
    faultInjector
  });
  const bootstrapService = new BootstrapService({ bootstrapCommand, identityContext });
  const exerciseManagementCommand = new IndexedDbExerciseManagementCommand({
    unitOfWork,
    identityContext,
    clock,
    idGenerator,
    faultInjector
  });
  const exerciseManagementService = new ExerciseManagementService({
    exerciseTypeRepository: repositories.exerciseType,
    exerciseTemplateRepository: repositories.exerciseTemplate,
    exerciseManagementCommand,
    idGenerator
  });
  const inbodyCommand = new IndexedDbInbodyCommand({ unitOfWork, identityContext, clock, idGenerator, faultInjector });
  const healthService = new HealthService({ repositories, command: inbodyCommand, identityContext, clock });
  const activityCommand = new IndexedDbActivityCommand({ unitOfWork, identityContext, clock, idGenerator, faultInjector });
  const passScheduleService = new PassScheduleService({ command: activityCommand, repositories, identityContext });
  const exerciseLogService = new ExerciseLogService({
    exerciseTypeRepository: repositories.exerciseType,
    exerciseTemplateRepository: repositories.exerciseTemplate,
    activityCommand,
    exerciseLogRepository: repositories.exerciseLog,
    profileRepository: repositories.profile,
    identityContext
  });
  const exerciseQueryService = new ExerciseQueryService({
    exerciseTypeRepository: repositories.exerciseType,
    exerciseTemplateRepository: repositories.exerciseTemplate,
    activityCommand,
    exerciseLogRepository: repositories.exerciseLog,
    profileRepository: repositories.profile,
    identityContext,
    clock
  });
  const databaseDiagnosticService = new DatabaseDiagnosticService({
    database,
    identityContext,
    profileRepository: repositories.profile,
    deviceSettingsRepository: repositories.deviceSettings,
    appLogRepository: repositories.appLog,
    expectedStoreNames: EXPECTED_STORE_NAMES,
    schemaVersion: SCHEMA_VERSION
  });

  const dashboardService = new DashboardService({ repositories, identityContext, clock });
  const calendarService = new CalendarService({ repositories, identityContext });

  return Object.freeze({
    dashboardService, calendarService, operationsService, operationsReader, coordinator,
    database,
    unitOfWork,
    clock,
    idGenerator,
    identityContext,
    logger,
    repositories: repositoryProvider.all(),
    repositoryProvider,
    bootstrapCommand,
    exerciseManagementCommand,
    bootstrapService,
    databaseDiagnosticService,
    exerciseManagementService,
    exerciseLogService,
    activityCommand,
    inbodyCommand,
    healthService,
    mediaStorage,
    mediaService,
    dietCommand,
    dietService,
    passScheduleService,
    exerciseQueryService,
    backupSnapshotReader,
    backupRestoreCommand,
    backupValidationService,
    backupExportService,
    backupImportService
  });
}
