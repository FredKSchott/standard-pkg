import * as fs from './util/fs.js';
import validateFile from './util/babel-validate-file.js';
import * as path from 'path';
import chalk from 'chalk';
import minimist from 'minimist';

import nodeFs from 'fs';
import mkdirp from 'mkdirp';
import babel from '@babel/core';
import babelPluginDynamicImportSyntax from '@babel/plugin-syntax-dynamic-import';
import babelPluginImportMetaSyntax from '@babel/plugin-syntax-import-meta';
import babelPresetTypeScript from '@babel/preset-typescript';
import babelPluginImportRewrite from '@pika/babel-plugin-esm-import-rewrite';

/*

$ standard-pkg [--src src/] [--dist dist-src/]
- builds `src/` -> `dist-src/`
- writes `src/` -> `dist-src/`
- lints `dist-src/`

$ standard-pkg [--src src/]
- builds `src/` -> `dist-src/`
- lints `dist-src/`
- (does not write to disk)

$ standard-pkg [--dist dist-src/]
$ standard-pkg lint dist-src/
- lints `dist-src/`

*/

// const argv = yargs.command({
//   command: 'build',
//   describe: 'describe',
//   builder: (yargs) => yargs.option('src', {
//         default: 'src/',
//         describe: 'x marks the spot',
//         type: 'string'
//     }).option('dist', {
//       default: 'dist/',
//       describe: 'x marks the spot',
//       type: 'string'
//   }),
//   handler: (argv) => undefined,
// }).command({
//   command: 'lint [dist]',
//   aliases: ['$0'],
//   describe: 'describe',
//   builder: (yargs) => yargs.option('src', {
//         default: 'src/',
//         describe: 'x marks the spot',
//         type: 'string'
//     }),
//   handler: (argv) => undefined
// }).help();
// console.log(argv);

function log(fileName: string, errors: {msg: string; level: number}[]) {
  console.log(chalk.bold(fileName));
  for (const error of errors) {
    console.log(' ', error.level === 2 ? '⚠️ ' : '   ', error.msg);
  }
}

export class Lint {
  constructor(dist: string, {ignoreExtensions}: {ignoreExtensions?: boolean} = {}) {
    this.dist = dist;
    this.errors = new Map();
    this.totalNum = 0;
    this.ignoreExtensions = ignoreExtensions || false;
  }

  dist: string;
  totalNum: number;
  errors: Map<string, {loc?: string; msg: string; level: number}[]>;
  ignoreExtensions: boolean;

  private addError(filename: string, msg: string, level: number = 2) {
    const errors = this.errors.get(filename) || [];
    errors.push({msg, level});
    this.errors.set(filename, errors);
  }

  async init(): Promise<void> {
    const {dist} = this;
    const dir = path.join(dist, '..');

    const files = await fs.glob(`**/*`, {
      cwd: dist,
      absolute: true,
      nodir: true,
    });
    for (const fileLoc of files) {
      const relativePath = path.relative(path.join(dist, '..'), fileLoc);
      const extName = path.extname(fileLoc);
      if (extName === '.map') {
        continue;
      }
      if (fileLoc.includes('README')) {
        continue;
      }
      if (extName !== '.js') {
        this.addError(
          relativePath,
          'Only JavaScript files are expected in your dist-src/ distribution.',
        );
        this.totalNum++;
        continue;
      }
      const fileContents = await fs.readFile(fileLoc);
      const validateErrors = validateFile(fileContents, fileLoc, dir, dist, this.ignoreExtensions);
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
    console.log(chalk.red('✘'), `${this.totalNum} issues found.`);
  }

  exitCode() {
    return this.totalNum === 0 ? 0 : 1;
  }
}

export class Build {
  constructor(dir: string, options: any = {}) {
    this.dir = dir;
    this.options = options;
    this.result = new Map();
  }

  dir: string;
  options: any;
  result: Map<string, string>;

  async init() {
    const {dir, options} = this;

    const files = (await fs.glob(`**/*`, {
      cwd: dir,
      nodir: true,
      absolute: false,
      ignore: options.exclude || [],
    })).filter(filepath => !filepath.endsWith('.d.ts') && !filepath.endsWith('.md'));

    for (const sourcePath of files) {
      const sourcePathAbs = path.join(dir, sourcePath);
      const transformedPath = sourcePath
        // .replace(path.join(dir, 'src/'), path.join(out, 'dist-src/'))
        .replace('.ts', '.js')
        .replace('.tsx', '.js')
        .replace('.jsx', '.js')
        .replace('.mjs', '.js');

      const resultSrc = await babel.transformFileAsync(sourcePathAbs, {
        presets: [[babelPresetTypeScript]],
        plugins: [
          [babelPluginImportRewrite, {addExtensions: true}],
          babelPluginDynamicImportSyntax,
          babelPluginImportMetaSyntax,
        ],
      });
      this.result.set(transformedPath, resultSrc.code);
    }
    return this.result;
  }

  async write(out: string, result: Map<string, string> = this.result) {
    for (const [filepath, contents] of result.entries()) {
      const transformedPathAbs = path.join(out, filepath);
      mkdirp.sync(path.dirname(transformedPathAbs));
      nodeFs.writeFileSync(transformedPathAbs, contents);
    }
  }
}

// export async function runBuild(args: Arguments): Promise<void> {

// }

export async function run(argv: string[]): Promise<void> {
  var args = minimist(argv.slice(2));
  const srcDir = path.resolve(process.cwd(), typeof args.src === 'string' ? args.src : 'src');
  const distDir = path.resolve(process.cwd(), typeof args.dist === 'string' ? args.dist : 'lib');

  if (args.src) {
    console.log(
      chalk.bold.dim(`»`),
      chalk(
        `Building ${path.relative(process.cwd(), srcDir)}${path.sep} → ${path.relative(
          process.cwd(),
          distDir,
        )}${path.sep}...`,
      ),
    );
    const builder = new Build(srcDir);
    await builder.init();
    await builder.write(distDir);
  }

  console.log(
    chalk.bold.dim(`»`),
    chalk(`Linting ${path.relative(process.cwd(), distDir)}${path.sep}...`),
  );
  const linter = new Lint(distDir);
  await linter.init();
  if (linter.totalNum === 0) {
    // console.log(``);
    console.log(chalk.bold.green(`✓`), '0 issues found.');
  } else {
    linter.summary();
  }
  process.exit(linter.exitCode());
}
