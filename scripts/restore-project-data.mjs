import { argumentsFor, restoreProject } from './project-data.mjs';
try {
  const args = argumentsFor(process.argv.slice(2), ['backup', 'target', 'force', 'verify-only']);
  if (typeof args.backup !== 'string' || !args.backup || args.target === true || args.target === '') throw Error('Use --backup=<directory> and optional --target=<directory>');
  if ((args.force !== undefined && args.force !== true) || (args['verify-only'] !== undefined && args['verify-only'] !== true)) throw Error('--force and --verify-only are boolean flags');
  const result = await restoreProject({ directory: args.backup, target: args.target, force: args.force === true, verifyOnly: args['verify-only'] === true });
  console.log(args['verify-only'] ? 'Backup verification SUCCESS' : 'Restore SUCCESS: ' + result.target);
  if (result.safetyBackup) console.log('Pre-restore validated backup:', result.safetyBackup);
  if (result.staging) console.log('Retained restore staging:', result.staging);
} catch (error) { console.error(error.message); process.exitCode = 1; }
