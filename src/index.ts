import * as fs from './util/fs.js';
import validateFile from './util/babel-validate-file.js';
import * as path from 'path';
import chalk from 'chalk';

function log(fileName: string, errors: {msg: string, level: number}[]) {
  console.log(chalk.bold(fileName));
  for (const error of errors) {
    console.log(' ', error.level === 2 ? '⚠️ ' : '   ', error.msg);
  }
}

export class Lint {
  constructor(dir: string) {
    this.dir = dir;
    this.errors = new Map();
    this.totalNum = 0;
  }

  dir: string;
  totalNum: number;
  errors: Map<string, {loc?: string, msg: string, level: number}[]>;

  private addError(filename: string, msg: string, level: number = 2) {
    const errors = this.errors.get(filename) || [];
    errors.push({msg, level});
    this.errors.set(filename, errors);
  }

  async init(): Promise<void> {
    const {dir} = this;

    const files = await fs.glob(`dist-src/**/*`, {cwd: dir, absolute: true, nodir: true});
    for (const fileLoc of files) {
      const relativePath = path.relative(dir, fileLoc);
      const extName = path.extname(fileLoc);
      if (extName === '.map') {
        continue;
      }
      if (fileLoc.includes('README')) {
        continue;
      }
      if (extName !== '.js') {
        this.addError(relativePath, 'Only JavaScript files are expected in your dist-src/ distribution.');
        this.totalNum++;
        continue;
      }
      const fileContents = await fs.readFile(fileLoc);
      const validateErrors = validateFile(fileContents, fileLoc, dir);
      for (const errMsg of validateErrors) {
        this.addError(relativePath, errMsg);
      }
      this.totalNum += validateErrors.size;
    }
  }

  summary() {
    if (this.totalNum === 0) {
      return;
    }
    console.log(``);
    for (const [filename, errors] of this.errors.entries()) {
      log(filename, errors);
    }
    console.log(``);
    console.log(`${this.totalNum} standard-pkg errors found.`);
  }

  exitCode() {
    return this.totalNum === 0 ? 0 : 1;
  }
}

export async function run(args: Array<string>): Promise<void> {
  const dir = path.resolve(process.cwd(), args.length > 2 ? args[2] : 'pkg/');
  const linter = new Lint(dir);
  await linter.init();
  if (linter.totalNum === 0) {
    console.log('No standard-pkg errors found.');
  } else {
    linter.summary();
  }

  process.exit(linter.exitCode());
}
