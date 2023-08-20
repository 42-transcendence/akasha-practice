import { NULL_UUID } from "@libs/uuid";
import { ChatMessages, ChatRoomWithLastMessageUUID, Message } from "./utils";

export class MessagesDB {

	private IndxDb: IDBFactory;
	private req: IDBOpenDBRequest;
	private db: IDBDatabase;
	private tables: Map<string, IDBObjectStore>;
	private chatCursor: Map<string, string>;

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
		this.req.onsuccess = async (event: any) => {
			this.db = event.target.result;
			for (let i = 0; i < this.chatMessagesList.length; i++) {
				const lastMessage = await this.retMostLowerMessageUUID(this.chatMessagesList[i].chatUUID);
				if (lastMessage !== null) {
					const lastTimestamp = await this.readRow(this.chatMessagesList[i].chatUUID, lastMessage);
					if (lastTimestamp !== null) {
						for (const message of this.chatMessagesList[i].messages) {
							if (lastTimestamp.timestamp < message.timestamp) {
								this.addMessage(this.chatMessagesList[i].chatUUID, message)
							}
						}
					}
					else {
						continue; // lastMessage가 존재하지만, 그 열을 찾지 못한 경우는 오류이다.
					}
				}
				else {
					this.addMessages(this.chatMessagesList[i].chatUUID, this.chatMessagesList[i].messages) // lastMessage가 없다면, 새로온 메시지들을 업데이트한다.
				}
			}
		};
		this.req.onerror = function (_evt) {
			alert("Why didn't you allow my web app to use IndexedDB?!");
		}
	}

	private addTables(e: any) {
		this.db = e.target.result;
		for (let i = 0; i < this.chatMessagesList.length; i++) {
			const parms: IDBObjectStoreParameters = { keyPath: 'uuid' };
			const table: IDBObjectStore = this.db.createObjectStore("chat_" + this.chatMessagesList[i].chatUUID, parms);
			// table.createIndex('uuid', 'uuid', { unique: true });
			table.createIndex('timestamp', 'timestamp', { unique: true });
			table.transaction.oncomplete = (_event: any) => {
				const objectStore: IDBObjectStore = this.getObjectStore(this.chatMessagesList[i].chatUUID, "readwrite");
				this.chatMessagesList[i].messages.forEach(function (message) {
					objectStore.add(message);
				})
			};
			this.tables.set(this.chatMessagesList[i].chatUUID, table);
		}
	}

	addTable(newChatMessages: ChatMessages) {
		const parms: IDBObjectStoreParameters = { keyPath: 'uuid' };
		const table: IDBObjectStore = this.db.createObjectStore("chat_" + newChatMessages.chatUUID, parms);
		// table.createIndex('uuid', 'uuid', { unique: true });
		table.createIndex('timestamp', 'timestamp', { unique: true });
		table.transaction.oncomplete = (_event: any) => {
			const objectStore: IDBObjectStore = this.getObjectStore(newChatMessages.chatUUID, "readwrite");
			newChatMessages.messages.forEach(function (message) {
				objectStore.add(message);
			})
		};
		this.tables.set(newChatMessages.chatUUID, table);
	}

	private getObjectStore(store_name: string, mode: IDBTransactionMode): IDBObjectStore {
		const tx = this.db.transaction([store_name], mode);
		return tx.objectStore(store_name);
	}

	clearObjectStore(store_name: string) {
		const store = this.getObjectStore(store_name, "readwrite");
		store.clear();
	}

	resetDB() {
		this.db.close();
		this.IndxDb.deleteDatabase("messagesDB");
		this.openInitDB();
	}

	addMessages(chatUUID: string, messages: Message[]) {
		const tbl: IDBObjectStore = this.getObjectStore(chatUUID, "readwrite");
		for (const message of messages)
			tbl.add(message);
	}

	addMessage(chatUUID: string, message: Message) {
		const tbl: IDBObjectStore = this.getObjectStore(chatUUID, "readwrite");
		tbl.add(message);
	}

	deleteMessage(chatUUID: string, messageUUID: string) {
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
					const req = index.openCursor(undefined, 'next');

					req.onsuccess = (event: any) => {
						const cursor = event.target.result;
						if (cursor) {
							cursor.continue();
							cur.push(cursor.value);
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

	async readBelowCursorMessages(chatUUID: string): Promise<Message[]> {
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
		const newMessages: Message[] = await this.readBelowCursorMessages(chatUUID);
		const prevMessages: Message[] = await this.readUpper20Messages(chatUUID);
		const retMessages: Message[] = prevMessages.concat(newMessages);
		return retMessages;
	}

	async scrollLoadMessages(chatUUID: string): Promise<Message[]> {
		const retMessages: Message[] = await this.readUpper20Messages(chatUUID);
		return retMessages;
	}

	async exitRoom(chatUUID: string) {
		const cursor = await this.retMostLowerMessageUUID(chatUUID);
		if (cursor !== null) {
			this.chatCursor.set(chatUUID, cursor);
		}
	}

	private async retMostUpperMessageUUID(chatUUID: string): Promise<string | null> {
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

	private async retMostLowerMessageUUID(chatUUID: string): Promise<string | null> {
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
		const newMessageUUID: Message | null = await this.readRow(chatUUID, messageUUID);
		let messsageId;
		if (newMessageUUID === null) {
			messsageId = await this.retMostUpperMessageUUID(chatUUID);
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

	async retMostLowerMessage(chatUUID: string): Promise<Message | null> {
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
				return cursor.value ?? null;
			}
			else {
				return null;
			}
		}).catch((_event: any) => null);
		return promise;
	}

}