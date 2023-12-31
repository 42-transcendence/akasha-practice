const me: { rating: number, RD: number } = { rating: 2100, RD: 200 };
const other: { rating: number, RD: number } = { rating: 2000, RD: 200 };
const RDdecreaseCoef = 199 / 200;
const RDincreaseCoef = 3 / 5;
const q = 0.0057565; // (ln10 / 400)



function RDincreaseByDate(RD: number, date: number) {
	return Math.sqrt((RD ** 2) + ((RDincreaseCoef * date) ** 2));
}

function g(RD: number): number {
	return 1 / Math.sqrt(1 + ((3 * (q ** 2) * (RD ** 2)) / (Math.PI ** 2)));
}

function E(myRating: number, other: { rating: number, RD: number }): number {
	const exponent = -1 * g(other.RD) * (myRating - other.rating) / 400;
	return (1 / (1 + Math.pow(10, exponent)));
}

function dSquare(myRating: number, other: { rating: number, RD: number }): number {
	const Evalue = E(myRating, other);
	return 1 / ((q ** 2) * (g(other.RD) ** 2) * Evalue * (1 - Evalue));
}

function glicko(me: { rating: number, RD: number }, other: { rating: number, RD: number }, result: number): { rating: number, RD: number } {
	if (result !== 1 && result !== 0 && result !== 1 / 2) {
		// error	
	}
	const newRating = me.rating + (q / ((1 / (me.RD ** 2)) + (1 / dSquare(me.rating, other)))) * (g(me.RD) * (result - E(me.rating, other)));
	const newRD = RDdecreaseCoef * me.RD;
	return { rating: newRating, RD: newRD };
}


console.log(glicko(me, other, 0));
console.log(glicko(me, other, 1 / 3));
console.log(glicko(me, other, 2 / 3));
console.log(glicko(me, other, 1));