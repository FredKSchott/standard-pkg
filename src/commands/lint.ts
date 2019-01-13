

import {Reporter} from '../reporters/index';
import Config from '../config';
import * as fs from '../util/fs';
import validateFile from '../util/babel-validate-file';
import {isValidLicense} from '../util/normalize-manifest/util';

import * as path from 'path';
import chalk from 'chalk';
import { Command } from 'commander';

type Flags = {};

function log(symbol: string, fileName: string, errors: string | Array<string>) {
  if (!Array.isArray(errors)) {
    errors = [errors];
  }
  console.log(`${symbol}   `, chalk.bold(fileName));
  for (const error of errors) {
    console.log(`  ${chalk.dim('≫')} ${error}`);
  }
}

export class Lint {
  constructor(dir: string, flags: Object, config: Config, reporter: Reporter) {
    this.dir = dir;
    this.flags = flags;
    this.config = config;
    this.reporter = reporter;
    this.totalNum = 0;
  }

  dir: string;
  flags: Flags;
  config: Config;
  reporter: Reporter;
  totalNum: number;

  async init(): Promise<void> {
    const {dir, reporter} = this;
    const {manifest} = this.config;

    // if (!pika.exists) {
    //   log('⚠️', 'package.json', 'A pika manifest file is required to publish.');
    //   this.totalNum++;
    //   return;
    // }

    if (manifest.license === undefined) {
      log('⚠️', 'package.json', this.reporter.lang('manifestLicenseNone'));
      this.totalNum++;
    } else if (typeof manifest.license !== 'string') {
      log('⚠️', 'package.json', reporter.lang('manifestLicenseInvalid'));
      this.totalNum++;
    } else if (!isValidLicense(manifest.license.replace(/\*$/g, ''))) {
      log('⚠️', 'package.json', reporter.lang('manifestLicenseInvalid'));
      this.totalNum++;
    }

    const files = await fs.glob(`dist-src/**/*`, {cwd: dir, absolute: true, nodir: true});
    for (const fileLoc of files) {
      const relativePath = path.relative(dir, fileLoc);
      const extName = path.extname(fileLoc);
      if (extName === '.map') {
        continue;
      }
      if (extName !== '.js') {
        log('⚠️', relativePath, 'Only JavaScript files are expected in your dist-src/ distribution.');
        this.totalNum++;
        continue;
      }
      const fileContents = await fs.readFile(fileLoc);
      const validateErrors = validateFile(fileContents, fileLoc, dir);
      if (validateErrors.size === 0) {
        continue;
      }
      log('⚠️', relativePath, Array.from(validateErrors));
      this.totalNum += validateErrors.size;
    }
  }

  summary() {
    if (this.totalNum === 0) {
      this.reporter.log(this.reporter.lang('noValidationErrors'));
    } else {
      this.reporter.log(this.reporter.lang('validationErrors', this.totalNum));
    }
  }
}

export function setFlags(commander: Command) {
  commander.description('Valiates a package for issues before publishing to npm.');
}

export function hasWrapper(commander: Command, args: Array<string>): boolean {
  return true;
}

export async function run(config: Config, reporter: Reporter, flags: Flags, args: Array<string>): Promise<void> {
  const {cwd} = config;
  const dir = args.length > 0 ? path.resolve(cwd, args[0]) : 'pkg/';
  const linter = new Lint(dir, flags, config, reporter);
  await linter.init();
  console.log(``);
  linter.summary();
}
