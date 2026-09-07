import { AppLogger } from '../core/app-logger.js';
import { createContainer } from './container.js';

const applicationLogger = new AppLogger();

async function logStartupFailure(logger, event, message, error) {
  await logger.error(event, message, {
    code: error?.code ?? error?.name ?? 'UNKNOWN'
  });
}

export async function bootstrapApplication(options = {}) {
  const {
    logger = applicationLogger,
    ...containerOptions
  } = options;
  const container = createContainer({ ...containerOptions, logger });

  try {
    await container.database.open();
  } catch (error) {
    await logStartupFailure(
      logger,
      error?.code ?? 'DB_OPEN_FAILED',
      'Application database open failed.',
      error
    );
    throw error;
  }

  await logger.attachRepository(container.repositories.appLog);

  let bootstrapResult;
  try {
    bootstrapResult = await container.bootstrapService.initialize();
  } catch (error) {
    await logStartupFailure(logger, 'SEED_FAILED', 'Application Profile/Seed bootstrap failed.', error);
    throw error;
  }

  let diagnostic;
  try {
    diagnostic = await container.databaseDiagnosticService.diagnose();
  } catch (error) {
    await logStartupFailure(logger, 'SCHEMA_DIAGNOSTIC_FAILED', 'Application database diagnostic failed.', error);
    throw error;
  }

  return Object.freeze({
    bootstrapResult,
    diagnostic,
    logger,
    services: Object.freeze({
      databaseDiagnostic: container.databaseDiagnosticService,
      exerciseManagement: container.exerciseManagementService,
      exerciseLog: container.exerciseLogService,
      exerciseQuery: container.exerciseQueryService,
      backupExport: container.backupExportService,
      backupImport: container.backupImportService
    })
  });
}
