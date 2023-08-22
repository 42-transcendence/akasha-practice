const customerData = [
	{ ssn: "444-44-4444", name: "Bill", age: 35, email: "bill@company.com" },
	{ ssn: "555-55-5555", name: "Donna", age: 32, email: "donna@home.org" },
];

const dbName = "the_name";
var db;

var request = indexedDB.open(dbName, 2);

request.onerror = function (event) {
};
request.onupgradeneeded = function (event) {
	db = event.target.result;

	const objectStore = db.createObjectStore("customers", { keyPath: "ssn" });
	console.log(objectStore);
	objectStore.createIndex("name", "name", { unique: false });

	objectStore.createIndex("email", "email", { unique: true });

	objectStore.createIndex("ssn", "ssn", { unique: true });

	objectStore.transaction.oncomplete = (event) => {
		console.log(event.target.result);
		const customerObjectStore = db
			.transaction("customers", "readwrite")
			.objectStore("customers");
		customerData.forEach(function (customer) {
			customerObjectStore.add(customer);
		});
	};
};

var objectStore = db
	.transaction(["customers"], "readwrite")
	.objectStore("customers");
var index = objectStore.index('ssn');
var request = objectStore.get("444-44-4444");
request.onsuccess = function (event) {
	const data = event.target.result;

	data.age = 42;

	const requestUpdate = objectStore.put(data);
};

var transaction = db.transaction(["customers"], "readwrite");
var objectStore = transaction.objectStore("customers");
objectStore.add({ ssn: "666-66-6666", name: "Billy", age: 37, email: "billy@company.com" });

var transaction = db.transaction(["customers"], "readwrite");
var objectStore = transaction.objectStore("customers");
objectStore.add({ ssn: "777-77-7777", name: "jane", age: 40, email: "jane@company.com" });

var transaction = db.transaction(["customers"], "readwrite");
var objectStore = transaction.objectStore("customers");
objectStore.add({ ssn: "888-88-8888", name: "kate", age: 40, email: "kate@company.com" });



const timestamp = new Promise((resolve, reject) => {
	const range = IDBKeyRange.upperBound("888-88-8888");
	var index = db.transaction(["customers"], "readwrite")
		.objectStore("customers").index('ssn');
	const req = index.openCursor(range, 'prev');
	let cur = [];
	let count = 0;

	req.onsuccess = function (event) {
		const cursor = event.target.result;
		if (cursor && count < 20) {
			alert(cursor.key + " " + cursor.value.name);
			cursor.continue();
			cur.unshift(cursor.value);
			count++;
		}
		else {
			resolve(cur)
		}
	};
	req.onerror = reject;
})
const promise = await timestamp.then((cur) => {
	return (cur)
}).catch((_event) => null);
console.log(promise);