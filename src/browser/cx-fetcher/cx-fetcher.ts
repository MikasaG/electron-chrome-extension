import EventEmitter = require('events');
import defaultCxStorage from './cx-storage-provider';
import defaultCxDownloader from './cx-download-provider';
import * as xmlConvert from 'xml-js';
import {
  CxFetcherInterface,
  CxDownloadProviderInterface,
  CxStorageProviderInterface,
  CxInfos,
} from './types';

class CxFetcher extends EventEmitter implements CxFetcherInterface {
  // Singleton instance & injected dependencies
  private static _instance: CxFetcher;
  public cxStorager: CxStorageProviderInterface;
  public cxDownloader: CxDownloadProviderInterface;
  // Maps of what's happening with Chrome extensions
  private inUse: Map<string, string>;
  private available: Map<string, CxInfos>;
  // Auto update related
  private autoUpdateLoop: NodeJS.Timer;
  // private autoUpdateInterval: number;

  // Constructor with dependencies injection
  constructor(cxStorager?: CxStorageProviderInterface, cxDownloader?: CxDownloadProviderInterface) {
    // Let this be a singleton
    if (CxFetcher._instance) {
      return CxFetcher._instance;
    }

    // Never forget this guy
    super();

    // Registrer the downloader and storage handler
    // @ts-ignore
    this.cxStorager = (cxStorager) ? cxStorager : new defaultCxStorage();
    // @ts-ignore
    this.cxDownloader = (cxDownloader) ? cxDownloader : new defaultCxDownloader();

    // Initialise internal maps of extensions (with those already installed, if ever)
    this.available = new Map();
    this.inUse = new Map();

    // Start auto-update
    // this.autoUpdateLoop = setInterval(this.autoUpdate, this.autoUpdateInterval);

    // Save the one and only instance
    CxFetcher._instance = this;
  }

  // Static method to reset the unique instance
  public static reset() {
    delete CxFetcher._instance;
  }

  // Expose the list of available and installed Chrome extensions
  availableCx() {
    return this.available;
  }

  // Add a new Cx to the internal map
  saveCx(extensionId: string, cxInfos: CxInfos) {
    this.available.set(extensionId, cxInfos);
    return true;
  }

  // Fetch a Chrome extension
  async fetch(extensionId: string): Promise<CxInfos> {
    // Check if it's already in use
    if (this.inUse.has(extensionId)) {
      throw new Error(`Extension ${extensionId} is already being used`);
    }

    // TODO : check if the extension already exists with this version ?
    // TODO : React to errors

    // Record the extension has being toyed with already
    this.inUse.set(extensionId, 'downloading');
    // Start downloading -> unzipping -> cleaning
    const crxPath = await this.cxDownloader.downloadById(extensionId);
    const fetchedCxInfo = await this.cxStorager.extractExtension(extensionId, crxPath);
    await this.cxDownloader.cleanupById(extensionId);

    // Clear status, add to installed and emit ready event for this cx
    this.inUse.delete(extensionId);
    this.saveCx(extensionId, fetchedCxInfo);

    return fetchedCxInfo;
  }

  // Update a Chrome extension
  async update(extensionId: string) {
    console.log(`Updating ${extensionId}`);
    return true;
  }

  // Remove a Chrome extension
  async remove(extensionId: string) {
    console.log(`Removing ${extensionId}`);
    return true;
  }

  // Check if a Chrome extension can be updated
  async checkForUpdate(extensionId: string) {
    const cxInfos = this.available.get(extensionId);

    if (!cxInfos) throw new Error('Unknown extension');

    const updateManifest = await this.cxDownloader.fetchUpdateManifest(cxInfos.update_url);

    // TODO : Extract all the work on manifest into its own dependency (no parsing stuff in the CxFetcher)
    const lastVersion = this.extractVersion(updateManifest);
    if (this.gt(this.parseVersion(lastVersion), this.parseVersion(cxInfos.version))) {
      return true;
    }

    return false;
  }

  // Auto update all installed extensions automatically
  autoUpdate() {
    console.log('Auto-updating');
    return true;
  }

  stopAutoUpdate() {
    clearInterval(this.autoUpdateLoop);
  }

  async scanInstalledExtensions() {
    const installedManifest = await this.cxStorager.getInstalledExtension();
    console.log('installed manifest : ', installedManifest);
    this.available = new Map();
  }

  private extractVersion(updateManifest: string): string {
    const updateInfos = xmlConvert.xml2js(updateManifest, { compact: true });
    // @ts-ignore
    return updateInfos.gupdate.app.updatecheck._attributes.version;
  }

  // TODO : Update this
  private parseVersion(version:string) {
    const split = version.split('.');
    return split.map((elem: string) => parseInt(elem, 10));
  }

  // TODO : update this
  private gt(a: number[], b: number[]) {
    for (let i = 0; i < a.length; i = i + 1) {
      if (a[i] < b[i]) return false;
      if (a[i] > b[i]) return true;
    }

    return false;
  }
}

export default CxFetcher;
