import { NULL_UUID } from "./libs/uuid";
import { ChatMessages, ChatRoomWithLastMessageUUID, Message } from "./utils";

export class MessagesDB {

	private IndxDb: IDBFactory;
	private req!: IDBOpenDBRequest;
	private chatDB: Map<string, IDBDatabase>;
	private chatCursor: Map<string, string>;

	constructor(private chatMessagesList: ChatMessages[], chatRooms: ChatRoomWithLastMessageUUID[]) {
		this.IndxDb = window.indexedDB;
		this.chatCursor = new Map<string, string>;
		this.chatDB = new Map<string, IDBDatabase>;
		for (const chatRoom of chatRooms) {
			this.chatCursor.set(chatRoom.info.uuid, chatRoom.lastMessageId);
		}
		for (const chatMessage of this.chatMessagesList) {
			this.openInitDB(chatMessage);
		}
	}

	private openInitDB(chatMessages: ChatMessages) {
		this.req = this.IndxDb.open("chat_" + chatMessages.chatUUID);
		this.req.onupgradeneeded = (e: any) => {
			const db = e.target.result;
			const parms: IDBObjectStoreParameters = { keyPath: 'uuid' };
			const table: IDBObjectStore = db.createObjectStore("chat_" + chatMessages.chatUUID, parms);
			table.createIndex('timestamp', 'timestamp', { unique: true });
			table.createIndex('uuid', 'uuid', { unique: true });
			table.transaction.oncomplete = (_event: any) => {
				const objectStore: IDBObjectStore = db.transaction(["chat_" + chatMessages.chatUUID], 'readwrite').objectStore("chat_" + chatMessages.chatUUID);
				chatMessages.messages.forEach(function (message: Message) {
					objectStore.add(message);
				})
			};
		};
		this.req.onsuccess = async (event: any) => {
			const db = event.target.result;
			const lastMessage = await this.retMostLowerMessageUUID(chatMessages.chatUUID);
			// 기존 메세지들이 존재하고, 새로운 메세지를 추가하는 경우!
			if (lastMessage !== null) {
				if (lastMessage != NULL_UUID) {
					const lastTimestamp = await this.readRow(chatMessages.chatUUID, lastMessage);
					if (lastTimestamp !== null) {
						for (const message of chatMessages.messages) {
							if (lastTimestamp.timestamp < message.timestamp) {
								this.addMessage(chatMessages.chatUUID, message)
							}
						}
					}
				}
				else {
					this.addMessages(chatMessages.chatUUID, chatMessages.messages) // lastMessage가 없다면, 새로온 메시지들을 업데이트한다.
				}
			}
			else {
				// TODO - DB안에 테이블이 생성되지 않은 경우
			}
			this.chatDB.set("chat_" + chatMessages.chatUUID, db);
		}
		this.req.onerror = function (_evt) {
			alert("Why didn't you allow my web app to use IndexedDB?!");
		}
	}

	addTable(chatMessages: ChatMessages) {
		this.openInitDB(chatMessages);
	}


	private getObjectStore(chatUUID: string, mode: IDBTransactionMode): IDBObjectStore | null {
		const db: IDBDatabase | undefined = this.chatDB.get('chat_' + chatUUID);
		if (db !== undefined)
			return db.transaction(['chat_' + chatUUID], mode).objectStore('chat_' + chatUUID);
		return null
	}

	clearObjectStore(chatUUID: string) {
		const store = this.getObjectStore(chatUUID, "readwrite");
		if (store !== null)
			store.clear();
	}

	deleteDB(chatUUID: string) {
		const db = this.chatDB.get("chat_" + chatUUID);
		if (db !== undefined) {
			db.close();
			this.IndxDb.deleteDatabase("chat_" + chatUUID);
		}
	}

	addMessages(chatUUID: string, messages: Message[]) {
		const tbl: IDBObjectStore | null = this.getObjectStore(chatUUID, "readwrite");
		if (tbl !== null) {
			for (const message of messages)
				tbl.add(message);
		}
	}

	addMessage(chatUUID: string, message: Message) {
		const tbl: IDBObjectStore | null = this.getObjectStore(chatUUID, "readwrite");
		if (tbl !== null)
			tbl.add(message);
	}

	deleteMessage(chatUUID: string, messageUUID: string) {
		const tbl: IDBObjectStore | null = this.getObjectStore(chatUUID, "readwrite");
		if (tbl !== null)
			tbl.delete(messageUUID)
	}

	async updateRow(chatUUID: string, message: Message) {
		const updateMessage: Message = message;
		const tbl: IDBObjectStore | null = this.getObjectStore(chatUUID, "readwrite");
		if (tbl === null) {
			return;
		}
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
			const tbl: IDBObjectStore | null = this.getObjectStore(chatUUID, "readonly");
			if (tbl === null) {
				return null;
			}
			const idx: IDBIndex = tbl.index('uuid');
			const req: IDBRequest = idx.get(messageUUID);

			req.onsuccess = resolve;
			req.onerror = reject;
		})
		return await message.then((event: any) => {
			return event.target.result;
		}).catch((_event: any) => {
			return null;
		});
	}


	private async readUpper20Messages(chatUUID: string): Promise<Message[]> {
		const messageUUID = this.chatCursor.get(chatUUID);
		let cur: Message[] = [];
		if (messageUUID !== undefined && messageUUID !== NULL_UUID) {
			const messageTime = await this.readRow(chatUUID, messageUUID);
			if (messageTime !== null) {
				const timestamp = new Promise((resolve, reject) => {
					const range = IDBKeyRange.upperBound(messageTime.timestamp);
					const tbl: IDBObjectStore | null = this.getObjectStore(chatUUID, "readonly");
					if (tbl === null) {
						return [];
					}
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
					const tbl: IDBObjectStore | null = this.getObjectStore(chatUUID, "readonly");
					if (tbl === null) {
						return [];
					}
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
				const tbl: IDBObjectStore | null = this.getObjectStore(chatUUID, "readonly");
				if (tbl === null) {
					return [];
				}
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
					const tbl: IDBObjectStore | null = this.getObjectStore(chatUUID, "readonly");
					if (tbl === null) {
						return [];
					}
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
			const tbl: IDBObjectStore | null = this.getObjectStore(chatUUID, "readonly");
			if (tbl === null) {
				return null;
			}
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
			const tbl: IDBObjectStore | null = this.getObjectStore(chatUUID, "readonly");
			if (tbl === null) {
				return null;
			}
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
					const tbl: IDBObjectStore | null = this.getObjectStore(chatUUID, "readonly");
					if (tbl === null) {
						return null;
					}
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
			const tbl: IDBObjectStore | null = this.getObjectStore(chatUUID, "readonly");
			if (tbl === null) {
				return null;
			}
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