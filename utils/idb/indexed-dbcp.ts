type OpenOptions = {
  version?: number | undefined;
  onUpgradeNeeded: (
    db: IDBDatabase,
    oldVersion: number,
    newVersion: number | null
  ) => void;
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
          alert(
            "새로운 버전의 애플리케이션이 준비되었습니다. 페이지를 닫고 다시 연결을 진행해 주세요."
          );
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
