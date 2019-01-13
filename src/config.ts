
import * as path from 'path';
import * as constants from './constants';
import { MessageError } from './errors';
import { Manifest } from './types';
import * as fs from './util/fs';
import normalizeManifest from './util/normalize-manifest/index';
import BaseReporter from './reporters/base-reporter';
import detectIndent from 'detect-indent';

export type ConfigOptions = {
  cwd?: string,
  _cacheRootFolder?: string,
  tempFolder?: string,
  ignoreScripts?: boolean,
  ignorePlatform?: boolean,
  ignoreEngines?: boolean,
  // cafile??: string,
  production?: boolean,
  binLinks?: boolean,
  // scriptsPrependNodePath?: boolean,
  commandName?: string,
  otp?: string,
};


export default class Config {
  cwd: string;
  reporter: BaseReporter;
  _manifest: any;
  manifest: Manifest;
  manifestIndent?: string;

  constructor(reporter: BaseReporter, cwd?: string) {
    this.reporter = reporter;
    // Ensure the cwd is always an absolute path.
    this.cwd = path.resolve(cwd || process.cwd());
  }

  async loadPackageManifest() {
    const loc = path.join(this.cwd, constants.NODE_PACKAGE_JSON);
    if (await fs.exists(loc)) {
      const info = await this.readJson(loc, fs.readJsonAndFile);
      this._manifest = info.object;
      this.manifestIndent = detectIndent(info.content).indent || undefined;
      this.manifest = await normalizeManifest(info.object, this.cwd, this, true);
    } else {
      return null;
    }
  }

  readJson(loc: string, factory: (filename: string) => Promise<any> = fs.readJson): Promise<any> {
    try {
      return factory(loc);
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new MessageError(this.reporter.lang('jsonError', loc, err.message));
      } else {
        throw err;
      }
    }
  }

  async savePackageManifest(newManifestData: object) {
    const loc = path.join(this.cwd, constants.NODE_PACKAGE_JSON);
    const manifest = {
      ...this._manifest,
      ...newManifestData
    };
    await fs.writeFilePreservingEol(loc, JSON.stringify(manifest, null, this.manifestIndent || constants.DEFAULT_INDENT) + '\n');
    return this.loadPackageManifest();
  }
}
