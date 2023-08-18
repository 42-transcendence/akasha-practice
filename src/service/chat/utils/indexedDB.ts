import { NULL_UUID } from "@libs/uuid";
import { ChatMessages, ChatRoomWithLastMessageUUID, Message } from "./utils";

export class ManageDatabase {

	private IndxDb: IDBFactory;
	private req: IDBOpenDBRequest;
	private db: IDBDatabase;
	private tables: Map<string, IDBObjectStore>;
	private chatCursor: Map<string, string>;
	private nowChatMessages: ChatMessages | undefined = undefined;

	constructor(private chatMessagesList: ChatMessages[], chatRooms: ChatRoomWithLastMessageUUID[]) {
		this.IndxDb = window.indexedDB;
		this.chatCursor = new Map<string, string>;
		for (const chatRoom of chatRooms) {
			this.chatCursor.set(chatRoom.info.uuid, chatRoom.lastMessageId);
		}
		this.openInitDB();
	}

	private openInitDB() {

		this.req = this.IndxDb.open("messagesDB");
		this.tables = new Map<string, IDBObjectStore>;
		this.req.onupgradeneeded = this.addTables;
		this.req.onsuccess = this.setDB;
		this.req.onerror = function (_evt) {
			alert("Why didn't you allow my web app to use IndexedDB?!");
		}
	}

	private setDB(e: any) {
		this.db = e.target.result;
	}

	private addTables(e: any) {
		this.db = e.target.result;
		for (let i = 0; i < this.chatMessagesList.length; i++) {
			const parms: IDBObjectStoreParameters = { keyPath: 'uuid' };
			const table: IDBObjectStore = this.db.createObjectStore(this.chatMessagesList[i].chatUUID, parms);
			this.nowChatMessages = this.chatMessagesList[i];
			table.createIndex('uuid', 'uuid', { unique: true });
			table.createIndex('timestamp', 'timestamp', { unique: true });
			table.transaction.oncomplete = this.setMessages;
			this.tables.set(this.chatMessagesList[i].chatUUID, table);
		}
		this.nowChatMessages = undefined;
	}

	private setMessages(_event: any) {
		if (this.nowChatMessages != undefined) {
			const objectStore: IDBObjectStore = this.getObjectStore(this.nowChatMessages.chatUUID, "readwrite");
			this.nowChatMessages.messages.forEach(function (message) {
				objectStore.add(message);
			})
		}
	}

	private getObjectStore(store_name: string, mode: IDBTransactionMode): IDBObjectStore {
		const tx = this.db.transaction([store_name], mode);
		return tx.objectStore(store_name);
	}

	// private clearObjectStore(store_name: string) {
	// 	const store = this.getObjectStore(store_name, "readwrite");
	// 	store.clear();
	// }

	resetDB() {
		this.db.close();
		this.IndxDb.deleteDatabase("messagesDB");
		this.openInitDB();
	}

	createRows(chatUUID: string, messages: Message[]) {
		const tbl: IDBObjectStore = this.getObjectStore(chatUUID, "readwrite");
		for (const message of messages)
			tbl.add(message);
	}

	createRow(chatUUID: string, message: Message) {
		const tbl: IDBObjectStore = this.getObjectStore(chatUUID, "readwrite");
		tbl.add(message);
	}

	deleteRow(chatUUID: string, messageUUID: string) {
		const tbl: IDBObjectStore = this.getObjectStore(chatUUID, "readwrite");
		tbl.delete(messageUUID)
	}

	updateRow(chatUUID: string, messageUUID: string, message: Message) {
		const tbl: IDBObjectStore = this.getObjectStore(chatUUID, "readwrite");
		const idx: IDBIndex = tbl.index('uuid');
		const req: IDBRequest = idx.get(messageUUID);
		const updateMessage: Message = message;

		req.onsuccess = function (event: any) {
			const data = event.target.result;
			data.accountUUID = updateMessage.accountUUID;
			data.content = updateMessage.content;
			data.modeFlags = updateMessage.modeFlags;
			data.timestamp = updateMessage.timestamp;
			tbl.put(data);
		};
		req.onerror = function (event: any) {
			alert(event.target.result);
		}
	}

	async readRow(chatUUID: string, messageUUID: string): Promise<Message | null> {
		const message = new Promise((resolve, reject) => {
			const tbl: IDBObjectStore = this.getObjectStore(chatUUID, "readonly");
			const idx: IDBIndex = tbl.index('uuid');
			const req: IDBRequest = idx.get(messageUUID);

			req.onsuccess = resolve;
			req.onerror = reject;
		})
		return message.then((event: any) => event.target.result).catch((_event: any) => null);
	}

	private async moveChatCursor(chatUUID: string) {
		const messageUUID = this.chatCursor.get(chatUUID);
		if (messageUUID !== undefined && messageUUID !== NULL_UUID) {
			const messageTime = await this.readRow(chatUUID, messageUUID);
			if (messageTime !== null) {
				const timestamp = new Promise((resolve, reject) => {
					const range = IDBKeyRange.lowerBound(messageTime.timestamp);
					const tbl: IDBObjectStore = this.getObjectStore(chatUUID, "readonly");
					const index = tbl.index('timestamp');
					const req = index.openCursor(range, 'next');

					req.onsuccess = function (event: any) {
						const cursor = event.target.result;
						if (cursor) {
							resolve(cursor)
						}
					};
					req.onerror = reject;
				})
				const promise = timestamp.then((cursor: any) => {
					cursor.advance();
					return (cursor);
				}).catch((_event: any) => null)
			}
		}
	}
}

loadMessages(chatUUID: string) {
	const range = IDBKeyRange.lowerBound("444-44-4444");
	var index = db.transaction(["customers"], "readwrite")
		.objectStore("customers").index('ssn');
	let i = 0;
	index.openCursor(range).onsuccess = function (event) {
		var cursor = event.target.result;
		if (cursor && i < 3) {
			alert(cursor.key + " " + cursor.value.name);
			// 조회된 값으로 무언가 수행한다.
			cursor.continue();
			i++;
		}
	};
	const messageUUID = this.chatCursor.get(chatUUID);
	let lower;
	if (messageUUID != undefined) {
		lower = this.readRow(chatUUID, messageUUID);
	}
	else {

	}
	const range = IDBKeyRange.lowerBound(lower, true);
	const tbl: IDBObjectStore = this.getObjectStore(chatUUID, "readonly");
	const idx: IDBIndex = tbl.index('timestamp');
	const request = idx.openCursor(range);

	request.onsuccess = 
	}

}

