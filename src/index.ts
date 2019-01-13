

import * as path from 'path';
import {Command} from 'commander';
import * as fs from 'fs';
import loudRejection from 'loud-rejection';
import semver from 'semver';

import {ConsoleReporter, JSONReporter} from './reporters/index';
import {MessageError} from './errors';
import * as constants from './constants';
import * as lintCommand from './commands/lint';
import Config from './config';
import handleSignals from './util/signal-handler';
import {boolify, boolifyWithDefault} from './util/conversion';
import map from './util/map.js';
import stripBOM from 'strip-bom';
import uri2path from 'file-uri-to-path';

const commander = new Command();

// @ts-ignore
const currentFilename = uri2path(import.meta.url);
const packageJsonContent = fs.readFileSync(path.resolve(currentFilename, '../../package.json'), {encoding: 'utf-8'});
const {version} = map(JSON.parse(stripBOM(packageJsonContent)));

function findProjectRoot(base: string): string {
  let prev = null;
  let dir = base;

  do {
    if (fs.existsSync(path.join(dir, constants.NODE_PACKAGE_JSON))) {
      return dir;
    }

    prev = dir;
    dir = path.dirname(dir);
  } while (dir !== prev);

  return base;
}

export async function main({
  startArgs,
  args,
  endArgs,
}: {
  startArgs: Array<string>,
  args: Array<string>,
  endArgs: Array<string>,
}): Promise<void> {
  const collect = (val, acc) => {
    acc.push(val);
    return acc;
  };

  loudRejection();
  handleSignals();

  // set global options
  commander.version(version, '-v, --version');
  commander.usage('stdpkg [flags]');
  commander.option('--verbose', 'output verbose messages on internal operations');
  commander.option('--json', 'format Pika log messages as lines of JSON (see jsonlines.org)');
  commander.option(
    '--emoji [bool]',
    'enable emoji in output',
    boolify,
    process.platform === 'darwin' || process.env.TERM_PROGRAM === 'Hyper' || process.env.TERM_PROGRAM === 'HyperTerm',
  );
  commander.option('-s, --silent', 'skip Pika console logs, other types of logs (script output) will be printed');
  commander.option('--cwd <cwd>', 'working directory to use', process.cwd());

  // if -v is the first command, then always exit after returning the version
  if (args[0] === '-v') {
    console.log(version.trim());
    process.exitCode = 0;
    return;
  }

  // get command name
  const firstNonFlagIndex = args.findIndex((arg, idx, arr) => {
    const isOption = arg.startsWith('-');
    const prev = idx > 0 && arr[idx - 1];
    const prevOption = prev && prev.startsWith('-') && commander.optionFor(prev);
    const boundToPrevOption = prevOption && (prevOption.optional || prevOption.required);

    return !isOption && !boundToPrevOption;
  });
  if (firstNonFlagIndex > -1) {
    args = args.slice(firstNonFlagIndex + 1);
  }
  const isHelp = arg => arg === '--help' || arg === '-h';
  const helpInArgs = args.findIndex(isHelp);
  if (helpInArgs > -1) {
    commander.help();
    return;
  }

  const command = lintCommand;
  commander.originalArgs = args;
  args = [...args];

  command.setFlags(commander);
  commander.parse([
    ...startArgs,
    // we use this for https://github.com/tj/commander.js/issues/346, otherwise
    // it will strip some args that match with any options
    'this-arg-will-get-stripped-later',
    ...args,
  ]);
  commander.args = commander.args.concat(endArgs.slice(1));

  // we strip cmd
  console.assert(commander.args.length >= 1);
  console.assert(commander.args[0] === 'this-arg-will-get-stripped-later');

  //
  const Reporter = commander.json ? JSONReporter : ConsoleReporter;
  const reporter = new Reporter({
    emoji: process.stdout.isTTY && commander.emoji,
    verbose: commander.verbose,
    noProgress: !commander.progress,
    isSilent: boolifyWithDefault(process.env.PIKA_SILENT, false) || commander.silent,
    nonInteractive: commander.nonInteractive,
  });

  const exit = (exitCode: any = 0) => {
    if (exitCode === 0) {
      clearErrorReport();
    }
    process.exitCode = exitCode;
    reporter.close();
  };

  reporter.initPeakMemoryCounter();

  const outputWrapperEnabled = boolifyWithDefault(process.env.PIKA_WRAP_OUTPUT, true);
  const shouldWrapOutput = outputWrapperEnabled && !commander.json && command.hasWrapper(commander, commander.args);

  if (commander.nodeVersionCheck && !semver.satisfies(process.versions.node, constants.SUPPORTED_NODE_VERSIONS)) {
    reporter.warn(reporter.lang('unsupportedNodeVersion', process.versions.node, constants.SUPPORTED_NODE_VERSIONS));
  }

  //
  const run = (): Promise<void> => {
    return command.run(config, reporter, commander, commander.args).then(exitCode => {
      if (shouldWrapOutput) {
        reporter.footer(false);
      }
      return exitCode;
    });
  };

  function onUnexpectedError(err: Error) {
    function indent(str: string): string {
      return '\n  ' + str.trim().split('\n').join('\n  ');
    }

    const log = [];
    log.push(`Arguments: ${indent(process.argv.join(' '))}`);
    log.push(`PATH: ${indent(process.env.PATH || 'undefined')}`);
    log.push(`Pika version: ${indent(version)}`);
    log.push(`Node version: ${indent(process.versions.node)}`);
    log.push(`Platform: ${indent(process.platform + ' ' + process.arch)}`);

    log.push(`Trace: ${indent(err.stack)}`);

    const errorReportLoc = writeErrorReport(log);

    reporter.error(reporter.lang('unexpectedError', err.message));

    if (errorReportLoc) {
      reporter.info(reporter.lang('bugReport', errorReportLoc));
    }
  }

  function writeErrorReport(log: any): string {
    const errorReportLoc = path.join(config.cwd, 'pika-error.log');

    try {
      fs.writeFileSync(errorReportLoc, log.join('\n\n') + '\n');
    } catch (err) {
      reporter.error(reporter.lang('fileWriteError', errorReportLoc, err.message));
      return undefined;
    }

    return errorReportLoc;
  }

  function clearErrorReport(): string {
    const errorReportLoc = path.join(config.cwd, 'pika-error.log');

    if (fs.existsSync(errorReportLoc)) {
      try {
        fs.unlinkSync(errorReportLoc);
      } catch (err) {
        reporter.error(reporter.lang('fileDeleteError', errorReportLoc, err.message));
        return undefined;
      }
    }

    return errorReportLoc;
  }

  const cwd = findProjectRoot(commander.cwd);
  const config = new Config(reporter, cwd);

  await config.loadPackageManifest();

  try {
      // option "no-progress" stored in pika config
      const noProgressConfig = false; //config.registries.pika.getOption('no-progress');

      if (noProgressConfig) {
        reporter.disableProgress();
      }

      // verbose logs outputs process.uptime() with this line we can sync uptime to absolute time on the computer
      reporter.verbose(`current time: ${new Date().toISOString()}`);
      return run().then(exit);
    } catch (err) {
      reporter.verbose(err.stack);

      if (err instanceof MessageError) {
        reporter.error(err.message);
      } else {
        onUnexpectedError(err);
      }

      return exit(1);
    }
}

async function start(): Promise<void> {
  // ignore all arguments after a --
  const doubleDashIndex = process.argv.findIndex(element => element === '--');
  const startArgs = process.argv.slice(0, 2);
  const args = process.argv.slice(2, doubleDashIndex === -1 ? process.argv.length : doubleDashIndex);
  const endArgs = doubleDashIndex === -1 ? [] : process.argv.slice(doubleDashIndex);

  await main({startArgs, args, endArgs});
}

export const autoRun = false;

export default start;

export {Lint} from './commands/lint';
