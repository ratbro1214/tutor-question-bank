import { argumentsFor, backupProject } from './project-data.mjs';
try {
  const args = argumentsFor(process.argv.slice(2), ['output']);
  if (args.output === true || args.output === '') throw Error('--output requires a directory');
  const { directory, manifest } = await backupProject({ output: args.output });
  console.log('Backup SUCCESS:', directory);
  console.log(JSON.stringify({ tables: manifest.databaseTableCount, r2Objects: manifest.r2ObjectCount, englishDataFiles: manifest.englishDataFileCount, englishStaticFiles: manifest.englishStaticFileCount, verifiedFiles: manifest.files.length }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
