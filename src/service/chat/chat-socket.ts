import { WebSocket } from "ws";
import { ChatWithoutId } from "./utils/utils";
export class ChatWebSocket extends WebSocket {
	public userId: number = 0;
	public userUUID: string = '';
	public rooms: { roomUUID: string, modeFlags: number }[] = [];
	public NowRoomId: number = 0;

	addRoomsInClientSocket(rooms: { chat: ChatWithoutId }[]) {
		for (let room of rooms) {
			for (let member of room.chat.members) {
				if (member.account.uuid == this.userUUID) {
					this.rooms.push({ roomUUID: room.chat.uuid, modeFlags: member.modeFlags });
					break;
				}
			}
		}
	}

	deleteRoomInClientSocket(roomUUID: string) {
		for (let i = 0; i < this.rooms.length; ++i) {
			if (this.rooms[i].roomUUID == roomUUID) {
				this.rooms.splice(i, 1);
				break;
			}
		}
	}
}
