import { WebSocket } from "ws";
import { Account, RoomInfo } from "./utils/utils";
import { ActiveStatus } from "@prisma/client";
export class ChatWebSocket extends WebSocket {
	public userId: number = 0;
	public account: Account = { uuid: '', nickName: null, nickTag: 0, avatarKey: null, activeStatus: ActiveStatus.OFFLINE, activeTimestamp: new Date(), statusMessage: '' };
	public rooms: { roomUUID: string, modeFlags: number }[] = [];

	addRoomsInClientSocket(rooms: { chat: RoomInfo }[]) {
		for (let room of rooms) {
			for (let member of room.chat.members) {
				if (member.account.uuid == this.account.uuid) {
					this.rooms.push({ roomUUID: room.chat.uuid, modeFlags: member.modeFlags });
					break;
				}
			}
		}
	}

	deleteRoomInClientSocket(chatUUID: string) {
		for (let i = 0; i < this.rooms.length; ++i) {
			if (this.rooms[i].roomUUID == chatUUID) {
				this.rooms.splice(i, 1);
				break;
			}
		}
	}

	getModeFlags(chatUUID: string): number | null {
		for (let room of this.rooms) {
			if (room.roomUUID == chatUUID) {
				return room.modeFlags;
			}
		}
		return null
	}
}
