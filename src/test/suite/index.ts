/**
 * Mocha test suite loader for VS Code extension integration tests.
 */
import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 30000 });
  const testsRoot = path.resolve(__dirname, '.');

  const files = await glob('**/*.test.js', { cwd: testsRoot });
  files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

  if (process.env.TEST_GREP) mocha.grep(process.env.TEST_GREP);

  return new Promise((resolve, reject) => {
    mocha.run(failures => {
      if (failures > 0) {
        reject(new Error(`${failures} test(s) failed`));
      } else {
        resolve();
      }
    });
  });
}
