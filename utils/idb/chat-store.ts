import { IDBCP } from "./indexed-dbcp";

const DB_NAME_PREFIX = "akasha-";

function getMetadataDB(): Promise<IDBDatabase> {
  return IDBCP.getOrOpen(`${DB_NAME_PREFIX}chat`, {
    onUpgradeNeeded(db: IDBDatabase) {
      try {
        db.deleteObjectStore("rooms");
      } catch {
        //NOTE: ignore
      }
      const rooms = db.createObjectStore("rooms", {
        keyPath: "id",
      });
      rooms.createIndex("account", "accounts", {
        multiEntry: true,
      });
      // title
      // modeFlags
      // fetchedMessageId

      try {
        db.deleteObjectStore("directs");
      } catch {
        //NOTE: ignore
      }
      const directs = db.createObjectStore("directs", {
        keyPath: ["account", "target"],
      });
      directs.createIndex("account", "account");
      // fetchedMessageId
    },
    onClose() {
      alert(
        "새로운 버전의 애플리케이션이 준비되었습니다. 페이지를 닫고 다시 연결을 진행해 주세요."
      );
    },
  });
}

export type RoomSchema = {
  id: string;
  accounts: string[];
  title: string;
  modeFlags: number;
  fetchedMessageId: string | null;
};

export type DirectSchema = {
  account: string;
  target: string;
  fetchedMessageId: string | null;
};

function getDB(chatId: string): Promise<IDBDatabase> {
  return IDBCP.getOrOpen(`${DB_NAME_PREFIX}chat-${chatId}`, {
    onUpgradeNeeded(db: IDBDatabase) {
      try {
        db.deleteObjectStore("members");
      } catch {
        //NOTE: ignore
      }
      db.createObjectStore("members", { keyPath: "accountId" });
      // role

      try {
        db.deleteObjectStore("messages");
      } catch {
        //NOTE: ignore
      }
      const messages = db.createObjectStore("messages", {
        keyPath: "id",
      });
      // accountId
      // content
      // messageType
      messages.createIndex("timestamp", "timestamp", { unique: false });
    },
  });
}

function removeDB(chatId: string): Promise<boolean> {
  return IDBCP.delete(`${DB_NAME_PREFIX}chat-${chatId}`);
}

export function makeDirectChatKey(accountId: string, targetId: string): string {
  return `${accountId}_${targetId}`;
}

export function isDirectChatKey(chatId: string): boolean {
  return chatId.includes("_");
}

export function extractTargetFromDirectChatKey(chatId: string): string {
  return chatId.split("_")[1];
}

export type MemberSchema = {
  accountId: string;
  role: number;
};

export type MessageSchema = {
  id: string;
  accountId: string;
  content: string;
  messageType: number;
  timestamp: Date;
};

export class ChatStore {
  /// Manipulate Room Set
  #Room: undefined;

  static async addRoom(
    accountId: string,
    chatId: string,
    title: string,
    modeFlags: number,
    fetchedMessageId: string | null = null
  ): Promise<boolean> {
    const db = await getMetadataDB();
    return new Promise((resolve) => {
      const tx = db.transaction(["rooms"], "readwrite");
      tx.onerror = () => resolve(false);

      const rooms = tx.objectStore("rooms");
      const roomGet = rooms.get(chatId);
      roomGet.onsuccess = () => {
        const room = roomGet.result as RoomSchema | undefined;
        if (room === undefined) {
          // Insert
          const roomAdd = rooms.add({
            ["id"]: chatId,
            ["accounts"]: [accountId],
            ["title"]: title,
            ["modeFlags"]: modeFlags,
            ["fetchedMessageId"]: fetchedMessageId,
          } satisfies RoomSchema);

          roomAdd.onsuccess = () =>
            getDB(chatId)
              .then(() => resolve(true))
              .catch(() => resolve(false));
        } else {
          // Update
          if (!room["accounts"].includes(accountId)) {
            room["accounts"].push(accountId);
          }
          room["title"] = title;
          room["modeFlags"] = modeFlags;
          if (fetchedMessageId !== null) {
            room["fetchedMessageId"] = fetchedMessageId;
          }
          const roomPut = rooms.put(room);

          roomPut.onsuccess = () => resolve(true);
        }
      };
    });
  }

  static async deleteRoom(accountId: string, chatId: string): Promise<boolean> {
    const db = await getMetadataDB();
    return new Promise((resolve) => {
      const tx = db.transaction(["rooms"], "readwrite");
      tx.onerror = () => resolve(false);

      const rooms = tx.objectStore("rooms");
      const roomGet = rooms.get(chatId);
      roomGet.onsuccess = () => {
        const room = roomGet.result as RoomSchema | undefined;
        if (room !== undefined) {
          const accounts = room["accounts"];
          const index = accounts.indexOf(accountId);
          if (!(index < 0)) {
            accounts.splice(index, 1);
          }

          if (accounts.length !== 0) {
            // Update
            const roomPut = rooms.put(room);

            roomPut.onsuccess = () => resolve(true);
          } else {
            // Delete
            const roomDelete = rooms.delete(chatId);

            roomDelete.onsuccess = () =>
              removeDB(chatId)
                .then(() => resolve(true))
                .catch(() => resolve(false));
          }
        } else {
          resolve(false);
        }
      };
    });
  }

  static async getRoomSet(accountId: string): Promise<Set<string> | null> {
    const db = await getMetadataDB();
    return new Promise((resolve) => {
      const tx = db.transaction(["rooms"], "readonly");
      tx.onerror = () => resolve(null);

      const rooms = tx.objectStore("rooms");
      const roomAllByAccountGet = rooms.index("account").getAll(accountId);
      roomAllByAccountGet.onsuccess = () => {
        const roomArray = roomAllByAccountGet.result as RoomSchema[];
        resolve(new Set<string>(roomArray.map((e) => e["id"])));
      };
    });
  }

  static async hasRoom(accountId: string, chatId: string): Promise<boolean> {
    const db = await getMetadataDB();
    return new Promise((resolve) => {
      const tx = db.transaction(["rooms"], "readonly");
      tx.onerror = () => resolve(false);

      const rooms = tx.objectStore("rooms");
      const roomGet = rooms.get(chatId);
      roomGet.onsuccess = () => {
        const room = roomGet.result as RoomSchema | undefined;
        if (room !== undefined) {
          resolve(room.accounts.includes(accountId));
        } else {
          resolve(false);
        }
      };
    });
  }

  /// Manipulate Room-Options
  #Room_Options: undefined;

  private static async getFromRoom<T extends keyof RoomSchema>(
    chatId: string,
    key: T
  ): Promise<RoomSchema[T]> {
    const db = await getMetadataDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["rooms"], "readonly");
      tx.onerror = () => reject(new Error());

      const rooms = tx.objectStore("rooms");
      const roomGet = rooms.get(chatId);
      roomGet.onsuccess = () => {
        const room = roomGet.result as RoomSchema | undefined;
        if (room !== undefined) {
          resolve(room[key]);
        } else {
          reject(new Error());
        }
      };
    });
  }

  private static async putToRoom<T extends keyof RoomSchema>(
    chatId: string,
    key: T,
    value: RoomSchema[T]
  ): Promise<void> {
    const db = await getMetadataDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["rooms"], "readwrite");
      tx.onerror = () => reject(new Error());

      const rooms = tx.objectStore("rooms");
      const roomGet = rooms.get(chatId);
      roomGet.onsuccess = () => {
        const room = roomGet.result as RoomSchema | undefined;
        if (room !== undefined) {
          room[key] = value;
          const roomPut = rooms.put(room);

          roomPut.onsuccess = () => resolve();
        } else {
          reject(new Error());
        }
      };
    });
  }

  static async getTitle(chatId: string): Promise<string> {
    return this.getFromRoom(chatId, "title");
  }

  static async setTitle(chatId: string, title: string): Promise<void> {
    return this.putToRoom(chatId, "title", title);
  }

  static async getModeFlags(chatId: string): Promise<number> {
    return this.getFromRoom(chatId, "modeFlags");
  }

  static async setModeFlags(chatId: string, modeFlags: number): Promise<void> {
    return this.putToRoom(chatId, "modeFlags", modeFlags);
  }

  static async getFetchedMessageId(chatId: string): Promise<string | null> {
    return this.getFromRoom(chatId, "fetchedMessageId");
  }

  static async setFetchedMessageId(
    chatId: string,
    fetchedMessageId: string
  ): Promise<void> {
    return this.putToRoom(chatId, "fetchedMessageId", fetchedMessageId);
  }

  /// Manipulate Member Dictionary
  #MemberDictionary: undefined;

  static async putMember(
    chatId: string,
    member: MemberSchema
  ): Promise<boolean> {
    const db = await getDB(chatId);
    return new Promise((resolve) => {
      const tx = db.transaction(["members"], "readwrite");
      tx.onerror = () => resolve(false);

      const members = tx.objectStore("members");
      const memberPut = members.put(member);

      memberPut.onsuccess = () => resolve(true);
    });
  }

  static async deleteMember(
    chatId: string,
    accountId: string
  ): Promise<boolean> {
    const db = await getDB(chatId);
    return new Promise((resolve) => {
      const tx = db.transaction(["members"], "readwrite");
      tx.onerror = () => resolve(false);

      const members = tx.objectStore("members");
      const memberDelete = members.delete(accountId);

      memberDelete.onsuccess = () => resolve(true);
    });
  }

  static async getMemberDictionary(
    chatId: string
  ): Promise<Map<string, MemberSchema>> {
    const db = await getDB(chatId);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["members"], "readonly");
      tx.onerror = () => reject(new Error());

      const members = tx.objectStore("members");
      const memberAllGet = members.getAll();
      memberAllGet.onsuccess = () => {
        const memberArray = memberAllGet.result as MemberSchema[];
        resolve(
          memberArray.reduce(
            (map, e) => map.set(e["accountId"], e),
            new Map<string, MemberSchema>()
          )
        );
      };
    });
  }

  static async getMember(
    chatId: string,
    accountId: string
  ): Promise<MemberSchema | null> {
    const db = await getDB(chatId);
    return new Promise((resolve) => {
      const tx = db.transaction(["members"], "readonly");
      tx.onerror = () => resolve(null);

      const members = tx.objectStore("members");
      const memberGet = members.get(accountId);
      memberGet.onsuccess = () => {
        const member = memberGet.result as MemberSchema | undefined;
        resolve(member ?? null);
      };
    });
  }

  static async mergeMember(
    chatId: string,
    accountId: string,
    changes: Partial<MemberSchema>
  ): Promise<MemberSchema | null> {
    const prevMember: MemberSchema | null = await this.getMember(
      chatId,
      accountId
    );
    if (prevMember === null) {
      return null;
    }

    const member: MemberSchema = {
      ...prevMember,
      ...changes,
      accountId,
    };
    const put = await this.putMember(chatId, member);
    if (!put) {
      throw new Error();
    }

    return member;
  }

  static async truncateMember(chatId: string): Promise<boolean> {
    const db = await getDB(chatId);
    return new Promise((resolve) => {
      const tx = db.transaction(["members"], "readwrite");
      tx.onerror = () => resolve(false);

      const members = tx.objectStore("members");
      const memberClear = members.clear();

      memberClear.onsuccess = () => resolve(true);
    });
  }

  /// Manipulate Message List
  #MessageList: undefined;

  static async addMessage(
    chatId: string,
    message: MessageSchema
  ): Promise<boolean> {
    const db = await getDB(chatId);
    return new Promise((resolve) => {
      const tx = db.transaction(["messages"], "readwrite");
      tx.onerror = () => resolve(false);

      const messages = tx.objectStore("messages");
      const messageAdd = messages.add(message);

      messageAdd.onsuccess = () => resolve(true);
    });
  }

  static async addMessageBulk(
    chatId: string,
    messageList: MessageSchema[]
  ): Promise<boolean> {
    const db = await getDB(chatId);
    return new Promise((resolve) => {
      const tx = db.transaction(["messages"], "readwrite");
      tx.onerror = () => resolve(false);

      const messages = tx.objectStore("messages");
      const promiseList = new Array<Promise<boolean>>();
      for (const message of messageList) {
        promiseList.push(
          new Promise((resolve) => {
            const messageAdd = messages.add(message);

            messageAdd.onsuccess = () => resolve(true);
            messageAdd.onerror = () => resolve(false);
          })
        );
      }

      Promise.all(promiseList)
        .then((e) => resolve(!e.includes(false)))
        .catch(() => resolve(false));
    });
  }

  static async getLatestMessage(
    chatId: string,
    messageType?: number | undefined
  ): Promise<MessageSchema | null> {
    const db = await getDB(chatId);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["messages"], "readonly");
      tx.onerror = () => reject(new Error());

      const messages = tx.objectStore("messages");

      const messageAllReverseByTimestampCursor = messages
        .index("timestamp")
        .openCursor(null, "prev");
      messageAllReverseByTimestampCursor.onsuccess = () => {
        const cursor = messageAllReverseByTimestampCursor.result;
        if (cursor !== null) {
          const message = cursor.value as MessageSchema;
          if (
            messageType !== undefined &&
            message.messageType !== messageType
          ) {
            cursor.continue();
            return;
          }
          resolve(message);
        } else {
          resolve(null);
        }
      };
    });
  }

  static async countAfterMessage(
    chatId: string,
    messageId: string | null
  ): Promise<number> {
    const db = await getDB(chatId);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["messages"], "readonly");
      tx.onerror = () => reject(new Error());

      const messages = tx.objectStore("messages");

      if (messageId === null) {
        const messageCount = messages.count();
        messageCount.onsuccess = () => resolve(messageCount.result);
        return;
      }

      const messageGet = messages.get(messageId);

      messageGet.onsuccess = () => {
        const message = messageGet.result as MessageSchema | undefined;
        if (message === undefined) {
          reject(new Error());
          return;
        }

        const messageAfterByTimestampCount = messages
          .index("timestamp")
          .count(IDBKeyRange.lowerBound(message["timestamp"], true));
        messageAfterByTimestampCount.onsuccess = () =>
          resolve(messageAfterByTimestampCount.result);
      };
    });
  }

  private static async getContinueMessages(
    reverse: boolean,
    chatId: string,
    messageId: string,
    limit?: number | undefined
  ): Promise<MessageSchema[]> {
    const db = await getDB(chatId);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["messages"], "readonly");
      tx.onerror = () => reject(new Error());

      const messages = tx.objectStore("messages");
      const messageGet = messages.get(messageId);

      messageGet.onsuccess = () => {
        const message = messageGet.result as MessageSchema | undefined;
        if (message === undefined) {
          reject(new Error());
          return;
        }

        const targetTimestamp = message["timestamp"];
        const messageByTimestampIndex = messages.index("timestamp");
        const messageContinueByTimestampCursor = !reverse
          ? messageByTimestampIndex.openCursor(
              IDBKeyRange.lowerBound(targetTimestamp, false),
              "next"
            )
          : messageByTimestampIndex.openCursor(
              IDBKeyRange.upperBound(targetTimestamp, false),
              "prev"
            );
        const messageAllContinueByTimestamp = new Array<MessageSchema>();
        messageContinueByTimestampCursor.onsuccess = () => {
          const cursor = messageContinueByTimestampCursor.result;
          if (cursor !== null) {
            const message = cursor.value as MessageSchema;
            if (message["id"] === messageId) {
              // Indirect open range (exclude)
              messageAllContinueByTimestamp.splice(0);
            } else {
              messageAllContinueByTimestamp.push(message);
            }

            if (
              limit === undefined ||
              (messageAllContinueByTimestamp.length < limit &&
                // Prevent indirect exclusion checks from being invalidated by exceeding limit at the same timestamp.
                targetTimestamp.valueOf() !== message["timestamp"].valueOf())
              //TODO: 특수한 정지 표지 메시지로 fetch가 필요함을 나타내고, 표지가 관측될 때 서버로 요청을 보내면, lazy load를 만들 수 있을 것이다.
            ) {
              cursor.continue();
              return;
            }
          }

          if (limit !== undefined) {
            messageAllContinueByTimestamp.splice(limit);
          }
          if (reverse) {
            messageAllContinueByTimestamp.reverse();
          }
          resolve(messageAllContinueByTimestamp);
        };
      };
    });
  }

  static async getAfterMessages(
    chatId: string,
    messageId: string,
    limit?: number | undefined
  ): Promise<MessageSchema[]> {
    return this.getContinueMessages(false, chatId, messageId, limit);
  }

  static async getBeforeMessages(
    chatId: string,
    messageId: string,
    limit?: number | undefined
  ): Promise<MessageSchema[]> {
    return this.getContinueMessages(true, chatId, messageId, limit);
  }

  static async getAllMessages(
    chatId: string,
    limit?: number | undefined
  ): Promise<MessageSchema[]> {
    const db = await getDB(chatId);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["messages"], "readonly");
      tx.onerror = () => reject(new Error());

      const messages = tx.objectStore("messages");

      const messageByTimestampIndex = messages.index("timestamp");
      const messageAllByTimestampCursor = messageByTimestampIndex.openCursor(
        null,
        "next"
      );
      const messageAllByTimestamp = new Array<MessageSchema>();
      messageAllByTimestampCursor.onsuccess = () => {
        const cursor = messageAllByTimestampCursor.result;
        if (
          cursor !== null &&
          (limit === undefined || messageAllByTimestamp.length < limit)
        ) {
          const message = cursor.value as MessageSchema;
          messageAllByTimestamp.push(message);
          cursor.continue();
        } else {
          resolve(messageAllByTimestamp);
        }
      };
    });
  }

  /// Manipulate Direct Set
  #Direct: undefined;

  static async addDirect(
    accountId: string,
    targetId: string,
    fetchedMessageId: string | null = null
  ): Promise<boolean> {
    const db = await getMetadataDB();
    return new Promise((resolve) => {
      const tx = db.transaction(["directs"], "readwrite");
      tx.onerror = () => resolve(false);

      const directs = tx.objectStore("directs");
      const directAdd = directs.add({
        ["account"]: accountId,
        ["target"]: targetId,
        ["fetchedMessageId"]: fetchedMessageId,
      } satisfies DirectSchema);

      directAdd.onsuccess = () =>
        getDB(makeDirectChatKey(accountId, targetId))
          .then(() => resolve(true))
          .catch(() => resolve(false));
    });
  }

  static async deleteDirect(
    accountId: string,
    targetId: string
  ): Promise<boolean> {
    const db = await getMetadataDB();
    return new Promise((resolve) => {
      const tx = db.transaction(["directs"], "readwrite");
      tx.onerror = () => resolve(false);

      const directs = tx.objectStore("directs");
      const directDelete = directs.delete([accountId, targetId]);

      directDelete.onsuccess = () =>
        removeDB(makeDirectChatKey(accountId, targetId))
          .then(() => resolve(true))
          .catch(() => resolve(false));
    });
  }

  static async getDirectSet(accountId: string): Promise<Set<string> | null> {
    const db = await getMetadataDB();
    return new Promise((resolve) => {
      const tx = db.transaction(["directs"], "readonly");
      tx.onerror = () => resolve(null);

      const directs = tx.objectStore("directs");
      const directAllByAccountGet = directs.index("account").getAll(accountId);
      directAllByAccountGet.onsuccess = () => {
        const directArray = directAllByAccountGet.result as DirectSchema[];
        resolve(new Set<string>(directArray.map((e) => e["target"])));
      };
    });
  }

  static async getDirectFetchedMessageId(
    accountId: string,
    targetId: string
  ): Promise<string | null> {
    const db = await getMetadataDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["directs"], "readonly");
      tx.onerror = () => reject(new Error());

      const directs = tx.objectStore("directs");
      const directGet = directs.get([accountId, targetId]);
      directGet.onsuccess = () => {
        const direct = directGet.result as DirectSchema | undefined;
        if (direct !== undefined) {
          resolve(direct["fetchedMessageId"]);
        } else {
          reject(new Error());
        }
      };
    });
  }

  static async setDirectFetchedMessageId(
    accountId: string,
    targetId: string,
    fetchedMessageId: string
  ): Promise<void> {
    const db = await getMetadataDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["directs"], "readwrite");
      tx.onerror = () => reject(new Error());

      const directs = tx.objectStore("directs");
      const directGet = directs.get([accountId, targetId]);
      directGet.onsuccess = () => {
        const direct = directGet.result as DirectSchema | undefined;
        if (direct !== undefined) {
          direct["fetchedMessageId"] = fetchedMessageId;
          const directPut = directs.put(direct);

          directPut.onsuccess = () => resolve();
        } else {
          reject(new Error());
        }
      };
    });
  }
}
