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
		this.openInitDB();
		this.chatCursor = new Map<string, string>;
		for (const chatRoom of chatRooms) {
			this.chatCursor.set(chatRoom.info.uuid, chatRoom.lastMessageId);
		}
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

	async updateRow(chatUUID: string, message: Message) {
		const updateMessage: Message = message;
		const tbl: IDBObjectStore = this.getObjectStore(chatUUID, "readwrite");
		const idx: IDBIndex = tbl.index('uuid');
		const update = new Promise((resolve, reject) => {
			const req: IDBRequest = idx.get(message.uuid);

			req.onsuccess = resolve;
			req.onerror = reject;
		});
		await update.then((event: any) => {
			const data = event.target.result;
			data.accountUUID = updateMessage.accountUUID;
			data.content = updateMessage.content;
			data.modeFlags = updateMessage.modeFlags;
			data.timestamp = updateMessage.timestamp;
			tbl.put(data);
		}).catch((event: any) => {
			alert(event.target.result);
		})
	}

	async readRow(chatUUID: string, messageUUID: string): Promise<Message | null> {
		const message = new Promise((resolve, reject) => {
			const tbl: IDBObjectStore = this.getObjectStore(chatUUID, "readonly");
			const idx: IDBIndex = tbl.index('uuid');
			const req: IDBRequest = idx.get(messageUUID);

			req.onsuccess = resolve;
			req.onerror = reject;
		})
		return await message.then((event: any) => event.target.result).catch((_event: any) => null);
	}


	private async readUpper20Messages(chatUUID: string): Promise<Message[]> {
		const messageUUID = this.chatCursor.get(chatUUID);
		let cur: Message[] = [];
		if (messageUUID !== undefined && messageUUID !== NULL_UUID) {
			const messageTime = await this.readRow(chatUUID, messageUUID);
			if (messageTime !== null) {
				const timestamp = new Promise((resolve, reject) => {
					const range = IDBKeyRange.upperBound(messageTime.timestamp);
					const tbl: IDBObjectStore = this.getObjectStore(chatUUID, "readonly");
					const index = tbl.index('timestamp');
					const req = index.openCursor(range, 'prev');
					let count = 0

					req.onsuccess = (event: any) => {
						const cursor = event.target.result;
						if (cursor && count < 20) {
							cursor.continue();
							cur.unshift(cursor.value);
							count++;
						}
						else {
							const firstMessage = cur.at(0);
							if (firstMessage !== undefined) {
								this.chatCursor.set(chatUUID, firstMessage.uuid);
							}
							resolve(cur);
						}
					};
					req.onerror = reject;
				})
				const promise = await timestamp.then((cursor: any) => {
					return (cursor);
				}).catch((_event: any) => [])
				return (promise);
			}
			else {
				const timestamp = new Promise((resolve, reject) => {
					const tbl: IDBObjectStore = this.getObjectStore(chatUUID, "readonly");
					const index = tbl.index('timestamp');
					const req = index.openCursor(undefined, 'prev');

					req.onsuccess = (event: any) => {
						const cursor = event.target.result;
						if (cursor) {
							cursor.continue();
							cur.unshift(cursor.value);
						}
						else {
							const firstMessage = cur.at(0);
							if (firstMessage !== undefined) {
								this.chatCursor.set(chatUUID, firstMessage.uuid);
							}
							resolve(cur);
						}
					};
					req.onerror = reject;
				})
				const promise = await timestamp.then((cursor: any) => {
					return (cursor);
				}).catch((_event: any) => []);
				return (promise);
			}
		}
		else if (messageUUID !== undefined && messageUUID === NULL_UUID) {
			const timestamp = new Promise((resolve, reject) => {
				const tbl: IDBObjectStore = this.getObjectStore(chatUUID, "readonly");
				const index = tbl.index('timestamp');
				const req = index.openCursor(undefined, 'prev');
				let count = 0

				req.onsuccess = (event: any) => {
					const cursor = event.target.result;
					if (cursor && count < 20) {
						cursor.continue();
						cur.unshift(cursor.value);
						count++;
					}
					else {
						const firstMessage = cur.at(0);
						if (firstMessage !== undefined) {
							this.chatCursor.set(chatUUID, firstMessage.uuid);
						}
						resolve(cur);
					}
				};
				req.onerror = reject;
			})
			const promise = await timestamp.then((cursor: any) => {
				return (cursor);
			}).catch((_event: any) => [])
			return (promise);
		}
		return (cur);
	}

	private async readUnreadMessages(chatUUID: string): Promise<Message[]> {
		const messageUUID = this.chatCursor.get(chatUUID);
		let cur: Message[] = [];
		if (messageUUID !== undefined && messageUUID !== NULL_UUID) {
			const messageTime = await this.readRow(chatUUID, messageUUID);
			if (messageTime !== null) {
				const timestamp = new Promise((resolve, reject) => {
					const range = IDBKeyRange.lowerBound(messageTime.timestamp);
					const tbl: IDBObjectStore = this.getObjectStore(chatUUID, "readonly");
					const index = tbl.index('timestamp');
					const req = index.openCursor(range, 'prev');

					req.onsuccess = (event: any) => {
						const cursor = event.target.result;
						if (cursor) {
							cursor.continue();
							cur.push(cursor.value);
						}
						else {
							resolve(cur);
						}
					};
					req.onerror = reject;
				})
				const promise = await timestamp.then((cursor: any) => {
					return (cursor);
				}).catch((_event: any) => [])
				return (promise);
			}
		}
		return (cur);
	}

	async enterLoadMessages(chatUUID: string): Promise<Message[]> {
		const prevMessages: Message[] = await this.readUpper20Messages(chatUUID);
		const newMessages: Message[] = await this.readUnreadMessages(chatUUID);
		const retMessages: Message[] = prevMessages.concat(newMessages);
		return retMessages;
	}

	async scrollLoadMessages(chatUUID: string): Promise<Message[]> {
		const retMessages: Message[] = await this.readUpper20Messages(chatUUID);
		return retMessages;
	}

	async exitRoom(chatUUID: string) {
		const cursor = await this.retMostlowerMessage(chatUUID);
		if (cursor !== null) {
			this.chatCursor.set(chatUUID, cursor);
		}
	}

	private async retMostUpperMessage(chatUUID: string): Promise<string | null> {
		const timestamp = new Promise((resolve, reject) => {
			const tbl: IDBObjectStore = this.getObjectStore(chatUUID, "readonly");
			const index = tbl.index('timestamp');
			const req = index.openCursor(undefined, 'next');

			req.onsuccess = (event: any) => {
				const cursor = event.target.result;
				resolve(cursor);
			};
			req.onerror = reject;
		})
		const promise = await timestamp.then((cursor: any) => {
			if (cursor) {
				return cursor.value?.uuid ?? NULL_UUID;
			}
			else {
				return NULL_UUID;
			}
		}).catch((_event: any) => null);
		return promise;
	}

	private async retMostlowerMessage(chatUUID: string): Promise<string | null> {
		const timestamp = new Promise((resolve, reject) => {
			const tbl: IDBObjectStore = this.getObjectStore(chatUUID, "readonly");
			const index = tbl.index('timestamp');
			const req = index.openCursor(undefined, 'prev');

			req.onsuccess = (event: any) => {
				const cursor = event.target.result;
				resolve(cursor);
			};
			req.onerror = reject;
		})
		const promise = await timestamp.then((cursor: any) => {
			if (cursor) {
				return cursor.value?.uuid ?? NULL_UUID;
			}
			else {
				return NULL_UUID;
			}
		}).catch((_event: any) => null);
		return promise;
	}

	async nonReadMessagesCounts(chatUUID: string, messageUUID: string): Promise<number | null> {
		const newMessageUUID = this.readRow(chatUUID, messageUUID);
		let messsageId;
		if (newMessageUUID === null) {
			messsageId = await this.retMostUpperMessage(chatUUID);
			if (messsageId === null) {
				return null;
			}
		}
		else {
			messsageId = messageUUID;
		}
		if (messsageId !== NULL_UUID) {
			const messageTime = await this.readRow(chatUUID, messsageId);
			if (messageTime !== null) {
				const timestamp = new Promise((resolve, reject) => {
					const range = IDBKeyRange.lowerBound(messageTime.timestamp);
					const tbl: IDBObjectStore = this.getObjectStore(chatUUID, "readonly");
					const index = tbl.index('timestamp');
					const req = index.count(range);

					req.onsuccess = resolve;
					req.onerror = reject;
				})
				const promise = await timestamp.then((event: any) => {
					const result = event.target.result;
					return (result);
				}).catch((_event: any) => null)
				return (promise);
			}
		}
		return null;
	}
}