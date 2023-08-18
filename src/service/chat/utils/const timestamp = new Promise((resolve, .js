const timestamp = new Promise((resolve, reject) => {
	const range = IDBKeyRange.lowerBound("444-44-4444");
	var index = db.transaction(["customers"], "readwrite")
		.objectStore("customers").index('ssn');
	const req = index.openCursor(range, 'next');
	const req1 = index.count(range);

	req.onsuccess = function (event) {
		const cursor = event.target.result;
		if (cursor) {
			alert(cursor.key + " " + cursor.value.name);
			resolve(cursor);
		}
	};
	req.onerror = reject;
	req1.onsuccess = () => {
		console.log(req1.result);
	}
})
const promise = timestamp.then((cursor) => {
	cursor.advance(1);
	return (cursor.value)
}).catch((_event) => null);