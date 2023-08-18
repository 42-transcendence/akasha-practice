const db: IDBDatabase = undefined!;
const transaction = db.transaction(["rushAlbumList"], "readonly");
const objectStore = transaction.objectStore("rushAlbumList");
const cursor = objectStore.openCursor();

async function f(cursor: IDBRequest<IDBCursorWithValue | null>): Promise<IDBRequest<IDBCursorWithValue | null>> {
	return new Promise((resolve, reject) => {
		cursor.onsuccess = (event: Event) => {
			const req = event.target as typeof cursor;
			resolve(req);
		};
	});
}

IDB

async () => {
	let curr = cursor;
	for (let curr = cursor; curr !== null;) {
		curr.result?.continue();
		curr = await f(curr);
	}
}
f(cursor).then((cursor) => {
	if (cursor !== null) {
		cursor.continue();
		return f(cursor);
	}
});


if (cursor) {
	console.log(`Entry: ${cursor.value.albumTitle}, ${cursor.value.year}`);

	cursor.continue();
} else {
	console.log("Entries all displayed.");
}