type OpenOptions = {
  version?: number | undefined;
  onUpgradeNeeded: (
    db: IDBDatabase,
    oldVersion: number,
    newVersion: number | null
  ) => void;
  onClose?: (() => void) | undefined;
};

class IndexedDBConnectionPool {
  static readonly DEFAULT = new IndexedDBConnectionPool();

  readonly dictionary = new Map<string, IDBDatabase>();
  readonly reserved = new Map<string, EventTarget>();
  readonly event = new Event("completed");

  async getOrOpen(name: string, options: OpenOptions): Promise<IDBDatabase> {
    const exists: IDBDatabase | undefined = this.dictionary.get(name);
    if (exists !== undefined) {
      return exists;
    }

    const reserved: EventTarget | undefined = this.reserved.get(name);
    if (reserved !== undefined) {
      return new Promise((resolve) => {
        reserved.addEventListener("completed", () => {
          resolve(this.getOrOpen(name, options));
        });
      });
    }
    const eventTarget = new EventTarget();
    this.reserved.set(name, eventTarget);

    return new Promise((resolve, reject) => {
      const openReq: IDBOpenDBRequest = indexedDB.open(name, options.version);

      openReq.onerror = () => {
        reject(openReq.error);

        this.reserved.delete(name);
        eventTarget.dispatchEvent(this.event);
      };

      openReq.onupgradeneeded = (ev: IDBVersionChangeEvent) => {
        const db: IDBDatabase = openReq.result;

        options.onUpgradeNeeded(db, ev.oldVersion, ev.newVersion);
      };

      openReq.onsuccess = () => {
        const db: IDBDatabase = openReq.result;

        db.onversionchange = () => {
          db.close();
          this.dictionary.delete(name);
          options.onClose?.();
        };

        db.onclose = () => {
          this.dictionary.delete(name);
        };

        this.dictionary.set(name, db);
        resolve(db);

        this.reserved.delete(name);
        eventTarget.dispatchEvent(this.event);
      };
    });
  }

  async delete(name: string): Promise<boolean> {
    return new Promise((resolve) => {
      const openReq = indexedDB.deleteDatabase(name);
      openReq.onerror = () => {
        resolve(false);
      };

      openReq.onsuccess = () => {
        resolve(true);
      };
    });
  }
}

export const IDBCP = IndexedDBConnectionPool.DEFAULT;
