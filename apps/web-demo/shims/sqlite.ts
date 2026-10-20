// The demo database is sql.js, opened in src/runtime.ts; nothing is stored on disk.
export const deleteDatabaseSync = (): void => undefined;
export const openDatabaseSync = (): never => {
  throw new Error('expo-sqlite is not used in the web demo');
};
