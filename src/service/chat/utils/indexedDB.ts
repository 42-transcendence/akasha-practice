import { ChatMessages, Message } from "./utils";

class ManageDatabase {

	private IndxDb: IDBFactory;
	public req: IDBOpenDBRequest;
	public db: IDBDatabase;
	public tables: IDBObjectStore[];

	constructor(public dbName: string, private chatMessagesList: ChatMessages[]) {
		this.IndxDb = window.indexedDB;
		this.OpenInitDB();
	}

	private OpenInitDB() {

		this.req = this.IndxDb.open(this.dbName);
		this.req.onupgradeneeded = this.AddTables;
		this.req.onsuccess = this.setDB;
		this.req.onerror = function (_evt) {
			alert("Why didn't you allow my web app to use IndexedDB?!");
		}
	}

	private setDB(e: any) {
		this.db = e.target.result;
	}

	private AddTables(e: any) {
		this.db = e.target.result;
		for (let i = 0; i < this.chatMessagesList.length; i++) {
			const parms: IDBObjectStoreParameters = { keyPath: 'uuid' };
			const table: IDBObjectStore = this.db.createObjectStore(this.chatMessagesList[i].chatUUID, parms);
			table.createIndex('uuid', 'uuid', { unique: true });
			this.tables.push(table);
		}
	}

	ResetDB() {
		this.db.close();
		this.IndxDb.deleteDatabase(this.dbName);
		this.OpenInitDB();
	}

	CreateRow(chatUUID: string, messages: Message[]) {
		const trans: IDBTransaction = this.db.transaction([chatUUID], "readwrite");
		const tbl: IDBObjectStore = trans.objectStore(chatUUID);
		tbl.add(obj);
	}

	DeleteRow(id: string) {
		const trans: IDBTransaction = this.db.transaction([this.tInfo.TableName], "readwrite");
		const tbl: IDBObjectStore = trans.objectStore(this.tInfo.TableName);
		tbl.delete(id)
	}

	UpdateRow(obj: any) {
		const trans: IDBTransaction = this.db.transaction([this.tInfo.TableName], "readwrite");
		const tbl: IDBObjectStore = trans.objectStore(this.tInfo.TableName);
		const idx: IDBIndex = tbl.index(this.tInfo.PrimaryIndexName);
		const req: IDBRequest = idx.get(obj[this.tInfo.PrimaryFieldName]);

		req.onsuccess = function (_e: any) {
			tbl.put(obj);
		};
		req.onerror = function (e: any) {
			alert(e.target.result);
		}
	}

	ReadRow(Id: string) {
		const trans: IDBTransaction = this.db.transaction([this.tInfo.TableName], "readonly");
		const tbl: IDBObjectStore = trans.objectStore(this.tInfo.TableName);
		const idx: IDBIndex = tbl.index(this.tInfo.PrimaryIndexName);
		const req: IDBRequest = idx.get(Id);

		req.onsuccess = function (e: any) {
			const obj = e.target.result; // row열 값이 result에 할당
			console.log(obj);
		};
		req.onerror = function (e: any) {
			alert(e.target.result);
		}
	}
}